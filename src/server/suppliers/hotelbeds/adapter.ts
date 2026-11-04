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
import { cached, cacheGet, cacheSet } from "../hotels/cache";
import { asCurrency, boardLabel, brDate, hotelGroupKey, htmlToText, money2, parseStars, rankFacilities, splitName, stableId, starsText, titleCase, validateStay } from "../hotels/common";
import { destinationCount, parseCityName, resolveDestination, saveSupplierDestinations, supplierCodesFor, type DestinationRow } from "../hotels/destinations";
import { CHILD_MAX_AGE, HOTEL_MAX_ADULTS, HOTEL_MAX_CHILDREN, HOTEL_MAX_ROOMS, distributeRooms, normalizeHotelPax, occupancyKey, occupancyLabel, paxKey, type RoomOccupancy } from "../hotels/occupancy";
import { assignGuests } from "../ggt/adapter";
import { HotelbedsApiError, HotelbedsClient, hotelbedsConfig, type HotelbedsConfig, type Transport } from "./client";

export const HB_CODE = "HOTELBEDS";
export const HB_NAME = "Hotelbeds";
const PHOTO_BASE = "https://photos.hotelbeds.com/giata/bigger/"; // ~800 px (cards)
const PHOTO_BASE_XL = "https://photos.hotelbeds.com/giata/xl/"; // ~1024 px (galeria do hotel)
const SEARCH_TTL = 10 * 60;
const CONTENT_TTL = 30 * 24 * 3600;

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
type HbBooking = {
  reference: string;
  clientReference?: string;
  status?: string;
  creationDate?: string;
  totalNet?: number | string;
  pendingAmount?: number | string;
  currency?: string;
  holder?: { name?: string; surname?: string };
  invoiceCompany?: { code?: string; name?: string; registrationNumber?: string };
  hotel?: HbHotel & { supplier?: { name?: string; vatNumber?: string }; checkIn?: string; checkOut?: string };
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

function roomsTitle(o: HbOption, pax: PaxConfig): string {
  const rooms = pax.rooms ?? 1;
  return rooms > 1 ? `${rooms}× ${o.roomName}` : o.roomName;
}

// ───────────────────────── Adaptador ─────────────────────────

type Content = { name: string; description: string; address: string; city: string; images: string[]; facilities: string[]; stars?: number };

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

  async function availability(body: Record<string, unknown>): Promise<HbHotel[]> {
    const r = await client.booking<AvailabilityRS>("POST", "/hotels", body, 30_000);
    return r.hotels?.hotels ?? [];
  }

  function availabilityBody(p: { destination?: string; hotels?: number[]; checkIn: string; checkOut: string; groups: OccGroup[] }) {
    return {
      stay: { checkIn: p.checkIn, checkOut: p.checkOut },
      occupancies: occupanciesBody(p.groups),
      ...(p.hotels ? { hotels: { hotel: p.hotels } } : { destination: { code: p.destination } }),
      filter: { maxRatesPerRoom: 20 },
    };
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
      `hb:content:${code}:${cfg.language}`,
      CONTENT_TTL,
      async () => {
        const r = await client.content<{ hotel?: Record<string, unknown> }>(`/hotels/${encodeURIComponent(code)}/details?language=${encodeURIComponent(cfg.language)}&useSecondaryLanguage=true`, 30_000);
        const h = (r.hotel ?? {}) as {
          name?: { content?: string };
          description?: { content?: string };
          address?: { content?: string };
          city?: { content?: string };
          category?: { code?: string; description?: { content?: string } };
          images?: HbImage[];
          facilities?: { description?: { content?: string }; indLogic?: boolean; indYesOrNo?: boolean; facilityGroupCode?: number; number?: number }[];
        };
        return {
          name: h.name?.content?.trim() ?? "",
          description: htmlToText(h.description?.content),
          address: [h.address?.content, h.city?.content].filter(Boolean).map((x) => titleCase(String(x).trim())).join(", "),
          city: titleCase(h.city?.content?.trim() ?? ""),
          images: sortImages(h.images ?? []).map((p) => PHOTO_BASE_XL + p),
          // comodidades de verdade: grupos 60 (quarto), 70 (gerais), 71 (bar/restaurante), 73 (lazer), 74 (esportes);
          // fora: dados do prédio (10), cartões aceitos (30), distâncias (40), negócios (72), avisos (85)
          facilities: rankFacilities(
            (h.facilities ?? [])
              .filter((f) => [60, 70, 71, 73, 74].includes(Number(f.facilityGroupCode)) && f.description?.content)
              .filter((f) => f.indLogic !== false && f.indYesOrNo !== false && (f.indLogic === true || f.indYesOrNo === true || Number(f.number) > 0))
              .map((f) => f.description!.content!.trim()),
          ),
          stars: parseStars(h.category?.code ?? h.category?.description?.content),
        };
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

  function summary(h: HbHotel, options: HbOption[], image: string | null | undefined, destinationLabel: string, nights: number, pax: PaxConfig): ProductSummary {
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
    };
  }

  async function freshOption(hotelCode: string, optionId: string, stay: { checkIn: string; checkOut: string }, groups: OccGroup[]) {
    const hotels = await availability(availabilityBody({ hotels: [Number(hotelCode)], checkIn: stay.checkIn, checkOut: stay.checkOut, groups }));
    const hotel = hotels.find((h) => String(h.code) === hotelCode);
    const option = hotel ? buildOptions(hotel, groups).find((o) => o.optionId === optionId) : undefined;
    return { hotel, option };
  }

  /** CheckRate: preço final e comentários da tarifa. Substitui as tarifas pelas devolvidas. */
  async function checkRates(o: HbOption): Promise<{ option: HbOption; comments: string; paymentDataRequired: boolean; modification: { cancellation?: boolean; modification?: boolean } | null }> {
    let r: CheckRateRS;
    try {
      r = await client.booking<CheckRateRS>("POST", "/checkrates", { rooms: o.rates.map((x) => ({ rateKey: x.rateKey })), language: "ENG" }, 30_000);
    } catch (e) {
      if (e instanceof HotelbedsApiError && e.status < 500 && e.status !== 401 && e.status !== 403) throw new SupplierError("Este quarto acabou de esgotar ou mudou de preço. Escolha outra opção no hotel.");
      throw e;
    }
    const h = r.hotel;
    const rates = (h?.rooms ?? []).flatMap((room) => room.rates ?? []);
    if (!h || rates.length !== o.rates.length) throw new SupplierError("O fornecedor não confirmou este quarto. Escolha outra opção.");
    const currency = asCurrency(h.currency) ?? o.currency;
    const total = h.totalNet != null ? money2(h.totalNet) : money2(rates.reduce((s, x) => s.plus(x.net), new Decimal(0)).toFixed(2));
    // mantém a ordem dos grupos: casa cada tarifa nova com a antiga pela ocupação
    const ordered = o.rates.map((old) => rates.find((n) => n.rateKey === old.rateKey) ?? rates.find((n) => Number(n.adults) === Number(old.adults) && Number(n.children) === Number(old.children) && Number(n.rooms) === Number(old.rooms)) ?? old);
    const merged = ordered.map((n, i) => ({ ...o.rates[i], ...n, taxes: n.taxes ?? o.rates[i].taxes }));
    const comments = [...new Set(merged.map((x) => (x.rateComments ?? "").trim()).filter(Boolean))].join("\n\n");
    return { option: { ...o, rates: merged, total, currency }, comments, paymentDataRequired: h.paymentDataRequired === true, modification: h.modificationPolicies ?? null };
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
      const stayKey = `${checkIn}:${checkOut}:${paxKey(pax)}`;
      const perCode = await Promise.allSettled(
        codes.map((code) =>
          cached(`hb:search:${code}:${stayKey}`, SEARCH_TTL, async () => {
            const hotels = await availability(availabilityBody({ destination: code, checkIn, checkOut, groups }));
            return hotels.map((h) => ({ h, options: buildOptions(h, groups) })).filter((x) => x.options.length);
          }),
        ),
      );
      const ok = perCode.filter((r): r is PromiseFulfilledResult<{ h: HbHotel; options: HbOption[] }[]> => r.status === "fulfilled");
      if (!ok.length && perCode.length) throw (perCode[0] as PromiseRejectedResult).reason;
      const byCode = new Map<number, { h: HbHotel; options: HbOption[] }>();
      for (const x of ok.flatMap((r) => r.value)) if (!byCode.has(x.h.code)) byCode.set(x.h.code, x);
      const list = [...byCode.values()];
      const thumbs = await thumbnails(codes.join(","), list.map((x) => x.h.code)).catch(() => ({}) as Record<string, string | null>);
      return list.map((x) => summary(x.h, x.options, thumbs[String(x.h.code)], dest.label, nights, pax));
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      if (!/^\d+$/.test(productId)) return null;
      const { pax, groups, checkIn, checkOut, nights } = defaults(params);
      const [hotels, info] = await Promise.all([
        cached(`hb:hotel:${productId}:${checkIn}:${checkOut}:${paxKey(pax)}`, 5 * 60, () => availability(availabilityBody({ hotels: [Number(productId)], checkIn, checkOut, groups }))),
        content(productId),
      ]);
      const h = hotels.find((x) => String(x.code) === productId);
      if (!h && !info) return null;
      const options = h ? buildOptions(h, groups) : [];
      const destination = params.destination?.split(",")[0]?.trim() || (h?.destinationName ? parseCityName(h.destinationName, "HOTELBEDS").city : info?.city) || "";
      const name = h?.name ?? info?.name ?? "";
      const stars = parseStars(h?.categoryCode ?? h?.categoryName) ?? info?.stars;
      const gallery = info?.images?.length ? info.images.slice(0, 30) : [];
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
            notes: [chargesNote(payAtHotel(o.rates))].filter((x): x is string => !!x),
            available: true,
          }),
        ),
        paxRules: paxRules(),
        info: [
          ...(stars ? [{ label: "Categoria", value: `${stars.toLocaleString("pt-BR")} estrela${stars > 1 ? "s" : ""}` }] : []),
          { label: "Estadia", value: `${nights} noite${nights > 1 ? "s" : ""}` },
          { label: "Hóspedes", value: occupancyLabel(pax) },
          { label: "Fornecedor", value: HB_NAME },
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      if (!/^\d+$/.test(req.productId) || !req.optionId) throw new SupplierError("Quarto inválido — escolha novamente no hotel");
      const pax = normalizeHotelPax(req.pax);
      const groups = occupancyGroups(pax);
      const stay = validateStay(req.checkIn, req.checkOut);
      const { hotel, option } = await freshOption(req.productId, req.optionId, stay, groups);
      if (!hotel || !option) throw new SupplierError("Este quarto não está mais disponível para estas datas e hóspedes. Escolha outra opção no hotel.");
      const checked = await checkRates(option);
      const o = checked.option;
      const info = await content(req.productId);
      const charges = payAtHotel(o.rates);
      const sellingFloor = o.rates.every((r) => r.hotelMandatory && r.sellingRate) ? money2(o.rates.reduce((s, r) => s.plus(r.sellingRate!), new Decimal(0)).toFixed(2)) : null;
      return {
        supplierCode: HB_CODE,
        category: "LODGING",
        productId: req.productId,
        optionId: req.optionId,
        title: titleCase(hotel.name),
        subtitle: `${roomsTitle(o, pax)} · ${boardLabel(o.boardCode, o.boardName)} · ${stay.nights} noite${stay.nights > 1 ? "s" : ""}`,
        location: info?.address || (hotel.zoneName ? titleCase(hotel.zoneName) : null),
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
          hotelName: titleCase(hotel.name),
          address: info?.address ?? null,
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
          notes: [chargesNote(charges)].filter(Boolean),
          remarks: checked.comments,
          rateKeys: o.rates.map((r) => r.rateKey),
          paymentDataRequired: checked.paymentDataRequired,
          recommendedSellingPrice: sellingFloor,
          valuatedAt: new Date().toISOString(),
        },
        quoteRef: stableId(...o.rates.map((r) => r.rateKey)),
      };
    },

    findBooking,

    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      if (!item.optionId) throw new SupplierError("Reserva sem quarto definido");
      if (!item.reference) throw new SupplierIntegrationError("Reserva sem referência interna");
      const pax = normalizeHotelPax(item.pax);
      const groups = occupancyGroups(pax);
      const stay = validateStay(item.serviceDate ?? undefined, item.serviceEndDate ?? undefined);
      const rooms = distributeRooms(pax);
      const guests = assignGuests(rooms, ctx.travelers, ctx.holder);

      const existing = await findBooking(item);
      if (existing && existing.status !== "CANCELLED") return { ...existing, payload: { ...existing.payload, recoveredExisting: true } };

      const { option } = await freshOption(item.productId, item.optionId, stay, groups);
      if (!option) throw new SupplierError("O quarto vendido não está mais disponível no fornecedor");
      let o = option;
      if (o.rates.some((r) => r.rateType === "RECHECK")) o = (await checkRates(o)).option;
      if (item.maxCost) {
        if (item.maxCost.currency !== o.currency) throw new SupplierError(`O fornecedor mudou a moeda da tarifa (${o.currency})`);
        if (new Decimal(o.total).gt(item.maxCost.amount)) throw new SupplierError(`O fornecedor aumentou o preço: ${o.currency} ${o.total} (vendido por ${item.maxCost.amount})`);
      }
      const holderName = splitName(ctx.holder?.name || ctx.travelers.find((t) => t.type !== "CHILD")?.name || "");
      const body = {
        holder: { name: holderName.first, surname: holderName.last },
        rooms: groups.map((g, gi) => ({
          rateKey: o.rates[gi].rateKey,
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
        r = await client.booking<BookingRS>("POST", "/bookings", body, 75_000);
      } catch (e) {
        if (e instanceof SupplierIntegrationError && (e.detail?.timeout || (e instanceof HotelbedsApiError && e.status >= 500))) {
          const again = await findBooking(item).catch(() => null);
          if (again) return { ...again, payload: { ...again.payload, recoveredAfterError: true } };
        }
        throw e;
      }
      if (!r.booking?.reference) throw new SupplierIntegrationError("A Hotelbeds não devolveu a referência da reserva", { response: r as Record<string, unknown> });
      const res = bookingResult(r.booking);
      return { ...res, payload: { ...res.payload, bookedPrice: o.total, currency: o.currency } };
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
type HbImage = { path?: string; imageTypeCode?: string; type?: { code?: string }; visualOrder?: number; order?: number };

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
