/**
 * Adaptador real da Hotelbeds (APItude Booking API + Content API).
 *
 * Fluxo:
 *  - search     → POST /hotels (disponibilidade por destino) + fotos da Content API (cache);
 *  - getProduct → POST /hotels filtrando o hotel + GET /hotels/{código}/details (cache de 30 dias);
 *  - quote      → disponibilidade de novo + POST /checkrates (preço final, comentários da tarifa);
 *  - book       → procura pela nossa referência (nunca reserva 2x) → disponibilidade → checkrate se
 *                 RECHECK → confere o preço → POST /bookings;
 *  - status     → GET /bookings/{referência}.
 *
 * Uma "opção" = mesmo quarto + regime + reembolsável para TODOS os quartos pedidos. Quartos com a
 * mesma ocupação vão juntos (rooms: N, uma tarifa); ocupações diferentes têm tarifas separadas.
 * Ficam de fora tarifas "AT_HOTEL" (cliente pagaria no hotel) e de pacote (packaging), que não
 * podem ser vendidas sozinhas.
 */
import Decimal from "decimal.js";
import type { Currency, PaxConfig, PriceLine } from "@/server/db/schema";
import { addDays, todayLocal } from "@/lib/tz";
import { expiresAtFor } from "../mock/util";
import {
  type BookContext,
  type BookItem,
  type BookingResult,
  type CancelResult,
  type HotelContent,
  type OfferOption,
  type PaxRule,
  type ProductDetail,
  type ProductSummary,
  type Quote,
  type QuoteRequest,
  type RoomContent,
  type SearchParams,
  type SupplierAdapter,
  SupplierError,
  SupplierIntegrationError,
} from "../types";
import { cached, cacheGet, cacheSet } from "../hotels/cache";
import { EMPTY_HOTEL_CONTENT, formatMeters, groupAmenities, hbImageTag, hhmm, issuesDuring, roomAmenitiesFrom } from "../hotels/content";
import { asCurrency, boardLabel, brDate, hotelGroupKey, htmlToText, money2, parseStars, rankFacilities, splitName, stableId, starsText, titleCase, validateStay } from "../hotels/common";
import { destinationCount, parseCityName, resolveDestination, saveSupplierDestinations, supplierCodesFor, type DestinationRow } from "../hotels/destinations";
import { CHILD_MAX_AGE, HOTEL_MAX_ADULTS, HOTEL_MAX_CHILDREN, HOTEL_MAX_ROOMS, distributeRooms, normalizeHotelPax, occupancyKey, occupancyLabel, paxKey, type RoomOccupancy } from "../hotels/occupancy";
import { assignGuests } from "../ggt/adapter";
import { HotelbedsApiError, HotelbedsClient, hotelbedsConfig, type HotelbedsConfig, type Transport } from "./client";

export const HB_CODE = "HOTELBEDS";
export const HB_NAME = "Hotelbeds";
const PHOTO_BASE = "https://photos.hotelbeds.com/giata/bigger/"; // ~800 px (cards)
const PHOTO_BASE_XL = "https://photos.hotelbeds.com/giata/xl/"; // ~1024 px (galeria do hotel)
/** Disponibilidade reaproveitada da busca para o hotel e a cotação (a Hotelbeds não quer repetição). */
const SEARCH_TTL = 20 * 60;
/** A Hotelbeds recomenda atualizar o conteúdo pelo menos uma vez por semana. */
const CONTENT_TTL = 7 * 24 * 3600;

// ───────────────────────── Tipos da API ─────────────────────────

type HbTax = { included?: boolean; amount?: string; currency?: string; type?: string; subType?: string; clientAmount?: string; clientCurrency?: string };
type HbCancel = { amount?: string; from?: string };
export type HbRate = {
  rateKey: string;
  rateClass?: string;
  rateType?: "BOOKABLE" | "RECHECK";
  net: string;
  sellingRate?: string;
  hotelMandatory?: boolean;
  /** Presente no modelo comissionado (preço final = sellingRate). */
  commission?: string;
  rateComments?: string;
  rateCommentsId?: string;
  paymentType?: string;
  packaging?: boolean;
  boardCode?: string;
  boardName?: string;
  cancellationPolicies?: HbCancel[];
  taxes?: { allIncluded?: boolean; taxes?: HbTax[] };
  rooms: number;
  adults: number;
  children: number;
  childrenAges?: string;
  promotions?: { code?: string; name?: string }[];
  offers?: { name?: string }[];
};
type HbRoom = { code: string; name?: string; rates?: HbRate[] };
export type HbHotel = {
  code: number;
  name: string;
  categoryCode?: string;
  categoryName?: string;
  destinationCode?: string;
  destinationName?: string;
  zoneName?: string;
  latitude?: string;
  longitude?: string;
  rooms?: HbRoom[];
  currency?: string;
  totalNet?: string | number;
  paymentDataRequired?: boolean;
};
type AvailabilityRS = { hotels?: { hotels?: HbHotel[]; total?: number } };
type CheckRateRS = { hotel?: HbHotel & { totalNet?: string | number; modificationPolicies?: { cancellation?: boolean; modification?: boolean } } };
type BookingRS = { booking?: HbBooking };
/** Hotel da disponibilidade sem a lista crua de quartos (as opções já montadas vão junto no cache). */
type HbHotelLite = Pick<HbHotel, "code" | "name" | "categoryCode" | "categoryName" | "destinationName" | "zoneName" | "currency" | "paymentDataRequired">;
export type HbHotelOffer = { hotel: HbHotelLite; options: HbOption[] };
type HbBooking = {
  reference: string;
  cancellationReference?: string;
  clientReference?: string;
  status?: string;
  creationDate?: string;
  totalNet?: number | string;
  pendingAmount?: number | string;
  currency?: string;
  holder?: { name?: string; surname?: string };
  invoiceCompany?: { code?: string; name?: string; registrationNumber?: string };
  hotel?: HbHotel & { supplier?: { name?: string; vatNumber?: string }; checkIn?: string; checkOut?: string; cancellationAmount?: string | number };
  modificationPolicies?: { cancellation?: boolean; modification?: boolean };
};

// ───────────────────────── Opções ─────────────────────────

/** Ocupações agrupadas mantendo o índice de cada quarto na distribuição (para os nomes). */
export type OccGroup = RoomOccupancy & { count: number; roomIndexes: number[] };

export function occupancyGroups(pax: PaxConfig): OccGroup[] {
  const groups: OccGroup[] = [];
  distributeRooms(pax).forEach((r, i) => {
    const g = groups.find((x) => occupancyKey(x) === occupancyKey(r));
    if (g) {
      g.count++;
      g.roomIndexes.push(i);
    } else groups.push({ adults: r.adults, childAges: [...r.childAges].sort((a, b) => a - b), count: 1, roomIndexes: [i] });
  });
  return groups;
}

export function occupanciesBody(groups: OccGroup[]) {
  return groups.map((g) => ({
    rooms: g.count,
    adults: g.adults,
    children: g.childAges.length,
    ...(g.childAges.length ? { paxes: g.childAges.map((age) => ({ type: "CH", age })) } : {}),
  }));
}

const ages = (s: string | undefined) => (s ?? "").match(/\d+/g)?.map(Number).sort((a, b) => a - b).join(",") ?? "";

function rateMatches(r: HbRate, g: OccGroup): boolean {
  return Number(r.rooms) === g.count && Number(r.adults) === g.adults && Number(r.children) === g.childAges.length && (g.childAges.length === 0 || ages(r.childrenAges) === g.childAges.join(","));
}

export function isRefundable(r: HbRate): boolean {
  return (r.rateClass ?? "").toUpperCase() !== "NRF";
}

/** Tarifas que podemos vender (pagamento antecipado, fora de pacote). */
export function sellable(r: HbRate): boolean {
  return r.paymentType !== "AT_HOTEL" && r.packaging !== true && !!r.rateKey && Number(r.net) > 0;
}

export type HbOption = {
  optionId: string;
  roomCode: string;
  roomName: string;
  boardCode: string;
  boardName: string;
  refundable: boolean;
  rates: HbRate[];
  total: string;
  currency: Currency;
};

export function buildOptions(h: HbHotel, groups: OccGroup[]): HbOption[] {
  const currency = asCurrency(h.currency);
  if (!currency) return [];
  const best = new Map<string, HbOption>();
  for (const room of h.rooms ?? []) {
    const byCombo = new Map<string, HbRate[]>();
    for (const r of (room.rates ?? []).filter(sellable)) {
      const k = `${(r.boardCode ?? "RO").toUpperCase()}|${isRefundable(r) ? "RF" : "NR"}`;
      byCombo.set(k, [...(byCombo.get(k) ?? []), r]);
    }
    for (const [k, rates] of byCombo) {
      const [boardCode, rf] = k.split("|");
      // a tarifa mais barata para cada grupo de ocupação
      const chosen: HbRate[] = [];
      for (const g of groups) {
        const c = rates.filter((r) => rateMatches(r, g)).sort((a, b) => new Decimal(a.net).comparedTo(b.net))[0];
        if (!c) break;
        chosen.push(c);
      }
      if (chosen.length !== groups.length) continue;
      const total = chosen.reduce((s, r) => s.plus(r.net), new Decimal(0));
      const optionId = stableId("hb", room.code, boardCode, rf);
      const opt: HbOption = {
        optionId,
        roomCode: room.code,
        roomName: titleCase(room.name ?? room.code),
        boardCode,
        boardName: chosen[0].boardName ?? boardCode,
        refundable: rf === "RF",
        rates: chosen,
        total: money2(total.toFixed(2)),
        currency,
      };
      const cur = best.get(optionId);
      if (!cur || new Decimal(opt.total).lt(cur.total)) best.set(optionId, opt);
    }
  }
  return [...best.values()].sort((a, b) => new Decimal(a.total).comparedTo(b.total));
}

/** Data a partir da qual há multa (a mais cedo entre as tarifas). */
function penaltyFrom(rates: HbRate[]): string | null {
  const dates = rates.flatMap((r) => (r.cancellationPolicies ?? []).map((c) => c.from?.slice(0, 10))).filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.length ? dates.sort()[0] : null;
}

export function freeCancellationUntil(o: Pick<HbOption, "refundable" | "rates">): string | null {
  if (!o.refundable) return null;
  const from = penaltyFrom(o.rates);
  if (!from) return null;
  const last = addDays(from, -1);
  return last >= todayLocal() ? last : null;
}

function cancellationText(o: Pick<HbOption, "refundable" | "rates">): string {
  if (!o.refundable) return "Não reembolsável";
  const until = freeCancellationUntil(o);
  if (until) return `Cancelamento grátis até ${brDate(until)}`;
  return penaltyFrom(o.rates) ? "Sem cancelamento grátis" : "Reembolsável (consulte a política)";
}

type Charge = { label: string; amount: string; currency: string };
export function payAtHotel(rates: HbRate[]): Charge[] {
  const out: Charge[] = [];
  for (const r of rates)
    for (const t of r.taxes?.taxes ?? []) {
      if (t.included !== false || !(Number(t.amount) > 0)) continue;
      out.push({ label: t.subType || (t.type === "FEE" ? "Taxa" : "Taxas locais"), amount: new Decimal(String(t.amount)).toFixed(2), currency: (t.currency ?? "").toUpperCase() });
    }
  return out;
}

function chargesNote(list: Charge[]): string | null {
  if (!list.length) return null;
  const fmt = (c: Charge) => `${c.currency} ${Number(c.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Pago direto no hotel: ${list.map((c) => `${c.label.toLowerCase().includes("resort") ? "taxa de resort" : c.label.toLowerCase().includes("city") ? "taxa municipal" : "taxas locais"} ${fmt(c)}`).join(" + ")}`;
}

/**
 * Preço mínimo de venda: tarifa com hotelMandatory (modelo net) ou comissionada (preço final =
 * sellingRate). Para cada quarto vale o sellingRate quando exigido; senão, o net.
 */
export function minSellPriceFor(o: Pick<HbOption, "rates" | "currency">): { currency: HbOption["currency"]; amount: string } | null {
  const required = (r: HbRate) => !!r.sellingRate && Number(r.sellingRate) > 0 && (r.hotelMandatory === true || (r.commission != null && r.commission !== ""));
  if (!o.rates.some(required)) return null;
  const amount = o.rates.reduce((s, r) => s.plus(required(r) ? r.sellingRate! : r.net), new Decimal(0));
  return { currency: o.currency, amount: amount.toFixed(2) };
}

const PROMO_PT: [RegExp, string][] = [
  [/non-?refundable/i, "Tarifa não reembolsável — não permite alterações"],
  [/early booking/i, "Desconto de compra antecipada"],
  [/long stay/i, "Desconto de estadia longa"],
  [/last minute/i, "Oferta de última hora"],
  [/free night/i, "Noite grátis incluída"],
];

/** Avisos da opção: taxas no hotel, multa de cancelamento e promoções da tarifa. */
export function optionNotes(o: Pick<HbOption, "rates" | "refundable" | "currency">): string[] {
  const notes: string[] = [];
  const charges = chargesNote(payAtHotel(o.rates));
  if (charges) notes.push(charges);
  const penalty = penaltyNote(o);
  if (penalty) notes.push(penalty);
  for (const name of new Set(o.rates.flatMap((r) => (r.promotions ?? []).map((p) => (p.name ?? "").trim())).filter(Boolean))) {
    const pt = PROMO_PT.find(([re]) => re.test(name))?.[1];
    if (pt && /não reembolsável/.test(pt) && !o.refundable) continue; // já aparece no selo de cancelamento
    const text = pt ?? `Promoção da tarifa: ${name}`;
    if (!notes.includes(text)) notes.push(text);
  }
  return notes;
}

/** "A partir de 29/12/2026 (horário do hotel), multa de cancelamento de USD 120,00" (1ª data, somando os quartos). */
function penaltyNote(o: Pick<HbOption, "rates" | "refundable" | "currency">): string | null {
  if (!o.refundable) return null;
  const pols = o.rates.flatMap((r) => (r.cancellationPolicies ?? []).filter((c) => c.from && c.amount));
  if (!pols.length) return null;
  const first = pols.map((c) => c.from!.slice(0, 10)).sort()[0];
  const amount = pols.filter((c) => c.from!.slice(0, 10) === first).reduce((s, c) => s.plus(c.amount!), new Decimal(0));
  return `A partir de ${brDate(first)} (horário do hotel), multa de cancelamento de ${o.currency} ${amount.toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function roomsTitle(o: HbOption, pax: PaxConfig): string {
  const rooms = pax.rooms ?? 1;
  return rooms > 1 ? `${rooms}× ${o.roomName}` : o.roomName;
}

// ───────────────────────── Adaptador ─────────────────────────

type Content = {
  name: string;
  description: string;
  address: string;
  city: string;
  images: string[];
  facilities: string[];
  stars?: number;
  phone?: string | null;
  /** Conteúdo organizado para a página do hotel (avisos ainda sem o filtro de datas da estadia). */
  hotel: HotelContent;
  /** Fotos e comodidades por tipo de quarto (roomCode). */
  rooms: Record<string, RoomContent>;
};

export function createHotelbedsAdapter(cfg: HotelbedsConfig, opts: { transport?: Transport } = {}): SupplierAdapter & {
  client: HotelbedsClient;
  syncDestinations(): Promise<number>;
} {
  const client = new HotelbedsClient(cfg, opts.transport);
  let syncing: Promise<number> | null = null;

  async function syncDestinations(): Promise<number> {
    const rows: DestinationRow[] = [];
    for (let from = 1; ; from += 1000) {
      const r = await client.content<{ destinations?: { code: string; name?: { content?: string }; countryCode?: string; isoCode?: string }[]; total?: number }>(
        `/locations/destinations?fields=all&language=ENG&from=${from}&to=${from + 999}&useSecondaryLanguage=true`,
        60_000,
      );
      for (const d of r.destinations ?? []) {
        const name = d.name?.content?.trim();
        // destinos desativados vêm marcados no nome ("Tepelenës *CLOSED")
        if (!d.code || !name || /\*\s*closed\b|\bclosed\s*\*?$/i.test(name)) continue;
        const parsed = parseCityName(name, "HOTELBEDS");
        if (!parsed.searchKey) continue;
        rows.push({ supplierCode: HB_CODE, code: d.code, name, city: parsed.city, region: parsed.region, countryCode: (d.isoCode ?? d.countryCode ?? "").toUpperCase() || null, countryName: null, searchKey: parsed.searchKey });
      }
      if (!r.destinations?.length || from + 999 >= (r.total ?? 0)) break;
    }
    return saveSupplierDestinations(HB_CODE, rows);
  }

  async function ensureDestinations() {
    if ((await destinationCount(HB_CODE).catch(() => 1)) > 0) return;
    syncing ??= syncDestinations().finally(() => (syncing = null));
    await syncing;
  }

  /** UMA chamada de disponibilidade (por destino ou por hotel) → hotéis com as opções vendáveis. */
  async function availability(p: { destination?: string; hotels?: number[]; checkIn: string; checkOut: string; groups: OccGroup[] }): Promise<HbHotelOffer[]> {
    const body = {
      stay: { checkIn: p.checkIn, checkOut: p.checkOut },
      occupancies: occupanciesBody(p.groups),
      ...(p.hotels ? { hotels: { hotel: p.hotels } } : { destination: { code: p.destination } }),
      // mercado de origem do cliente: preços válidos para o Brasil
      sourceMarket: cfg.sourceMarket,
    };
    const r = await client.booking<AvailabilityRS>("POST", "/hotels", body, 30_000);
    return (r.hotels?.hotels ?? [])
      .map((h) => ({
        hotel: { code: h.code, name: h.name, categoryCode: h.categoryCode, categoryName: h.categoryName, destinationName: h.destinationName, zoneName: h.zoneName, currency: h.currency, paymentDataRequired: h.paymentDataRequired },
        options: buildOptions(h, p.groups),
      }))
      .filter((x) => x.options.length);
  }

  const stayKeyOf = (checkIn: string, checkOut: string, pax: PaxConfig) => `${checkIn}:${checkOut}:${paxKey(pax)}`;

  /**
   * Ofertas do hotel SEM repetir disponibilidade: usa a busca do destino (ou a do próprio hotel) que
   * ainda está no cache; só consulta a Hotelbeds se não houver nenhuma recente (nova sessão).
   */
  async function hotelOffers(productId: string, p: { checkIn: string; checkOut: string; pax: PaxConfig; groups: OccGroup[]; destination?: string; destinationKey?: string }): Promise<HbHotelOffer | null> {
    const stayKey = stayKeyOf(p.checkIn, p.checkOut, p.pax);
    const hotelKey = `hb:hotel:${productId}:${stayKey}`;
    const own = await cacheGet<HbHotelOffer | null>(hotelKey);
    if (own !== undefined) return own;
    if (p.destination || p.destinationKey) {
      const dest = await resolveDestination(p.destination, p.destinationKey).catch(() => null);
      const codes = dest ? await supplierCodesFor(HB_CODE, dest).catch(() => [] as string[]) : [];
      for (const code of codes) {
        const list = await cacheGet<HbHotelOffer[]>(`hb:search:${code}:${stayKey}`);
        const hit = list?.find((x) => String(x.hotel.code) === productId);
        if (hit) {
          await cacheSet(hotelKey, hit, SEARCH_TTL);
          return hit;
        }
      }
    }
    return cached(hotelKey, SEARCH_TTL, async () => (await availability({ hotels: [Number(productId)], checkIn: p.checkIn, checkOut: p.checkOut, groups: p.groups }))[0] ?? null);
  }

  /** CheckRate de UMA tarifa por chamada (boa prática da Hotelbeds). Resultado reaproveitado por 20 min. */
  async function checkRate(rate: HbRate, opts: { fresh?: boolean } = {}): Promise<{ rate: HbRate; paymentDataRequired: boolean; currency: string | null }> {
    const run = async () => {
      let r: CheckRateRS;
      try {
        r = await client.booking<CheckRateRS>("POST", "/checkrates", { rooms: [{ rateKey: rate.rateKey }], language: "ENG" }, 30_000);
      } catch (e) {
        // 500 = tarifa não está mais disponível; 4xx de negócio = mudou/esgotou (não repetir a mesma chamada)
        if (e instanceof HotelbedsApiError && e.status !== 401 && e.status !== 403) throw new SupplierError("Este quarto acabou de esgotar ou mudou de preço. Escolha outra opção no hotel.");
        throw e;
      }
      const h = r.hotel;
      const n = (h?.rooms ?? []).flatMap((room) => room.rates ?? [])[0];
      if (!h || !n) throw new SupplierError("O fornecedor não confirmou este quarto. Escolha outra opção.");
      return { rate: { ...rate, ...n, taxes: n.taxes ?? rate.taxes, promotions: n.promotions ?? rate.promotions }, paymentDataRequired: h.paymentDataRequired === true, currency: h.currency ?? null };
    };
    return opts.fresh ? run() : cached(`hb:checkrate:${stableId(rate.rateKey)}`, SEARCH_TTL, run);
  }

  /** Comentários da tarifa (obrigatório mostrar antes de confirmar) pela Content API — sem CheckRate. */
  async function rateComments(rate: HbRate, checkIn: string): Promise<string> {
    if (rate.rateComments?.trim()) return rate.rateComments.trim();
    if (!rate.rateCommentsId) return "";
    return cached(
      `hb:ratecomments:${rate.rateCommentsId}:${checkIn}:${cfg.language}`,
      24 * 3600,
      async () => {
        const r = await client.content<{ rateComments?: { description?: string; dateStart?: string; dateEnd?: string }[] }>(
          `/types/ratecommentdetails?date=${checkIn}&code=${encodeURIComponent(rate.rateCommentsId!)}&language=${encodeURIComponent(cfg.language)}&useSecondaryLanguage=true`,
          20_000,
        );
        return [...new Set((r.rateComments ?? []).map((c) => (c.description ?? "").trim()).filter(Boolean))].join("\n\n");
      },
    ).catch(() => "");
  }

  /** Fotos de capa (1ª imagem geral) por hotel — cache por destino, busca só o que falta. */
  async function thumbnails(scope: string, codes: number[]): Promise<Record<string, string | null>> {
    const key = `hb:thumbs:${scope}`;
    const map = (await cacheGet<Record<string, string | null>>(key)) ?? {};
    const missing = codes.filter((c) => !(String(c) in map));
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      try {
        const r = await client.content<{ hotels?: { code: number; images?: HbImage[] }[] }>(
          `/hotels?fields=code,images&codes=${chunk.join(",")}&language=ENG&from=1&to=${chunk.length}&useSecondaryLanguage=true`,
          30_000,
        );
        for (const c of chunk) map[String(c)] = null;
        for (const h of r.hotels ?? []) map[String(h.code)] = coverImage(h.images ?? []);
      } catch {
        break; // sem foto não impede a busca
      }
    }
    if (missing.length) await cacheSet(key, map, CONTENT_TTL);
    return map;
  }

  async function content(code: string): Promise<Content | null> {
    return cached(
      `hb:content:v2:${code}:${cfg.language}`,
      CONTENT_TTL,
      async () => {
        const r = await client.content<{ hotel?: Record<string, unknown> }>(`/hotels/${encodeURIComponent(code)}/details?language=${encodeURIComponent(cfg.language)}&useSecondaryLanguage=true`, 30_000);
        return parseHotelDetails((r.hotel ?? {}) as HbHotelDetails);
      },
      { cacheIf: (v) => !!v.name },
    ).catch(() => null);
  }

  function defaults(params: { checkIn?: string; checkOut?: string; pax?: Partial<PaxConfig> }) {
    const pax = normalizeHotelPax({ adults: 2, children: 0, rooms: 1, ...params.pax });
    const stay = validateStay(params.checkIn, params.checkOut);
    return { pax, groups: occupancyGroups(pax), ...stay };
  }

  function stayLine(o: HbOption, nights: number, pax: PaxConfig): PriceLine {
    const rooms = pax.rooms ?? 1;
    return { type: "STAY", label: `Hospedagem · ${nights} noite${nights > 1 ? "s" : ""} · ${rooms} quarto${rooms > 1 ? "s" : ""} · ${boardLabel(o.boardCode, o.boardName)}`, unitCost: o.total, quantity: 1 };
  }

  function paxRules(): PaxRule[] {
    return [
      { type: "ROOM", label: "Quartos", min: 1, max: HOTEL_MAX_ROOMS },
      { type: "ADULT", label: "Adultos", min: 1, max: HOTEL_MAX_ADULTS },
      { type: "CHILD", label: "Crianças", hint: `0 a ${CHILD_MAX_AGE} anos`, min: 0, max: HOTEL_MAX_CHILDREN, ages: { min: 0, max: CHILD_MAX_AGE } },
    ];
  }

  function summary(h: HbHotelLite, options: HbOption[], image: string | null | undefined, destinationLabel: string, nights: number, pax: PaxConfig): ProductSummary {
    const best = options[0];
    const stars = parseStars(h.categoryCode ?? h.categoryName);
    const breakfast = options.some((o) => !["RO", "SC", "OB"].includes(o.boardCode));
    const refundable = options.some((o) => o.refundable);
    const zone = h.zoneName ? titleCase(h.zoneName) : null;
    return {
      supplierCode: HB_CODE,
      supplierName: HB_NAME,
      category: "LODGING",
      productId: String(h.code),
      title: titleCase(h.name),
      subtitle: [starsText(stars), breakfast ? "Opção com café da manhã" : null, refundable ? "Opção reembolsável" : null].filter(Boolean).join(" · ") || undefined,
      location: zone ? `${zone} · ${destinationLabel}` : destinationLabel,
      destination: destinationLabel,
      imageUrl: image ?? null,
      tags: [breakfast ? "Café da manhã" : null, refundable ? "Reembolsável" : null].filter((x): x is string => !!x),
      currency: best.currency,
      lines: [stayLine(best, nights, pax)],
      groupKey: hotelGroupKey(h.name),
      minSellPrice: minSellPriceFor(best),
      stars,
      perks: { breakfast, refundable },
      area: zone,
    };
  }

  /** Tarifas finais da opção: CheckRate só para RECHECK (1 por chamada); BOOKABLE vai direto. */
  async function finalizeRates(o: HbOption, checkIn: string, fresh = false) {
    let paymentDataRequired = false;
    const rates: HbRate[] = [];
    for (const r of o.rates) {
      if (r.rateType === "RECHECK") {
        const c = await checkRate(r, { fresh });
        paymentDataRequired ||= c.paymentDataRequired;
        rates.push(c.rate);
      } else rates.push(r);
    }
    const comments = (await Promise.all(rates.map((r) => rateComments(r, checkIn)))).filter(Boolean);
    const total = money2(rates.reduce((s, r) => s.plus(r.net), new Decimal(0)).toFixed(2));
    return { option: { ...o, rates, total }, comments: [...new Set(comments)].join("\n\n"), paymentDataRequired };
  }

  async function findBooking(item: BookItem): Promise<BookingResult | null> {
    if (!item.reference) return null;
    const ref = clientRef(item.reference);
    const start = addDays(todayLocal(), -60);
    const end = addDays(todayLocal(), 1);
    const r = await client.booking<{ bookings?: { bookings?: HbBooking[] } }>(
      "GET",
      `/bookings?start=${start}&end=${end}&filterType=CREATION&status=ALL&from=1&to=50&clientReference=${encodeURIComponent(ref)}`,
      undefined,
      60_000,
    );
    const list = (r.bookings?.bookings ?? []).filter((b) => (b.clientReference ?? "").trim() === ref);
    const b = list.find((x) => x.status !== "CANCELLED") ?? list[0];
    return b ? bookingResult(b) : null;
  }

  return {
    code: HB_CODE,
    name: HB_NAME,
    category: "LODGING",
    defaultCurrency: "EUR",
    live: true,
    client,
    syncDestinations,
    destinations: () => [],

    async search(params: SearchParams) {
      if (!params.destination?.trim() && !params.destinationKey) return [];
      const { pax, groups, checkIn, checkOut, nights } = defaults(params);
      await ensureDestinations();
      const dest = await resolveDestination(params.destination, params.destinationKey);
      if (!dest) return [];
      const codes = await supplierCodesFor(HB_CODE, dest);
      if (!codes.length) return [];
      const stayKey = stayKeyOf(checkIn, checkOut, pax);
      const perCode = await Promise.allSettled(
        codes.map((code) => cached(`hb:search:${code}:${stayKey}`, SEARCH_TTL, () => availability({ destination: code, checkIn, checkOut, groups }))),
      );
      const ok = perCode.filter((r): r is PromiseFulfilledResult<HbHotelOffer[]> => r.status === "fulfilled");
      if (!ok.length && perCode.length) throw (perCode[0] as PromiseRejectedResult).reason;
      const byCode = new Map<number, HbHotelOffer>();
      for (const x of ok.flatMap((r) => r.value)) if (!byCode.has(x.hotel.code)) byCode.set(x.hotel.code, x);
      const list = [...byCode.values()];
      const thumbs = await thumbnails(codes.join(","), list.map((x) => x.hotel.code)).catch(() => ({}) as Record<string, string | null>);
      return list.map((x) => summary(x.hotel, x.options, thumbs[String(x.hotel.code)], dest.label, nights, pax));
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      if (!/^\d+$/.test(productId)) return null;
      const { pax, groups, checkIn, checkOut, nights } = defaults(params);
      const [offer, info] = await Promise.all([
        hotelOffers(productId, { checkIn, checkOut, pax, groups, destination: params.destination, destinationKey: params.destinationKey }),
        content(productId),
      ]);
      if (!offer && !info) return null;
      const options = offer?.options ?? [];
      const h = offer?.hotel;
      const destination = params.destination?.split(",")[0]?.trim() || (h?.destinationName ? parseCityName(h.destinationName, "HOTELBEDS").city : info?.city) || "";
      const name = h?.name ?? info?.name ?? "";
      const stars = parseStars(h?.categoryCode ?? h?.categoryName) ?? info?.stars;
      const gallery = info?.images?.length ? info.images.slice(0, 40) : [];
      const base: ProductSummary =
        h && options.length
          ? summary(h, options, gallery[0], destination, nights, pax)
          : { supplierCode: HB_CODE, supplierName: HB_NAME, category: "LODGING", productId, title: titleCase(name), subtitle: starsText(stars) || undefined, location: info?.address || destination, destination, imageUrl: gallery[0] ?? null, tags: [], currency: "EUR", lines: [], groupKey: hotelGroupKey(name) };
      return {
        ...base,
        location: info?.address || base.location,
        imageUrl: gallery[0] ?? base.imageUrl,
        description: info?.description || "Descrição do hotel indisponível no momento.",
        gallery,
        highlights: (info?.facilities ?? []).slice(0, 8),
        options: options.map(
          (o): OfferOption => ({
            optionId: o.optionId,
            title: roomsTitle(o, pax),
            description: boardLabel(o.boardCode, o.boardName),
            currency: o.currency,
            lines: [stayLine(o, nights, pax)],
            attributes: [
              { label: "Regime", value: boardLabel(o.boardCode, o.boardName) },
              { label: "Cancelamento", value: cancellationText(o) },
            ],
            freeCancellationUntil: freeCancellationUntil(o),
            minSellPrice: minSellPriceFor(o),
            notes: optionNotes(o),
            room: info?.rooms[o.roomCode] ?? null,
            available: true,
          }),
        ),
        paxRules: paxRules(),
        info: [
          ...(stars ? [{ label: "Categoria", value: `${stars.toLocaleString("pt-BR")} estrela${stars > 1 ? "s" : ""}` }] : []),
          { label: "Estadia", value: `${nights} noite${nights > 1 ? "s" : ""}` },
          { label: "Hóspedes", value: occupancyLabel(pax) },
          ...(info?.phone ? [{ label: "Telefone do hotel", value: info.phone }] : []),
        ],
        hotel: info ? { ...info.hotel, issues: issuesDuring(info.hotel.issues, checkIn, checkOut) } : null,
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      if (!/^\d+$/.test(req.productId) || !req.optionId) throw new SupplierError("Quarto inválido — escolha novamente no hotel");
      const pax = normalizeHotelPax(req.pax);
      const groups = occupancyGroups(pax);
      const stay = validateStay(req.checkIn, req.checkOut);
      const offer = await hotelOffers(req.productId, { checkIn: stay.checkIn, checkOut: stay.checkOut, pax, groups });
      const option = offer?.options.find((o) => o.optionId === req.optionId);
      if (!offer || !option) throw new SupplierError("Este quarto não está mais disponível para estas datas e hóspedes. Escolha outra opção no hotel.");
      let fin: Awaited<ReturnType<typeof finalizeRates>>;
      try {
        fin = await finalizeRates(option, stay.checkIn);
      } catch (e) {
        // esgotou no CheckRate: tira o quarto da página do hotel (sem nova disponibilidade)
        if (e instanceof SupplierError && !(e instanceof SupplierIntegrationError)) {
          const rest = { ...offer, options: offer.options.filter((x) => x.optionId !== req.optionId) };
          await cacheSet(`hb:hotel:${req.productId}:${stayKeyOf(stay.checkIn, stay.checkOut, pax)}`, rest, SEARCH_TTL).catch(() => {});
        }
        throw e;
      }
      const o = fin.option;
      const info = await content(req.productId);
      const charges = payAtHotel(o.rates);
      const paymentDataRequired = fin.paymentDataRequired || offer.hotel.paymentDataRequired === true;
      return {
        supplierCode: HB_CODE,
        category: "LODGING",
        productId: req.productId,
        optionId: req.optionId,
        title: titleCase(offer.hotel.name),
        subtitle: `${roomsTitle(o, pax)} · ${boardLabel(o.boardCode, o.boardName)} · ${stay.nights} noite${stay.nights > 1 ? "s" : ""}`,
        location: info?.address || (offer.hotel.zoneName ? titleCase(offer.hotel.zoneName) : null),
        imageUrl: info?.images[0] ?? null,
        serviceDate: stay.checkIn,
        serviceEndDate: stay.checkOut,
        expiresAt: expiresAtFor(stay.checkIn),
        currency: o.currency,
        lines: [stayLine(o, stay.nights, pax)],
        pax,
        paxRules: paxRules(),
        details: {
          supplierHotelId: req.productId,
          hotelName: titleCase(offer.hotel.name),
          hotelCategory: starsText(parseStars(offer.hotel.categoryCode ?? offer.hotel.categoryName)) || null,
          address: info?.address ?? null,
          destinationName: offer.hotel.destinationName ? parseCityName(offer.hotel.destinationName, "HOTELBEDS").city : (info?.city ?? null),
          hotelPhone: info?.phone ?? null,
          rooms: [roomsTitle(o, pax)],
          roomCode: o.roomCode,
          board: boardLabel(o.boardCode, o.boardName),
          boardCode: o.boardCode,
          nights: stay.nights,
          occupancy: distributeRooms(pax),
          nonRefundable: !o.refundable,
          cancellation: cancellationText(o),
          freeCancellationUntil: freeCancellationUntil(o),
          cancellationPolicies: o.rates.flatMap((r) => r.cancellationPolicies ?? []),
          payAtHotel: charges,
          notes: optionNotes(o),
          remarks: fin.comments,
          rateKeys: o.rates.map((r) => r.rateKey),
          rateTypes: o.rates.map((r) => r.rateType ?? "BOOKABLE"),
          paymentDataRequired,
          minSellPrice: minSellPriceFor(o),
          valuatedAt: new Date().toISOString(),
        },
        quoteRef: stableId(...o.rates.map((r) => r.rateKey)),
      };
    },

    findBooking,

    /**
     * Reserva com as tarifas cotadas (fluxo Disponibilidade → CheckRate se RECHECK → Reserva, sem
     * repetir disponibilidade). Só numa NOVA tentativa depois de falha é feita uma consulta nova.
     */
    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      if (!item.optionId) throw new SupplierError("Reserva sem quarto definido");
      if (!item.reference) throw new SupplierIntegrationError("Reserva sem referência interna");
      const pax = normalizeHotelPax(item.pax);
      const groups = occupancyGroups(pax);
      const stay = validateStay(item.serviceDate ?? undefined, item.serviceEndDate ?? undefined);
      const rooms = distributeRooms(pax);
      const guests = assignGuests(rooms, ctx.travelers, ctx.holder);
      const d = (item.details ?? {}) as { rateKeys?: string[]; paymentDataRequired?: boolean };

      const existing = await findBooking(item);
      if (existing && existing.status !== "CANCELLED") return { ...existing, payload: { ...existing.payload, recoveredExisting: true } };

      let rateKeys = Array.isArray(d.rateKeys) && d.rateKeys.length === groups.length && !ctx.retry ? d.rateKeys : null;
      let paymentDataRequired = d.paymentDataRequired === true;
      let expected: string | null = null;
      if (!rateKeys) {
        // nova tentativa: novo fluxo completo (uma disponibilidade + CheckRate se RECHECK)
        const fresh = (await availability({ hotels: [Number(item.productId)], checkIn: stay.checkIn, checkOut: stay.checkOut, groups }))[0];
        const option = fresh?.options.find((o) => o.optionId === item.optionId);
        if (!fresh || !option) throw new SupplierError("O quarto vendido não está mais disponível no fornecedor");
        const fin = await finalizeRates(option, stay.checkIn, true);
        paymentDataRequired = fin.paymentDataRequired || fresh.hotel.paymentDataRequired === true;
        if (item.maxCost) {
          if (item.maxCost.currency !== fin.option.currency) throw new SupplierError(`O fornecedor mudou a moeda da tarifa (${fin.option.currency})`);
          if (new Decimal(fin.option.total).gt(item.maxCost.amount)) throw new SupplierError(`O fornecedor aumentou o preço: ${fin.option.currency} ${fin.option.total} (vendido por ${item.maxCost.amount})`);
        }
        rateKeys = fin.option.rates.map((r) => r.rateKey);
        expected = fin.option.total;
      }
      if (paymentDataRequired) throw new SupplierError("Esta tarifa exige pagamento com cartão diretamente na Hotelbeds — emita pelo extranet da Hotelbeds");

      const holderName = splitName(ctx.holder?.name || ctx.travelers.find((t) => t.type !== "CHILD")?.name || "");
      const body = {
        holder: { name: holderName.first, surname: holderName.last },
        rooms: groups.map((g, gi) => ({
          rateKey: rateKeys![gi],
          paxes: g.roomIndexes.flatMap((ri, k) => [
            ...guests.adults[ri].map((a) => ({ roomId: k + 1, type: "AD", name: a.first, surname: a.last })),
            ...guests.children[ri].map((c) => ({ roomId: k + 1, type: "CH", age: c.age, name: c.first, surname: c.last })),
          ]),
        })),
        clientReference: clientRef(item.reference),
        ...(ctx.remark ? { remark: ctx.remark.slice(0, 500) } : {}),
        language: "ENG",
      };
      let r: BookingRS;
      try {
        // tempo mínimo de resposta exigido pela Hotelbeds: 60 s
        r = await client.booking<BookingRS>("POST", "/bookings", body, 75_000);
      } catch (e) {
        if (e instanceof SupplierIntegrationError && e.detail?.timeout) {
          const again = await findBooking(item).catch(() => null);
          if (again) return { ...again, payload: { ...again.payload, recoveredAfterError: true } };
          throw e;
        }
        if (e instanceof HotelbedsApiError && e.status >= 500) {
          const again = await findBooking(item).catch(() => null);
          if (again) return { ...again, payload: { ...again.payload, recoveredAfterError: true } };
          // 500 = produto não está mais disponível: refazer o processo do começo (nunca repetir a mesma chamada)
          throw new SupplierError(`A Hotelbeds recusou a tarifa (não está mais disponível${e.message ? `: ${e.message.replace(/^Hotelbeds [^:]*: /, "")}` : ""}). Use “Tentar de novo” para refazer a consulta.`);
        }
        throw e;
      }
      if (!r.booking?.reference) throw new SupplierIntegrationError("A Hotelbeds não devolveu a referência da reserva", { response: r as Record<string, unknown> });
      const res = bookingResult(r.booking);
      const total = r.booking.totalNet != null ? String(r.booking.totalNet) : expected;
      const above = !!(item.maxCost && total && new Decimal(total).gt(item.maxCost.amount));
      return { ...res, payload: { ...res.payload, bookedPrice: total, currency: r.booking.currency ?? null, ...(above ? { costAboveSold: true } : {}) } };
    },

    cancelSimulation: true,

    async cancelBooking(bookingRef: string, opts: { simulate: boolean }): Promise<CancelResult> {
      const r = await client.booking<BookingRS>(
        "DELETE",
        `/bookings/${encodeURIComponent(bookingRef)}?cancellationFlag=${opts.simulate ? "SIMULATION" : "CANCELLATION"}&language=ENG`,
        undefined,
        75_000,
      );
      if (!r.booking) throw new SupplierIntegrationError("A Hotelbeds não devolveu a reserva cancelada");
      const amount = r.booking.hotel?.cancellationAmount ?? null;
      const res = bookingResult(r.booking);
      return {
        status: opts.simulate ? "SIMULATED" : res.status,
        penalty: amount != null ? { amount: new Decimal(String(amount)).toFixed(2), currency: r.booking.currency ?? "" } : null,
        reference: r.booking.cancellationReference ?? null,
        payload: res.payload,
      };
    },

    async bookingStatus(bookingRef: string): Promise<BookingResult> {
      const r = await client.booking<BookingRS>("GET", `/bookings/${encodeURIComponent(bookingRef)}?language=ENG`, undefined, 60_000);
      if (!r.booking) throw new SupplierIntegrationError("Reserva não encontrada na Hotelbeds");
      return bookingResult(r.booking);
    },
  };
}

function clientRef(ref: string): string {
  return ref.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
}

/** Imagem da Content API: na lista de hotéis o tipo vem em imageTypeCode; no detalhe, em type.code. */
type HbImage = { path?: string; imageTypeCode?: string; type?: { code?: string }; visualOrder?: number; order?: number; roomCode?: string };

/** Fotos gerais (GEN) primeiro, na ordem visual sugerida pela Hotelbeds. */
function sortImages(images: HbImage[]): string[] {
  const kind = (i: HbImage) => ((i.imageTypeCode ?? i.type?.code) === "GEN" ? 0 : 1);
  return images
    .filter((i) => i.path)
    .sort((a, b) => kind(a) - kind(b) || (a.visualOrder ?? 9999) - (b.visualOrder ?? 9999) || (a.order ?? 9999) - (b.order ?? 9999))
    .map((i) => i.path!.replace(/^\/+/, ""));
}

function coverImage(images: HbImage[]): string | null {
  const [p] = sortImages(images);
  return p ? PHOTO_BASE + p : null;
}

// ───────────────────────── Conteúdo do hotel (Content API /hotels/{code}/details) ─────────────────────────

type HbText = { content?: string };
type HbFacility = {
  facilityCode?: number;
  facilityGroupCode?: number;
  description?: HbText;
  indLogic?: boolean;
  indYesOrNo?: boolean;
  indFee?: boolean;
  number?: number;
  distance?: number;
  timeFrom?: string;
  timeTo?: string;
  order?: number;
};
export type HbHotelDetails = {
  name?: HbText;
  description?: HbText;
  address?: HbText;
  city?: HbText;
  category?: { code?: string; description?: HbText };
  coordinates?: { latitude?: number | string; longitude?: number | string };
  images?: HbImage[];
  facilities?: HbFacility[];
  phones?: { phoneNumber?: string; phoneType?: string }[];
  interestPoints?: { poiName?: string; distance?: string | number; order?: number }[];
  terminals?: { terminalCode?: string; terminalType?: string; distance?: number; name?: HbText; description?: HbText }[];
  issues?: { description?: HbText; dateFrom?: string; dateTo?: string; alternative?: boolean }[];
  rooms?: {
    roomCode?: string;
    description?: string;
    maxPax?: number;
    roomFacilities?: HbFacility[];
    roomStays?: { stayType?: string; description?: string; roomStayFacilities?: { description?: HbText; number?: number }[] }[];
  }[];
};

const txt = (t: HbText | undefined) => t?.content?.replace(/\s+/g, " ").trim() ?? "";
/** A comodidade existe no hotel (a API manda também as que não existem, com indLogic/indYesOrNo falso). */
const present = (f: HbFacility) => f.indLogic !== false && f.indYesOrNo !== false && (f.indLogic === true || f.indYesOrNo === true || Number(f.number) > 0);
const withFee = (f: HbFacility, d: string) => (f.indFee ? `${d} (pago à parte)` : d);
const isDate = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** Detalhe do hotel na Content API → dados da página (fotos com categoria, horários, arredores, avisos, quartos). */
export function parseHotelDetails(h: HbHotelDetails): Content {
  const facilities = h.facilities ?? [];
  const phone = (h.phones ?? []).find((p) => /hotel/i.test(p.phoneType ?? "")) ?? (h.phones ?? []).find((p) => /book/i.test(p.phoneType ?? "")) ?? h.phones?.[0];
  const ordered = [...(h.images ?? [])]
    .filter((i) => i.path)
    .sort((a, b) => ((a.imageTypeCode ?? a.type?.code) === "GEN" ? 0 : 1) - ((b.imageTypeCode ?? b.type?.code) === "GEN" ? 0 : 1) || (a.visualOrder ?? 9999) - (b.visualOrder ?? 9999) || (a.order ?? 9999) - (b.order ?? 9999));
  const url = (i: HbImage) => PHOTO_BASE_XL + i.path!.replace(/^\/+/, "");

  // horários: código 260 = hora do check-in, 390 = hora do check-out (ou pelo texto)
  const byText = (re: RegExp) => facilities.find((f) => re.test(txt(f.description)));
  const ci = facilities.find((f) => f.facilityCode === 260) ?? byText(/check.?in/i);
  const co = facilities.find((f) => f.facilityCode === 390) ?? byText(/check.?out/i);
  const age = facilities.find((f) => f.facilityCode === 564) ?? byText(/idade m[ií]nima|minimum.*age/i);
  const timeOf = (f: HbFacility | undefined): string | null => (f?.timeFrom ? hhmm(f.timeFrom) : null);
  const untilOf = (f: HbFacility | undefined) => {
    const t = f?.timeTo ? hhmm(f.timeTo) : null;
    return t && t !== "00:00" ? t : null;
  };

  const amenities = facilities.filter((f) => [70, 71, 72, 73, 74].includes(Number(f.facilityGroupCode)) && txt(f.description) && present(f) && f !== ci && f !== co).map((f) => withFee(f, txt(f.description)));
  const roomLevel = facilities.filter((f) => Number(f.facilityGroupCode) === 60 && txt(f.description) && present(f)).map((f) => withFee(f, txt(f.description)));
  const keepInMind = facilities.filter((f) => Number(f.facilityGroupCode) === 85 && txt(f.description) && f !== age && f.indLogic !== false && f.indYesOrNo !== false).map((f) => withFee(f, txt(f.description)));
  const cards = facilities.filter((f) => Number(f.facilityGroupCode) === 30 && txt(f.description) && present(f)).map((f) => txt(f.description));
  const facts = facilities
    .filter((f) => [10, 20].includes(Number(f.facilityGroupCode)) && txt(f.description) && Number(f.number) > 0)
    .map((f) => ({ label: txt(f.description), value: Number(f.number).toLocaleString("pt-BR", { useGrouping: Number(f.number) >= 10000 }) }));
  const distances = facilities
    .filter((f) => Number(f.facilityGroupCode) === 40 && txt(f.description) && Number(f.distance) > 0)
    .map((f) => {
      const name = txt(f.description).replace(/^dist[aâ]ncia\s+(?:d[aoe]s?\s+)?/i, "").replace(/\s*\((?:km|m|metros)\)$/i, "");
      return { name: name.charAt(0).toUpperCase() + name.slice(1), distance: formatMeters(f.distance), kind: /aeroporto|airport/i.test(name) ? ("airport" as const) : ("place" as const) };
    });
  const pois = [...(h.interestPoints ?? [])]
    .filter((p) => p.poiName?.trim())
    .sort((a, b) => (Number(a.distance) || 9e9) - (Number(b.distance) || 9e9))
    .map((p) => ({ name: p.poiName!.trim(), distance: formatMeters(p.distance), kind: "place" as const }));
  const terminals = (h.terminals ?? []).map((t) => {
    const name = txt(t.name) || txt(t.description);
    const airport = (t.terminalType ?? "").toUpperCase() === "A" || /aeroporto|airport/i.test(name);
    return { name: name ? `${name}${t.terminalCode && !name.includes(t.terminalCode) ? ` (${t.terminalCode})` : ""}` : `${airport ? "Aeroporto" : "Terminal"} ${t.terminalCode ?? ""}`.trim(), distance: Number(t.distance) > 0 ? `${t.distance} km` : null, kind: airport ? ("airport" as const) : ("place" as const) };
  });
  const lat = Number(h.coordinates?.latitude);
  const lng = Number(h.coordinates?.longitude);

  const rooms: Record<string, RoomContent> = {};
  for (const room of h.rooms ?? []) {
    if (!room.roomCode) continue;
    const beds = (room.roomStays ?? []).flatMap((st) => (st.roomStayFacilities ?? []).filter((f) => txt(f.description)).map((f) => (Number(f.number) > 1 ? `${f.number} × ${txt(f.description)}` : txt(f.description))));
    const feats = (room.roomFacilities ?? []).filter((f) => txt(f.description) && present(f)).map((f) => withFee(f, txt(f.description)));
    rooms[room.roomCode] = {
      photos: ordered.filter((i) => i.roomCode === room.roomCode).slice(0, 8).map(url),
      amenities: roomAmenitiesFrom([...beds, ...feats]).slice(0, 14),
      maxPax: Number(room.maxPax) > 0 ? Number(room.maxPax) : null,
    };
  }

  const description = htmlToText(h.description?.content);
  const hotel: HotelContent = {
    ...EMPTY_HOTEL_CONTENT,
    photos: ordered.map((i) => ({ url: url(i), tag: hbImageTag(i.imageTypeCode ?? i.type?.code) })),
    about: description.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((t) => ({ title: null, text: t })),
    amenities: groupAmenities(amenities),
    roomAmenities: roomAmenitiesFrom(roomLevel),
    times: { checkInFrom: timeOf(ci), checkInUntil: untilOf(ci), checkOutUntil: untilOf(co) ?? timeOf(co), minAge: age && Number(age.number) > 0 ? Number(age.number) : null },
    coordinates: Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null,
    nearby: [...pois, ...distances, ...terminals].slice(0, 30),
    policies: [
      ...(keepInMind.length ? [{ title: "Na chegada", items: keepInMind }] : []),
      ...(cards.length ? [{ title: "Cartões aceitos no hotel", items: [cards.join(", ")] }] : []),
    ],
    issues: (h.issues ?? []).filter((i) => txt(i.description)).map((i) => ({ text: txt(i.description), from: isDate(i.dateFrom), to: isDate(i.dateTo) })),
    facts,
  };
  return {
    name: txt(h.name),
    description,
    address: [h.address?.content, h.city?.content].filter(Boolean).map((x) => titleCase(String(x).trim())).join(", "),
    city: titleCase(txt(h.city)),
    images: ordered.map(url),
    // comodidades de verdade: grupos 60 (quarto), 70 (gerais), 71 (bar/restaurante), 73 (lazer), 74 (esportes)
    facilities: rankFacilities(facilities.filter((f) => [60, 70, 71, 73, 74].includes(Number(f.facilityGroupCode)) && txt(f.description) && present(f) && f !== ci && f !== co).map((f) => txt(f.description))),
    stars: parseStars(h.category?.code ?? txt(h.category?.description)),
    phone: phone?.phoneNumber?.trim() || null,
    hotel,
    rooms,
  };
}

function bookingResult(b: HbBooking): BookingResult {
  const status = (b.status ?? "").toUpperCase();
  return {
    bookingRef: b.reference,
    status: status === "CONFIRMED" ? "CONFIRMED" : status === "CANCELLED" ? "CANCELLED" : status || "PENDING",
    payload: {
      supplierStatus: b.status ?? null,
      clientReference: b.clientReference ?? null,
      creationDate: b.creationDate ?? null,
      totalNet: b.totalNet != null ? String(b.totalNet) : null,
      pendingAmount: b.pendingAmount != null ? String(b.pendingAmount) : null,
      currency: b.currency ?? null,
      holder: b.holder ? `${b.holder.name ?? ""} ${b.holder.surname ?? ""}`.trim() : null,
      hotelName: b.hotel?.name ?? null,
      checkIn: b.hotel?.checkIn ?? null,
      checkOut: b.hotel?.checkOut ?? null,
      // Obrigatório no voucher: "Pagável por <fornecedor>, agindo como agente, CNPJ/VAT <número>"
      payableThrough: b.hotel?.supplier?.name ?? null,
      supplierVatNumber: b.hotel?.supplier?.vatNumber ?? null,
      invoiceCompany: b.invoiceCompany?.name ?? null,
      cancellationAllowed: b.modificationPolicies?.cancellation ?? null,
    },
  };
}

export function createHotelbedsFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const cfg = hotelbedsConfig(env);
  return cfg ? createHotelbedsAdapter(cfg) : null;
}
