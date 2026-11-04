/**
 * Adaptador real da GGT | Best Buy Hotels (GoGlobal).
 *
 * Fluxo:
 *  - search     → HOTEL_SEARCH (11) por cidade(s), resposta JSON, cache de 10 min;
 *  - getProduct → HOTEL_SEARCH por HotelId + HOTEL_INFO (61, em português, cache de 7 dias);
 *  - quote      → busca de novo (o HotelSearchCode expira em minutos) + BOOKING_VALUATION (9);
 *  - book       → procura a reserva pela nossa referência (nunca reserva 2x) → busca + valuation
 *                 → confere o preço → BOOKING_INSERT (2);
 *  - status     → BOOKING_STATUS (5).
 *
 * O optionId é estável (quartos + regime + reembolsável): o mesmo quarto é reencontrado em buscas
 * futuras mesmo com outro HotelSearchCode.
 */
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { hotelDestinations, type Currency, type PaxConfig, type PersonData, type PriceLine } from "@/server/db/schema";
import { addDays, todayLocal } from "@/lib/tz";
import { expiresAtFor } from "../mock/util";
import {
  type BookContext,
  type BookItem,
  type BookingResult,
  type OfferOption,
  type PaxRule,
  type ProductDetail,
  type ProductSummary,
  type Quote,
  type QuoteRequest,
  type SearchParams,
  type SupplierAdapter,
  SupplierError,
  SupplierIntegrationError,
} from "../types";
import { cached } from "../hotels/cache";
import {
  ascii,
  asCurrency,
  boardLabel,
  brDate,
  hotelGroupKey,
  htmlToText,
  money2,
  parseStars,
  parseSupplierDate,
  rankFacilities,
  splitName,
  stableId,
  starsText,
  titleCase,
  validateStay,
} from "../hotels/common";
import { destinationCount, parseCityName, resolveDestination, saveSupplierDestinations, supplierCodesFor, type DestinationRow } from "../hotels/destinations";
import { CHILD_MAX_AGE, HOTEL_MAX_ADULTS, HOTEL_MAX_CHILDREN, HOTEL_MAX_ROOMS, distributeRooms, normalizeHotelPax, occupancyLabel, paxKey, type RoomOccupancy } from "../hotels/occupancy";
import { GGT_OP, GgtClient, escapeXml, ggtConfig, isNoResults, isNotFound, isOfferGone, text, type GgtConfig } from "./client";

export const GGT_CODE = "GGT_BEST_BUY";
export const GGT_NAME = "GGT | Best Buy Hotels";

const SEARCH_TTL = 10 * 60;
const INFO_TTL = 7 * 24 * 3600;

// ───────────────────────── Tipos da resposta ─────────────────────────

type RawTax = { Type?: string; Detail?: string; Amount?: number | string; Currency?: string; Inclusive?: string };
type RawOffer = {
  HotelSearchCode: string;
  CxlDeadLine?: string;
  NonRef?: boolean;
  Rooms?: string[];
  RoomBasis?: string;
  Availability?: number;
  TotalPrice: number | string;
  Currency: string;
  Category?: string;
  Remark?: string;
  Special?: string;
  Preferred?: boolean;
  Tax?: RawTax[];
  Fee?: RawTax[];
};
type RawHotel = {
  HotelName: string;
  HotelCode: number | string;
  CountryId?: number;
  CityId?: number;
  Location?: string;
  Thumbnail?: string;
  HotelImage?: string;
  Longitude?: number;
  Latitude?: number;
  Offers?: RawOffer[];
};
type SearchResponse = { Header?: { Stats?: { HotelQty?: number; ResultsQty?: number } }; Hotels?: RawHotel[] };

export type GgtCharge = { label: string; amount: string; currency: string };
export type GgtOffer = {
  optionId: string;
  searchCode: string;
  rooms: string[];
  basis: string;
  nonRefundable: boolean;
  cancellationDeadline: string | null;
  total: string;
  currency: Currency;
  stars?: number;
  remark: string;
  special: string | null;
  payAtHotel: GgtCharge[];
};
export type GgtHotel = {
  id: string;
  name: string;
  cityId: string | null;
  location: string | null;
  image: string | null;
  lat: number | null;
  lng: number | null;
  stars?: number;
  offers: GgtOffer[];
};

// ───────────────────────── Normalização ─────────────────────────

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

export function offerOptionId(o: { rooms: string[]; basis: string; nonRefundable: boolean }): string {
  return stableId("ggt", ...o.rooms.map((r) => r.toUpperCase()), o.basis.toUpperCase(), o.nonRefundable ? "NR" : "RF");
}

function charges(list: RawTax[] | undefined): GgtCharge[] {
  return (list ?? [])
    .filter((t) => !/^inclusive$/i.test(clean(t.Inclusive)) && Number(t.Amount) > 0)
    .map((t) => ({ label: clean(t.Detail && t.Detail !== "Fees" ? t.Detail : t.Type) || "Taxas", amount: new Decimal(String(t.Amount)).toFixed(2), currency: clean(t.Currency).toUpperCase() || "USD" }));
}

export function normalizeOffer(o: RawOffer): GgtOffer | null {
  const currency = asCurrency(o.Currency);
  if (!currency || !o.HotelSearchCode || Number(o.Availability ?? 1) !== 1) return null;
  let total: string;
  try {
    total = money2(o.TotalPrice);
  } catch {
    return null;
  }
  if (Number(total) <= 0) return null;
  const rooms = (o.Rooms ?? []).map(clean).filter(Boolean);
  if (!rooms.length) return null;
  const basis = clean(o.RoomBasis).toUpperCase() || "RO";
  const nonRefundable = o.NonRef === true || String(o.NonRef).toLowerCase() === "true";
  const special = htmlToText(o.Special).replace(/\s+/g, " ").trim();
  const base = { rooms, basis, nonRefundable };
  return {
    ...base,
    optionId: offerOptionId(base),
    searchCode: String(o.HotelSearchCode),
    cancellationDeadline: nonRefundable ? null : parseSupplierDate(o.CxlDeadLine),
    total,
    currency,
    stars: parseStars(o.Category),
    remark: htmlToText(o.Remark),
    special: special || null,
    payAtHotel: [...charges(o.Tax), ...charges(o.Fee)],
  };
}

export function normalizeHotels(data: SearchResponse): GgtHotel[] {
  const out: GgtHotel[] = [];
  for (const h of data.Hotels ?? []) {
    const offers = (h.Offers ?? []).map(normalizeOffer).filter((o): o is GgtOffer => !!o);
    if (!offers.length || !h.HotelCode) continue;
    // mesma opção (quarto+regime+reembolso) em vários fornecedores internos → fica a mais barata
    const best = new Map<string, GgtOffer>();
    for (const o of offers) {
      const cur = best.get(o.optionId);
      if (!cur || (o.currency === cur.currency && new Decimal(o.total).lt(cur.total))) best.set(o.optionId, o);
    }
    const list = [...best.values()].sort((a, b) => new Decimal(a.total).comparedTo(b.total));
    out.push({
      id: String(h.HotelCode),
      name: clean(h.HotelName),
      cityId: h.CityId != null ? String(h.CityId) : null,
      location: clean(h.Location) || null,
      image: clean(h.HotelImage) || clean(h.Thumbnail) || null,
      lat: Number.isFinite(Number(h.Latitude)) && h.Latitude ? Number(h.Latitude) : null,
      lng: Number.isFinite(Number(h.Longitude)) && h.Longitude ? Number(h.Longitude) : null,
      stars: list.find((o) => o.stars)?.stars,
      offers: list,
    });
  }
  return out;
}

function roomsTitle(rooms: string[]): string {
  const names = rooms.map((r) => titleCase(r));
  const same = names.every((n) => n === names[0]);
  if (names.length > 1 && same) return `${names.length}× ${names[0]}`;
  return names.join(" + ");
}

function chargesNote(list: GgtCharge[]): string | null {
  if (!list.length) return null;
  const fmt = (c: GgtCharge) => `${c.currency} ${Number(c.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Pago direto no hotel: ${list.map((c) => `${translateCharge(c.label)} ${fmt(c)}`).join(" + ")}`;
}

function translateCharge(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("resort")) return "taxa de resort";
  if (l.includes("city")) return "taxa municipal";
  if (l.includes("tourist")) return "taxa de turismo";
  if (l.includes("clean")) return "taxa de limpeza";
  if (l.includes("parking")) return "estacionamento";
  return label.toLowerCase().includes("tax") ? "taxas locais" : label;
}

function cancellationText(o: GgtOffer): string {
  if (o.nonRefundable) return "Não reembolsável";
  if (!o.cancellationDeadline) return "Reembolsável (consulte a política)";
  const today = todayLocal();
  if (o.cancellationDeadline <= today) return "Sem cancelamento grátis";
  // A GGT informa o 1º dia de multa; o cancelamento é grátis até o dia anterior.
  return `Cancelamento grátis até ${brDate(addDays(o.cancellationDeadline, -1))}`;
}

function freeUntil(o: GgtOffer): string | null {
  if (o.nonRefundable || !o.cancellationDeadline) return null;
  const last = addDays(o.cancellationDeadline, -1);
  return last >= todayLocal() ? last : null;
}

function specialNote(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/^[\s.]+|[\s.]+$/g, "");
  if (!t) return null;
  const map: [RegExp, string][] = [
    [/early booking/i, "Desconto de compra antecipada"],
    [/long stay/i, "Desconto de estadia longa"],
    [/exclusive/i, "Desconto exclusivo"],
    [/special/i, "Desconto especial"],
    [/last minute/i, "Desconto de última hora"],
  ];
  return map.find(([r]) => r.test(t))?.[1] ?? null;
}

const HEADINGS: [RegExp, string][] = [
  [/^property location\b:?/i, "Localização:"],
  [/^rooms\b:?/i, "Quartos:"],
  [/^dining\b:?/i, "Restaurantes:"],
  [/^business,? other amenities\b:?/i, "Outras comodidades:"],
  [/^business amenities\b:?/i, "Comodidades para negócios:"],
  [/^amenities\b:?/i, "Comodidades:"],
  [/^attractions\b:?/i, "Atrações próximas:"],
  [/^recreation\b:?/i, "Lazer:"],
  [/^family friendly amenities\b:?/i, "Para a família:"],
  [/^accessibility\b:?/i, "Acessibilidade:"],
  [/^spoken languages\b:?/i, "Idiomas falados:"],
  [/^know before you go\b:?/i, "Antes de ir:"],
  [/^mandatory fees and taxes\b:?/i, "Taxas obrigatórias (pagas no hotel):"],
  [/^optional (fees|extras)\b:?/i, "Taxas opcionais:"],
  [/^fees\b:?/i, "Taxas:"],
  [/^special check-?in instructions\b:?/i, "Instruções especiais de check-in:"],
  [/^check-?in instructions\b:?/i, "Instruções de check-in:"],
  [/^check-?in end time\b:?/i, "Check-in até:"],
  [/^check-?in minimum age\b:?/i, "Idade mínima para o check-in:"],
  [/^check-?in time\b:?/i, "Check-in a partir de:"],
  [/^check-?out time\b:?/i, "Check-out até:"],
  [/^pets\b:?/i, "Animais de estimação:"],
  [/^policies\b:?/i, "Políticas:"],
];

/**
 * Descrição da GGT: remove "Property Desc:", traduz os títulos que vêm em inglês, transforma o
 * título em negrito do início do parágrafo em "Título:" e junta "Título:" com o texto seguinte.
 */
export function cleanDescription(t: string): string {
  const paras = t
    .split(/\n{2,}/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/^property desc:?$/i.test(l))
        .map((l) => HEADINGS.reduce((acc, [r, pt]) => acc.replace(r, pt), l))
        .join("\n"),
    )
    .filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const prev = out[out.length - 1];
    // parágrafo que é só um título ("Check-in a partir de:") junta com o seguinte
    if (prev && !prev.includes("\n") && /:$/.test(prev) && prev.length <= 60) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out.join("\n\n");
}

/** "<p><b>Quartos</b> Sinta-se…" → "<p>Quartos: Sinta-se…" (antes de virar texto). */
export function boldHeadingsToColon(html: string): string {
  return html.replace(/(^|<p[^>]*>|<br\s*\/?>)\s*<b>\s*([^<:]{2,60}?)\s*:?\s*<\/b>\s*(?=[^<\s])/gi, (_m, lead: string, title: string) => `${lead}${title}: `);
}

// ───────────────────────── Requisições ─────────────────────────

function roomsXml(rooms: RoomOccupancy[]): string {
  return rooms
    .map((r) => `<Room Adults="${r.adults}" RoomCount="1" ChildCount="${r.childAges.length}">${r.childAges.map((a) => `<ChildAge>${Math.max(1, a)}</ChildAge>`).join("")}</Room>`)
    .join("");
}

function searchXml(cfg: GgtConfig, opts: { cities?: string[]; hotels?: string[]; checkIn: string; nights: number; pax: PaxConfig }): string {
  const where = opts.hotels?.length
    ? `<Hotels>${opts.hotels.map((h) => `<HotelId>${escapeXml(h)}</HotelId>`).join("")}</Hotels>`
    : opts.cities!.map((c) => `<CityCode>${escapeXml(c)}</CityCode>`).join("");
  return (
    `<Main Version="2.3" ResponseFormat="JSON" IncludeGeo="true">` +
    `<SortOrder>1</SortOrder><MaximumWaitTime>15</MaximumWaitTime><MaxResponses>1000</MaxResponses>` +
    `<Nationality>${escapeXml(cfg.nationality)}</Nationality>${where}` +
    `<ArrivalDate>${opts.checkIn}</ArrivalDate><Nights>${opts.nights}</Nights>` +
    `<Rooms>${roomsXml(distributeRooms(opts.pax))}</Rooms></Main>`
  );
}

type Valuation = { searchCode: string; cancellationDeadline: string | null; remarks: string; policies: { from: string | null; mode: string; value: string; basedOn: string }[]; total: string | null; currency: string | null };

function parseValuation(main: Record<string, unknown>): Valuation {
  const rates = main.Rates as Record<string, unknown> | string | undefined;
  const rateText = text(rates);
  const rateCur = typeof rates === "object" && rates ? text(rates["@currency"] ?? rates["@Currency"]) : "";
  const pol = ((main.CancellationPolicies as Record<string, unknown> | undefined)?.Policy as Record<string, unknown>[] | undefined) ?? [];
  return {
    searchCode: text(main.HotelSearchCode),
    cancellationDeadline: parseSupplierDate(text(main.CancellationDeadline)),
    remarks: htmlToText(text(main.Remarks)),
    policies: pol.map((p) => ({ from: parseSupplierDate(text(p["@Starting"])), mode: text(p["@Mode"]), basedOn: text(p["@BasedOn"]), value: text(p) })),
    total: rateText && Number(rateText) > 0 ? money2(rateText) : null,
    currency: rateCur || null,
  };
}

// ───────────────────────── Adaptador ─────────────────────────

export function createGgtAdapter(cfg: GgtConfig, opts: { fetch?: typeof fetch } = {}): SupplierAdapter & {
  client: GgtClient;
  syncDestinations(): Promise<number>;
  searchHotels(params: { codes?: string[]; hotels?: string[]; checkIn: string; nights: number; pax: PaxConfig }, opts?: { fresh?: boolean }): Promise<GgtHotel[]>;
} {
  const client = new GgtClient(cfg, opts.fetch);
  let syncing: Promise<number> | null = null;

  async function syncDestinations(): Promise<number> {
    const csv = await client.destinationsCsv();
    const rows = parseDestinationsCsv(csv);
    return saveSupplierDestinations(GGT_CODE, rows);
  }

  /** Garante a lista de cidades no banco (baixa na primeira busca). */
  async function ensureDestinations() {
    if ((await destinationCount(GGT_CODE).catch(() => 1)) > 0) return;
    syncing ??= syncDestinations().finally(() => (syncing = null));
    await syncing;
  }

  /** Uma busca na GGT (uma cidade OU uma lista de hotéis). "Nenhum hotel encontrado" = lista vazia. */
  async function searchOnce(where: { city?: string; hotels?: string[] }, p: { checkIn: string; nights: number; pax: PaxConfig }): Promise<GgtHotel[]> {
    try {
      const data = await client.json<SearchResponse>(GGT_OP.HOTEL_SEARCH, searchXml(cfg, { cities: where.city ? [where.city] : undefined, hotels: where.hotels, checkIn: p.checkIn, nights: p.nights, pax: p.pax }), 30_000);
      return normalizeHotels(data);
    } catch (e) {
      if (isNoResults(e)) return [];
      throw e;
    }
  }

  /**
   * A GGT considera só a 1ª cidade quando recebe várias: cada cidade vira uma busca (em paralelo,
   * com cache próprio) e os hotéis são unidos sem repetição.
   */
  async function searchHotels(p: { codes?: string[]; hotels?: string[]; checkIn: string; nights: number; pax: PaxConfig }, o: { fresh?: boolean } = {}): Promise<GgtHotel[]> {
    const stayKey = `${p.checkIn}:${p.nights}:${paxKey(p.pax)}`;
    if (p.hotels?.length) {
      const load = () => searchOnce({ hotels: p.hotels }, p);
      return o.fresh ? load() : cached(`ggt:search:h${p.hotels.join(",")}:${stayKey}`, 5 * 60, load);
    }
    const codes = [...new Set(p.codes ?? [])];
    const settled = await Promise.allSettled(codes.map((city) => (o.fresh ? searchOnce({ city }, p) : cached(`ggt:search:c${city}:${stayKey}`, SEARCH_TTL, () => searchOnce({ city }, p)))));
    const ok = settled.filter((r): r is PromiseFulfilledResult<GgtHotel[]> => r.status === "fulfilled");
    if (!ok.length && settled.length) throw (settled[0] as PromiseRejectedResult).reason;
    const byId = new Map<string, GgtHotel>();
    for (const h of ok.flatMap((r) => r.value)) if (!byId.has(h.id)) byId.set(h.id, h);
    return [...byId.values()].sort((a, b) => new Decimal(a.offers[0].total).comparedTo(b.offers[0].total));
  }

  async function hotelInfo(id: string) {
    return cached(
      `ggt:info:${id}:${cfg.language}`,
      INFO_TTL,
      async () => {
        const m = await client.xml(GGT_OP.HOTEL_INFO, `<Main Version="2.2"><InfoHotelId>${escapeXml(id)}</InfoHotelId><InfoLanguage>${escapeXml(cfg.language)}</InfoLanguage></Main>`, 20_000);
        const pics = ((m.Pictures as Record<string, unknown> | undefined)?.Picture as unknown[] | undefined) ?? [];
        return {
          name: text(m.HotelName),
          address: text(m.Address),
          description: cleanDescription(htmlToText(boldHeadingsToColon(text(m.Description)))),
          hotelFacilities: rankFacilities(
            htmlToText(text(m.HotelFacilities))
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s && !/^may include:?$/i.test(s)),
          ),
          roomFacilities: htmlToText(text(m.RoomFacilities))
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s && !/^may include:?$/i.test(s)),
          category: parseStars(text(m.Category)),
          pictures: pics.map((p) => text(p)).filter((u) => /^https?:\/\//.test(u)),
        };
      },
      { cacheIf: (v) => !!v.name },
    ).catch(() => null);
  }

  function defaults(params: { checkIn?: string; checkOut?: string; pax?: Partial<PaxConfig> }) {
    const pax = normalizeHotelPax({ adults: 2, children: 0, rooms: 1, ...params.pax });
    const stay = validateStay(params.checkIn, params.checkOut);
    return { pax, ...stay };
  }

  function stayLine(o: GgtOffer, nights: number, pax: PaxConfig): PriceLine {
    const rooms = pax.rooms ?? 1;
    return {
      type: "STAY",
      label: `Hospedagem · ${nights} noite${nights > 1 ? "s" : ""} · ${rooms} quarto${rooms > 1 ? "s" : ""} · ${boardLabel(o.basis)}`,
      unitCost: o.total,
      quantity: 1,
    };
  }

  function paxRules(): PaxRule[] {
    return [
      { type: "ROOM", label: "Quartos", min: 1, max: HOTEL_MAX_ROOMS },
      { type: "ADULT", label: "Adultos", min: 1, max: HOTEL_MAX_ADULTS },
      { type: "CHILD", label: "Crianças", hint: `0 a ${CHILD_MAX_AGE} anos`, min: 0, max: HOTEL_MAX_CHILDREN, ages: { min: 0, max: CHILD_MAX_AGE } },
    ];
  }

  function summary(h: GgtHotel, destinationLabel: string, nights: number, pax: PaxConfig): ProductSummary {
    const best = h.offers[0];
    const breakfast = h.offers.some((o) => o.basis !== "RO");
    const refundable = h.offers.some((o) => !o.nonRefundable);
    return {
      supplierCode: GGT_CODE,
      supplierName: GGT_NAME,
      category: "LODGING",
      productId: h.id,
      title: titleCase(h.name),
      subtitle: [starsText(h.stars), breakfast ? "Opção com café da manhã" : null, refundable ? "Opção reembolsável" : null].filter(Boolean).join(" · ") || undefined,
      location: h.location ? `${titleCase(h.location)} · ${destinationLabel}` : destinationLabel,
      destination: destinationLabel,
      imageUrl: h.image,
      tags: [breakfast ? "Café da manhã" : null, refundable ? "Reembolsável" : null].filter((x): x is string => !!x),
      currency: best.currency,
      lines: [stayLine(best, nights, pax)],
      groupKey: hotelGroupKey(h.name),
    };
  }

  /**
   * Busca o hotel de novo e acha a opção pelo optionId estável (mais barata primeiro).
   * A GGT agrupa quartos equivalentes de mesmo preço e, a cada resposta, mostra um nome diferente
   * do grupo (ex.: "ROOM 2 DOUBLE BEDS" × "ROOM 2 DOUBLE BEDS SMOKING"). Nunca trocamos o quarto
   * escolhido por outro parecido: repetimos a consulta (rápida) até reencontrá-lo.
   */
  async function freshOffers(hotelId: string, optionId: string, stay: { checkIn: string; nights: number }, pax: PaxConfig, attempts = 4) {
    let hotel: GgtHotel | undefined;
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 300));
      const hotels = await searchHotels({ hotels: [hotelId], checkIn: stay.checkIn, nights: stay.nights, pax }, { fresh: true });
      hotel = hotels.find((h) => h.id === hotelId) ?? hotel;
      const offers = hotels.find((h) => h.id === hotelId)?.offers.filter((o) => o.optionId === optionId) ?? [];
      if (offers.length) return { hotel, offers };
    }
    return { hotel, offers: [] as GgtOffer[] };
  }

  async function valuate(o: GgtOffer, checkIn: string): Promise<Valuation> {
    const main = await client.xml(GGT_OP.BOOKING_VALUATION, `<Main Version="2.4"><HotelSearchCode>${escapeXml(o.searchCode)}</HotelSearchCode><ArrivalDate>${checkIn}</ArrivalDate></Main>`, 30_000);
    return parseValuation(main);
  }

  /** Primeira oferta que passa na valuation (as outras podem ter acabado de esgotar). */
  async function valuateFirst(offers: GgtOffer[], checkIn: string): Promise<{ offer: GgtOffer; valuation: Valuation } | null> {
    for (const o of offers.slice(0, 3)) {
      try {
        const v = await valuate(o, checkIn);
        const offer = v.total && (!v.currency || v.currency.toUpperCase() === o.currency) ? { ...o, total: v.total } : o;
        return { offer, valuation: v };
      } catch (e) {
        if (isOfferGone(e)) continue;
        throw e;
      }
    }
    return null;
  }

  /** Reserva já feita com a nossa referência (AgentReference) — evita reservar duas vezes. */
  async function findBooking(item: BookItem): Promise<BookingResult | null> {
    if (!item.reference) return null;
    const from = addDays(todayLocal(), -60);
    const to = addDays(todayLocal(), 1);
    try {
      const m = await client.xml(
        GGT_OP.ADV_BOOKING_SEARCH,
        `<Main Version="2.0" IncludeHotelConfirmation="true"><ClientBookingCode>${escapeXml(item.reference)}</ClientBookingCode><CreatedDateRangeFrom>${from}</CreatedDateRangeFrom><CreatedDateRangeTo>${to}</CreatedDateRangeTo></Main>`,
        30_000,
      );
      const list = ((m.Bookings as Record<string, unknown> | undefined)?.Booking as Record<string, unknown>[] | undefined) ?? [];
      const live = list.filter((b) => !["X", "XP", "RJ"].includes(text(b.BookingStatus)));
      const b = live[0] ?? list[0];
      if (!b) return null;
      return bookingResult(b);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  return {
    code: GGT_CODE,
    name: GGT_NAME,
    category: "LODGING",
    defaultCurrency: "USD",
    live: true,
    client,
    syncDestinations,
    searchHotels,
    destinations: () => [],

    async search(params: SearchParams) {
      if (!params.destination?.trim() && !params.destinationKey) return [];
      const { pax, checkIn, nights } = defaults(params);
      await ensureDestinations();
      const dest = await resolveDestination(params.destination, params.destinationKey);
      if (!dest) return [];
      const codes = await supplierCodesFor(GGT_CODE, dest);
      if (!codes.length) return [];
      const hotels = await searchHotels({ codes, checkIn, nights, pax });
      return hotels.map((h) => summary(h, dest.label, nights, pax));
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      if (!/^\d+$/.test(productId)) return null;
      const { pax, checkIn, nights } = defaults(params);
      const [hotels, info] = await Promise.all([searchHotels({ hotels: [productId], checkIn, nights, pax }), hotelInfo(productId)]);
      const h = hotels.find((x) => x.id === productId);
      if (!h && !info) return null;
      const name = h?.name ?? info!.name;
      const stars = h?.stars ?? info?.category;
      const destination = params.destination?.split(",")[0]?.trim() || (h?.cityId ? await cityLabel(h.cityId) : null) || "";
      const options: OfferOption[] = (h?.offers ?? []).map((o) => ({
        optionId: o.optionId,
        title: roomsTitle(o.rooms),
        description: boardLabel(o.basis),
        currency: o.currency,
        lines: [stayLine(o, nights, pax)],
        attributes: [
          { label: "Regime", value: boardLabel(o.basis) },
          { label: "Cancelamento", value: cancellationText(o) },
        ],
        freeCancellationUntil: freeUntil(o),
        notes: [chargesNote(o.payAtHotel), specialNote(o.special)].filter((x): x is string => !!x),
        available: true,
      }));
      const base: ProductSummary = h
        ? summary(h, destination, nights, pax)
        : {
            supplierCode: GGT_CODE,
            supplierName: GGT_NAME,
            category: "LODGING",
            productId,
            title: titleCase(name),
            subtitle: starsText(stars) || undefined,
            location: info?.address || destination,
            destination,
            imageUrl: info?.pictures[0] ?? null,
            tags: [],
            currency: "USD",
            lines: [],
            groupKey: hotelGroupKey(name),
          };
      const gallery = info?.pictures?.length ? info.pictures : h?.image ? [h.image] : [];
      return {
        ...base,
        location: info?.address ? titleCase(info.address) : base.location,
        imageUrl: gallery[0] ?? base.imageUrl,
        description: info?.description || "Descrição do hotel indisponível no momento.",
        gallery,
        highlights: (info?.hotelFacilities ?? []).slice(0, 8),
        options,
        paxRules: paxRules(),
        info: [
          ...(stars ? [{ label: "Categoria", value: `${stars.toLocaleString("pt-BR")} estrela${stars > 1 ? "s" : ""}` }] : []),
          { label: "Estadia", value: `${nights} noite${nights > 1 ? "s" : ""}` },
          { label: "Hóspedes", value: occupancyLabel(pax) },
          { label: "Fornecedor", value: GGT_NAME },
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      if (!/^\d+$/.test(req.productId) || !req.optionId) throw new SupplierError("Quarto inválido — escolha novamente no hotel");
      const pax = normalizeHotelPax(req.pax);
      const stay = validateStay(req.checkIn, req.checkOut);
      const { hotel, offers } = await freshOffers(req.productId, req.optionId, stay, pax);
      if (!hotel || !offers.length) throw new SupplierError("Este quarto não está mais disponível para estas datas e hóspedes. Escolha outra opção no hotel.");
      const ok = await valuateFirst(offers, stay.checkIn);
      if (!ok) throw new SupplierError("Este quarto acabou de esgotar. Escolha outra opção no hotel.");
      const { offer, valuation } = ok;
      const info = await hotelInfo(req.productId);
      const deadline = valuation.cancellationDeadline ?? offer.cancellationDeadline;
      const o = { ...offer, cancellationDeadline: offer.nonRefundable ? null : deadline };
      return {
        supplierCode: GGT_CODE,
        category: "LODGING",
        productId: req.productId,
        optionId: req.optionId,
        title: titleCase(hotel.name),
        subtitle: `${roomsTitle(o.rooms)} · ${boardLabel(o.basis)} · ${stay.nights} noite${stay.nights > 1 ? "s" : ""}`,
        location: info?.address ? titleCase(info.address) : hotel.location ? titleCase(hotel.location) : null,
        imageUrl: info?.pictures[0] ?? hotel.image,
        serviceDate: stay.checkIn,
        serviceEndDate: stay.checkOut,
        expiresAt: expiresAtFor(stay.checkIn),
        currency: o.currency,
        lines: [stayLine(o, stay.nights, pax)],
        pax,
        paxRules: paxRules(),
        details: {
          supplierHotelId: req.productId,
          hotelName: titleCase(hotel.name),
          address: info?.address ?? null,
          rooms: o.rooms.map(titleCase),
          board: boardLabel(o.basis),
          boardCode: o.basis,
          nights: stay.nights,
          occupancy: distributeRooms(pax),
          nonRefundable: o.nonRefundable,
          cancellation: cancellationText(o),
          freeCancellationUntil: freeUntil(o),
          cancellationPolicies: valuation.policies,
          payAtHotel: o.payAtHotel,
          notes: [chargesNote(o.payAtHotel), specialNote(o.special)].filter(Boolean),
          remarks: valuation.remarks || o.remark,
          hotelSearchCode: o.searchCode,
          valuatedAt: new Date().toISOString(),
        },
        quoteRef: o.searchCode,
      };
    },

    findBooking,

    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      if (!item.optionId) throw new SupplierError("Reserva sem quarto definido");
      if (!item.reference) throw new SupplierIntegrationError("Reserva sem referência interna");
      const pax = normalizeHotelPax(item.pax);
      const checkIn = item.serviceDate ?? undefined;
      const checkOut = item.serviceEndDate ?? undefined;
      const stay = validateStay(checkIn, checkOut);
      const rooms = distributeRooms(pax);
      const guests = assignGuests(rooms, ctx.travelers, ctx.holder);

      // 1) já existe? (tentativa anterior que caiu no meio)
      const existing = await findBooking(item);
      if (existing) return { ...existing, payload: { ...existing.payload, recoveredExisting: true } };

      // 2) preço atual da mesma opção
      const { offers } = await freshOffers(item.productId, item.optionId, stay, pax);
      if (!offers.length) throw new SupplierError("O quarto vendido não está mais disponível no fornecedor");
      const ok = await valuateFirst(offers, stay.checkIn);
      if (!ok) throw new SupplierError("O quarto vendido esgotou no fornecedor");
      const { offer } = ok;
      if (item.maxCost) {
        if (item.maxCost.currency !== offer.currency) throw new SupplierError(`O fornecedor mudou a moeda da tarifa (${offer.currency})`);
        if (new Decimal(offer.total).gt(item.maxCost.amount))
          throw new SupplierError(`O fornecedor aumentou o preço: ${offer.currency} ${offer.total} (vendido por ${item.maxCost.amount})`);
      }

      // 3) reserva
      const roomTypes = groupByAdults(rooms, guests);
      const xml =
        `<Main Version="2.3" IncludeHotelConfirmation="true">` +
        `<AgentReference>${escapeXml(item.reference)}</AgentReference>` +
        `<HotelSearchCode>${escapeXml(offer.searchCode)}</HotelSearchCode>` +
        `<ArrivalDate>${stay.checkIn}</ArrivalDate><Nights>${stay.nights}</Nights>` +
        `<NoAlternativeHotel>1</NoAlternativeHotel><Leader LeaderPersonID="1"/>` +
        `<Rooms>${roomTypes}</Rooms>` +
        (ctx.remark ? `<Remark>${escapeXml(ascii(ctx.remark).slice(0, 500))}</Remark>` : "") +
        `</Main>`;
      let main: Record<string, unknown>;
      try {
        main = await client.xml(GGT_OP.BOOKING_INSERT, xml, 120_000);
      } catch (e) {
        if (e instanceof SupplierIntegrationError && e.detail?.timeout) {
          // Pode ter reservado mesmo sem resposta: confere pela referência antes de desistir.
          const again = await findBooking(item).catch(() => null);
          if (again) return { ...again, payload: { ...again.payload, recoveredAfterTimeout: true } };
        }
        throw e;
      }
      const result = bookingResult(main);
      if (!result.bookingRef) throw new SupplierIntegrationError("A GGT não devolveu o código da reserva", { response: main });
      return { ...result, payload: { ...result.payload, agentReference: item.reference, bookedPrice: offer.total, currency: offer.currency } };
    },

    async bookingStatus(bookingRef: string): Promise<BookingResult> {
      const m = await client.xml(GGT_OP.BOOKING_SEARCH, `<Main Version="2.0" IncludeHotelConfirmation="true"><GoBookingCode>${escapeXml(bookingRef)}</GoBookingCode></Main>`, 30_000);
      return bookingResult(m);
    },
  };
}

// ───────────────────────── Reserva: hóspedes ─────────────────────────

type Guest = { title: string; first: string; last: string; age?: number };

/** Distribui os nomes nos quartos: adultos (titular primeiro) e crianças com a idade cotada. */
export function assignGuests(rooms: RoomOccupancy[], travelers: PersonData[], holder?: PersonData | null): { adults: Guest[][]; children: Guest[][] } {
  const adultsList = travelers.filter((t) => t.type !== "CHILD" && t.name?.trim());
  const childList = travelers.filter((t) => t.type === "CHILD" && t.name?.trim());
  if (!adultsList.length && holder?.name) adultsList.push({ ...holder, type: "ADULT" });
  const needAdults = rooms.reduce((s, r) => s + r.adults, 0);
  const needChildren = rooms.reduce((s, r) => s + r.childAges.length, 0);
  if (adultsList.length < needAdults) throw new SupplierError(`Faltam nomes de hóspedes adultos (${adultsList.length} de ${needAdults})`);
  if (childList.length < needChildren) throw new SupplierError(`Faltam nomes das crianças (${childList.length} de ${needChildren})`);
  let ai = 0;
  let ci = 0;
  const adults = rooms.map((r) =>
    Array.from({ length: r.adults }, () => {
      const t = adultsList[ai++];
      const n = splitName(t.name);
      return { title: t.title === "MRS" ? "MRS." : t.title === "MS" ? "MS." : "MR.", first: ascii(n.first), last: ascii(n.last) };
    }),
  );
  const children = rooms.map((r) =>
    r.childAges.map((age) => {
      const t = childList[ci++];
      const n = splitName(t.name);
      return { title: "", first: ascii(n.first), last: ascii(n.last), age };
    }),
  );
  return { adults, children };
}

/** <RoomType Adults="N"><Room RoomID=".."><PersonName/>…<ExtraBed/></Room></RoomType> na ordem da busca. */
function groupByAdults(rooms: RoomOccupancy[], guests: { adults: Guest[][]; children: Guest[][] }): string {
  let person = 1;
  const roomXml = rooms.map((r, i) => {
    const people = guests.adults[i]
      .map((g) => `<PersonName PersonID="${person++}" Title="${escapeXml(g.title)}" FirstName="${escapeXml(g.first)}" LastName="${escapeXml(g.last)}"/>`)
      .join("");
    const kids = guests.children[i]
      .map((g) => `<ExtraBed PersonID="${person++}" FirstName="${escapeXml(g.first)}" LastName="${escapeXml(g.last)}" ChildAge="${Math.max(1, g.age ?? 1)}"/>`)
      .join("");
    return { adults: r.adults, xml: `<Room RoomID="${i + 1}">${people}${kids}</Room>` };
  });
  const groups: { adults: number; rooms: string[] }[] = [];
  for (const r of roomXml) {
    const g = groups[groups.length - 1];
    if (g && g.adults === r.adults) g.rooms.push(r.xml);
    else groups.push({ adults: r.adults, rooms: [r.xml] });
  }
  return groups.map((g) => `<RoomType Adults="${g.adults}">${g.rooms.join("")}</RoomType>`).join("");
}

const STATUS: Record<string, string> = { C: "CONFIRMED", VCH: "CONFIRMED", VRQ: "CONFIRMED", RQ: "PENDING", RX: "CANCEL_REQUESTED", X: "CANCELLED", XP: "CANCELLED", RJ: "REJECTED" };

function bookingResult(b: Record<string, unknown>): BookingResult {
  const codeNode = b.GoBookingCode as Record<string, unknown> | string | undefined;
  const code = text(codeNode);
  const raw = text(b.BookingStatus) || (typeof codeNode === "object" && codeNode ? text(codeNode["@Status"]) : "");
  return {
    bookingRef: code,
    status: STATUS[raw] ?? (raw || "PENDING"),
    payload: {
      supplierStatus: raw,
      goReference: text(b.GoReference) || (typeof codeNode === "object" && codeNode ? text(codeNode["@GoReference"]) : "") || null,
      hotelConfirmation: text(b.HotelConfirmation) || null,
      totalPrice: text(b.TotalPrice) || (typeof codeNode === "object" && codeNode ? text(codeNode["@TotalPrice"]) : "") || null,
      currency: text(b.Currency) || (typeof codeNode === "object" && codeNode ? text(codeNode["@Currency"]) : "") || null,
      cancellationDeadline: parseSupplierDate(text(b.CancellationDeadline)),
      hotelName: text(b.HotelName) || null,
      arrivalDate: text(b.ArrivalDate) || null,
      nights: text(b.Nights) || null,
      clientReference: text(b.ClientBookingCode) || null,
    },
  };
}

// ───────────────────────── Destinos ─────────────────────────

/** CSV "CityId"|"City"|"CountryId"|"Country"|"IsoCode" → linhas de destino. */
export function parseDestinationsCsv(csv: string): DestinationRow[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  const iId = idx("cityid");
  const iCity = idx("city");
  const iCountry = idx("country");
  const iIso = idx("isocode");
  if (iId < 0 || iCity < 0) throw new SupplierIntegrationError("GGT destinos: formato de CSV inesperado");
  const out: DestinationRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = splitCsvLine(line);
    const code = f[iId]?.trim();
    const name = f[iCity]?.trim();
    if (!code || !name || !/^\d+$/.test(code)) continue;
    const parsed = parseCityName(name, "GGT");
    if (!parsed.searchKey) continue;
    out.push({
      supplierCode: GGT_CODE,
      code,
      name,
      city: parsed.city,
      region: parsed.region,
      countryCode: (f[iIso] ?? "").trim().toUpperCase() || null,
      countryName: iCountry >= 0 ? titleCase((f[iCountry] ?? "").trim()) || null : null,
      searchKey: parsed.searchKey,
    });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "|") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function cityLabel(cityId: string): Promise<string | null> {
  try {
    const [r] = await getDb()
      .select({ city: hotelDestinations.city })
      .from(hotelDestinations)
      .where(and(eq(hotelDestinations.supplierCode, GGT_CODE), eq(hotelDestinations.code, cityId)));
    return r?.city ?? null;
  } catch {
    return null;
  }
}

export function createGgtFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const cfg = ggtConfig(env);
  return cfg ? createGgtAdapter(cfg) : null;
}
