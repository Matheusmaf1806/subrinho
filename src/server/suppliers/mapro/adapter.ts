/**
 * Adaptador real da MAPRO (casas de temporada).
 *
 * Fluxo:
 *  - search     → GET /v1/quote?checkin&checkout (casas disponíveis já com o preço da estadia,
 *                 paginado por cursor) — filtra destino e capacidade aqui (cache de 5 min);
 *  - getProduct → GET /v1/properties/{id} (conteúdo, cache de 24 h) + a cotação da busca (ou uma
 *                 cotação nova); indisponível → calendário diz o motivo (ocupada / estadia mínima);
 *  - quote      → cotação nova (preço final ao adicionar ao carrinho e no checkout);
 *  - book       → procura reserva igual já feita pelo nosso canal (nunca reserva 2x) → cotação nova
 *                 → não reserva se passar do custo vendido → POST /v1/reservations;
 *  - status / voucher → GET /v1/reservations/{ULID}; cancelamento → DELETE /v1/reservations/{ULID}.
 *
 * Preço = aluguel + taxas da administradora (limpeza, manutenção, processamento…) + impostos locais
 * (Sales Tax e Tourist Tax), em USD. Serviços opcionais (ingressos, pet, early check-in…) não entram.
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
import { cached, cacheGet } from "../hotels/cache";
import { asCurrency, ascii, brDate, money2, splitName, stableId, validateStay } from "../hotels/common";
import { bathroomsText, cityLabel, hasAmenity, hourText, matchesHouseDestination, propertyTypeLabel, rankAmenities, sqftToM2 } from "../houses/common";
import { MaproApiError, MaproClient, maproConfig, type MaproConfig, type Transport } from "./client";

export const MAPRO_CODE = "MAPRO";
const NAME = "Mapro";
const QUOTE_TTL = 5 * 60;
const DETAIL_TTL = 24 * 3600;
const CALENDAR_TTL = 10 * 60;
const WHOAMI_TTL = 3600;
const MAX_PAGES = 15;
/** Conta de demonstração da MAPRO (casas fictícias): nunca vender em produção. */
export const MAPRO_DEMO_CUSTOMERS = ["01DKZ03C0Z6WBTWQESG7AZY6V1"];

// ───────────── Tipos da API ─────────────

type I18n = Record<string, string | null | undefined> | null | undefined;
type MpPhoto = { small?: string; preview?: string; original?: string; thumbnail?: string; type?: string; title?: string };
type MpAddress = {
  street?: string | null;
  postalCode?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  cityRegion?: string | null;
  fullAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
type MpBed = { title?: string; shortTitle?: string; bedCapacity?: number; code?: string };
type MpRoom = { maxOccupancy?: number; beds?: string[]; bedsDetails?: MpBed[]; master?: number; private?: number; type?: string };
export type MpProperty = {
  id: string;
  alias?: string;
  title?: I18n;
  description?: I18n;
  bedrooms?: number;
  bathrooms?: number;
  maxOccupancy?: number;
  propertyType?: string;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  address?: MpAddress;
  LivingAreaSQFT?: number | null;
  amenities?: string[];
  resort?: { id?: string; title?: string; address?: string; description?: I18n } | null;
  mainPhoto?: MpPhoto | string | null;
  photoGallery?: MpPhoto[];
  photos?: MpPhoto[];
  roomsDetails?: MpRoom[];
  isActive?: number;
  taxes?: { title?: string; percent?: string }[];
};
type MpTax = { code?: string; name?: string; rate?: number; amount?: string };
export type MpQuote = {
  currency?: string;
  summary: { subtotal?: string; tax_total?: string; discount_total?: string; grand_total: string };
  rent: { base_amount: string; tax_total?: string; total?: string; taxes?: MpTax[] };
  services?: { name?: string; base_amount?: string; tax_total?: string; total?: string }[];
  taxes?: MpTax[];
};
type MpQuoted = MpProperty & { quote: MpQuote };
type Page = { hasNextPage?: boolean; nextCursor?: string | null; link?: string | null; links?: { next?: string | null } | null };
type QuoteListRS = { status?: number; quote?: MpQuoted[]; paginanation?: Page; pagination?: Page };
type ReservationListRS = { reservations?: MpReservation[]; pagination?: Page; paginanation?: Page };

/** Próxima página: o link pronto da API quando vier; senão, o cursor. */
export function nextPagePath(path: string, params: Record<string, string>, pg: Page | null | undefined): string | null {
  if (!pg?.hasNextPage) return null;
  const link = pg.links?.next ?? pg.link ?? null;
  if (link) {
    try {
      const u = new URL(link, "https://api.invalid");
      if (u.pathname.startsWith("/v1/")) return `${u.pathname}${u.search}`;
    } catch {
      /* link inválido: usa o cursor */
    }
  }
  return pg.nextCursor ? `${path}?${new URLSearchParams({ ...params, cursor: pg.nextCursor })}` : null;
}
export type MpReservation = {
  propertyId?: string;
  reservationId: string;
  status?: string;
  referenceCode?: string;
  arrival?: string;
  departure?: string;
  isCanceled?: boolean;
  canceledOn?: string | null;
  channel?: { id?: string; name?: string } | null;
  numberOfGuests?: number;
  doorCode?: string | null;
  gateCode?: string | null;
  wifiName?: string | null;
  wifiPassword?: string | null;
  currency?: string;
  amountRent?: string;
  amountExtras?: string;
  amountTotal?: string;
  totalTaxAmount?: string;
  pendingAmount?: string;
  guest?: { guestFullName?: string; guestFirstName?: string; guestLastName?: string } | null;
};
type WhoAmI = { status?: number; integration?: string; customer_id?: string; customer_name?: string };

// ───────────── Helpers puros (testados) ─────────────

const pick = (t: I18n): string => {
  if (!t) return "";
  const v = t.pt ?? t.pt_BR ?? t["pt-BR"] ?? t.en ?? t.en_US ?? Object.values(t).find((x) => !!x?.trim());
  return (v ?? "").replace(/\r\n?/g, "\n").trim();
};

const photoUrl = (p: MpPhoto | string | null | undefined): string | null => (typeof p === "string" ? p : (p?.preview ?? p?.original ?? p?.small ?? null)) || null;

const guestsOf = (pax: Partial<PaxConfig>) => Math.max(1, Number(pax.adults ?? 0)) + Math.max(0, Number(pax.children ?? 0));

function normalizeHousePax(pax: Partial<PaxConfig> | undefined): PaxConfig {
  return { adults: Math.max(1, Math.floor(Number(pax?.adults ?? 2)) || 1), children: Math.max(0, Math.floor(Number(pax?.children ?? 0)) || 0) };
}

/** Nome da taxa da administradora em português. */
export function feeLabel(name: string): string {
  const n = name.toLowerCase();
  if (/deposit|cau[çc][ãa]o/.test(n)) return "Caução (reembolsável pela administradora)";
  if (/clean/.test(n)) return "Taxa de limpeza";
  if (/linen|towel|laundry/.test(n)) return "Roupa de cama e banho";
  if (/processing|booking fee|service fee|admin/.test(n)) return "Taxa de processamento";
  if (/handyman|maintenance/.test(n)) return "Taxa de manutenção";
  if (/pool.*heat|heat.*pool/.test(n)) return "Aquecimento da piscina";
  if (/damage|insurance|waiver/.test(n)) return "Proteção contra danos";
  if (/resort/.test(n)) return "Taxa do condomínio";
  if (/pet/.test(n)) return "Taxa pet";
  return name.trim();
}

/** Linhas de custo da cotação (somam exatamente o total cobrado pela administradora). */
export function quoteLines(q: MpQuote, nights: number): PriceLine[] {
  const grand = new Decimal(money2(q.summary.grand_total));
  const lines: PriceLine[] = [{ type: "NIGHT", label: `Aluguel da casa · ${nights} noite${nights > 1 ? "s" : ""}`, unitCost: money2(q.rent.base_amount), quantity: 1 }];
  // taxas com o mesmo nome em português (ex.: duas "processing fee") viram uma linha só
  const fees = new Map<string, Decimal>();
  for (const s of q.services ?? []) {
    const base = new Decimal(money2(s.base_amount ?? "0"));
    if (base.gt(0)) {
      const label = feeLabel(s.name ?? "Taxa");
      fees.set(label, (fees.get(label) ?? new Decimal(0)).plus(base));
    }
  }
  for (const [label, v] of fees) lines.push({ type: /^Caução/.test(label) ? "DEPOSIT" : "FEE", label, unitCost: v.toFixed(2), quantity: 1 });
  const tax = new Decimal(money2(q.summary.tax_total ?? "0"));
  if (tax.gt(0)) lines.push({ type: "TAX", label: "Impostos locais (Sales Tax e Tourist Tax)", unitCost: tax.toFixed(2), quantity: 1 });
  const sum = lines.reduce((s, l) => s.plus(l.unitCost), new Decimal(0));
  // desconto/arredondamento do fornecedor: o total dele manda
  if (!sum.eq(grand)) return [{ type: "STAY", label: `Estadia completa · ${nights} noite${nights > 1 ? "s" : ""} (aluguel, taxas e impostos)`, unitCost: grand.toFixed(2), quantity: 1 }];
  return lines;
}

const BED_PT: [RegExp, string][] = [
  [/bunk/i, "Beliche"],
  [/king/i, "King"],
  [/queen/i, "Queen"],
  [/full|double/i, "Casal"],
  [/twin|single/i, "Solteiro"],
  [/sofa/i, "Sofá-cama"],
  [/trundle/i, "Bicama"],
  [/crib|cot/i, "Berço"],
  [/futon/i, "Futon"],
  [/day ?bed/i, "Daybed"],
];
const bedPt = (b: string) => BED_PT.find(([re]) => re.test(b))?.[1] ?? b;

/** "Suíte 1: King · Quarto 2: Queen + Solteiro · …" */
export function bedsText(rooms: MpRoom[] | undefined): string | null {
  const list = (rooms ?? []).filter((r) => (r.type ?? "bed") === "bed" && (r.bedsDetails?.length || r.beds?.length));
  if (!list.length) return null;
  return list
    .map((r, i) => {
      const beds = (r.bedsDetails?.map((b) => b.title ?? b.shortTitle ?? "") ?? r.beds ?? []).filter(Boolean).map(bedPt);
      const counts = new Map<string, number>();
      for (const b of beds) counts.set(b, (counts.get(b) ?? 0) + 1);
      const txt = [...counts].map(([b, n]) => (n > 1 ? `${n} ${b}` : b)).join(" + ");
      return `${r.master ? "Suíte master" : r.private ? `Suíte ${i + 1}` : `Quarto ${i + 1}`}: ${txt}`;
    })
    .join(" · ");
}

/** Política de cancelamento: a API não informa — vale a regra configurada (MAPRO_FREE_CANCEL_DAYS). */
export function cancellationFor(checkIn: string, freeCancelDays: number | null): { until: string | null; text: string } {
  if (freeCancelDays && freeCancelDays > 0) {
    const until = addDays(checkIn, -freeCancelDays);
    if (until > todayLocal()) return { until, text: `Cancelamento grátis até ${brDate(until)}` };
  }
  return { until: null, text: "Não reembolsável" };
}

type Unavailability = { reason: string };

/** Por que a casa não está disponível nas datas (calendário diário da MAPRO). */
export function unavailableReason(calendar: Record<string, { minStayDays?: number; isAvailable?: number }> | null, checkIn: string, checkOut: string): Unavailability {
  if (!calendar) return { reason: "A casa não está disponível para estas datas." };
  const nights: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nights.push(d);
  const busy = nights.find((d) => calendar[d] && calendar[d].isAvailable === 0);
  if (busy) return { reason: `A casa já está reservada em ${brDate(busy)}. Escolha outras datas.` };
  const min = calendar[checkIn]?.minStayDays ?? 0;
  if (min > nights.length) return { reason: `Estadia mínima de ${min} noites para check-in em ${brDate(checkIn)}.` };
  if (nights.some((d) => !calendar[d])) return { reason: "As datas ainda não foram abertas pela administradora." };
  return { reason: "A casa não está disponível para estas datas." };
}

const housePaxRules = (max: number): PaxRule[] => [
  { type: "ADULT", label: "Adultos", min: 1, max: Math.max(1, max), hint: `A casa acomoda até ${max} hóspedes` },
  { type: "CHILD", label: "Crianças", min: 0, max: Math.max(0, max - 1), hint: "Crianças contam na capacidade da casa" },
];

/** Somente o que a listagem precisa (o cache não guarda descrição nem galeria). */
function slim(p: MpQuoted): MpQuoted {
  return {
    id: p.id,
    alias: p.alias,
    title: p.title,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    maxOccupancy: p.maxOccupancy,
    propertyType: p.propertyType,
    address: p.address
      ? { city: p.address.city, state: p.address.state, cityRegion: p.address.cityRegion, fullAddress: p.address.fullAddress, latitude: p.address.latitude, longitude: p.address.longitude }
      : undefined,
    amenities: p.amenities,
    resort: p.resort ? { id: p.resort.id, title: p.resort.title } : null,
    mainPhoto: photoUrl(p.mainPhoto),
    isActive: p.isActive,
    quote: p.quote,
  };
}

// ───────────── Adaptador ─────────────

export function createMaproAdapter(cfg: MaproConfig, opts: { transport?: Transport; freeCancelDays?: number | null; blockDemo?: boolean } = {}) {
  const client = new MaproClient(cfg, opts.transport);
  const account = stableId(cfg.baseUrl, cfg.token).slice(0, 10); // separa o cache por conta, sem expor o token
  const freeCancelDays = opts.freeCancelDays ?? null;
  let propertyIdQuoteBroken = false;
  const knownCities = new Set<string>();

  const whoami = () => cached(`mapro:${account}:whoami`, WHOAMI_TTL, () => client.get<WhoAmI>("/v1/whoami", 20_000));

  /** Em produção, o token da conta DEMO não vende nada (as casas dela são fictícias). */
  async function guard() {
    if (!opts.blockDemo) return;
    const who = await whoami();
    if (who.customer_id && MAPRO_DEMO_CUSTOMERS.includes(who.customer_id))
      throw new SupplierIntegrationError("MAPRO: o token configurado é o da conta DEMO (casas fictícias), use o token de produção da administradora", { demo: true });
  }

  /** Todas as casas disponíveis nas datas, com o preço (segue o cursor). */
  async function quoteAll(checkIn: string, checkOut: string): Promise<MpQuoted[]> {
    return cached(`mapro:${account}:quote:${checkIn}:${checkOut}`, QUOTE_TTL, async () => {
      const out: MpQuoted[] = [];
      const seen = new Set<string>();
      const params = { checkin: checkIn, checkout: checkOut };
      let next: string | null = `/v1/quote?${new URLSearchParams(params)}`;
      for (let page = 0; next && page < MAX_PAGES; page++) {
        let rs: QuoteListRS;
        try {
          rs = await client.get<QuoteListRS>(next, 45_000);
        } catch (e) {
          if (e instanceof MaproApiError && /no matching properties/i.test(e.message)) break;
          throw e;
        }
        const fresh = (rs.quote ?? []).filter((p) => p?.id && p.quote?.summary && !seen.has(p.id));
        for (const p of fresh) {
          seen.add(p.id);
          out.push(slim(p));
        }
        // página sem casa nova = fim (proteção contra cursor que não avança)
        next = fresh.length ? nextPagePath("/v1/quote", params, rs.paginanation ?? rs.pagination) : null;
      }
      for (const p of out) if (p.address?.city) knownCities.add(cityLabel(p.address.city));
      return out;
    });
  }

  async function property(id: string): Promise<MpProperty | null> {
    if (!/^[0-9A-Za-z]{10,40}$/.test(id)) return null;
    return cached(
      `mapro:${account}:prop:${id}`,
      DETAIL_TTL,
      async () => {
        try {
          return (await client.get<{ property?: MpProperty }>(`/v1/properties/${id}`, 30_000)).property ?? null;
        } catch (e) {
          if (e instanceof MaproApiError && e.status < 500 && e.status !== 401 && e.status !== 403) return null;
          throw e;
        }
      },
      { cacheIf: (v) => v !== null },
    );
  }

  async function calendar(id: string) {
    return cached(`mapro:${account}:cal:${id}`, CALENDAR_TTL, async () => (await client.get<{ calendars?: Record<string, { minStayDays?: number; isAvailable?: number }> }>(`/v1/properties/${id}/calendars`, 30_000)).calendars ?? null).catch(
      () => null,
    );
  }

  /** Cotação de UMA casa. Reaproveita a busca (cache) quando não é preciso preço novo. */
  async function quoteFor(p: MpProperty, checkIn: string, checkOut: string, o: { fresh?: boolean } = {}): Promise<MpQuote | null> {
    if (!o.fresh) {
      const list = await cacheGet<MpQuoted[]>(`mapro:${account}:quote:${checkIn}:${checkOut}`);
      const hit = list?.find((x) => x.id === p.id);
      if (hit) return hit.quote;
    }
    const load = async (): Promise<MpQuote | null> => {
      const base = { checkin: checkIn, checkout: checkOut };
      if (!propertyIdQuoteBroken) {
        try {
          const rs = await client.get<QuoteListRS>(`/v1/quote?${new URLSearchParams({ ...base, property_id: p.id })}`, 45_000);
          return rs.quote?.find((x) => x.id === p.id)?.quote ?? null;
        } catch (e) {
          if (!(e instanceof MaproApiError)) throw e;
          if (/no matching properties/i.test(e.message)) return null;
          if (e.status === 401 || e.status === 403) throw e;
          // a consulta por property_id falha (HTTP 500) em algumas contas: busca pelo apelido da casa
          propertyIdQuoteBroken = true;
        }
      }
      if (!p.alias) return null;
      try {
        const rs = await client.get<QuoteListRS>(`/v1/quote?${new URLSearchParams({ ...base, query: p.alias })}`, 45_000);
        return rs.quote?.find((x) => x.id === p.id)?.quote ?? null;
      } catch (e) {
        if (e instanceof MaproApiError && /no matching properties/i.test(e.message)) return null;
        throw e;
      }
    };
    return o.fresh ? load() : cached(`mapro:${account}:pq:${p.id}:${checkIn}:${checkOut}`, QUOTE_TTL, load);
  }

  const titleOf = (p: MpProperty) => pick(p.title) || p.alias || "Casa de temporada";
  const subtitleOf = (p: MpProperty) =>
    [propertyTypeLabel(p.propertyType), p.bedrooms ? `${p.bedrooms} quarto${p.bedrooms > 1 ? "s" : ""}` : null, p.bathrooms ? `${bathroomsText(p.bathrooms)} banheiro${Number(p.bathrooms) > 1 ? "s" : ""}` : null, p.maxOccupancy ? `até ${p.maxOccupancy} hóspedes` : null]
      .filter(Boolean)
      .join(" · ");
  const locationOf = (p: MpProperty) => [p.resort?.title?.trim(), [cityLabel(p.address?.city), p.address?.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const currencyOf = (q: MpQuote): Currency => {
    const c = asCurrency(q.currency ?? "USD");
    if (!c) throw new SupplierIntegrationError(`MAPRO: moeda não suportada (${q.currency})`);
    return c;
  };
  const tagsOf = (p: MpProperty) => {
    const ids = p.amenities ?? [];
    const out: string[] = [];
    if (hasAmenity(ids, "private_pool", "heated_private_pool")) out.push("Piscina privativa");
    if (hasAmenity(ids, "game_room")) out.push("Sala de jogos");
    if (hasAmenity(ids, "hot_tub", "jacuzzi")) out.push("Hidromassagem");
    if (hasAmenity(ids, "resort_access", "communal_pool")) out.push("Clube do condomínio");
    return out.slice(0, 3);
  };

  function summaryOf(p: MpProperty, q: MpQuote, nights: number): ProductSummary {
    return {
      supplierCode: MAPRO_CODE,
      supplierName: NAME,
      category: "HOUSES",
      productId: p.id,
      title: titleOf(p),
      subtitle: subtitleOf(p),
      location: locationOf(p),
      destination: cityLabel(p.address?.city) || "Orlando",
      imageUrl: photoUrl(p.mainPhoto),
      tags: tagsOf(p),
      currency: currencyOf(q),
      lines: quoteLines(q, nights),
      area: p.resort?.title?.trim() || cityLabel(p.address?.city) || null,
      house: { bedrooms: p.bedrooms ?? 0, bathrooms: Number(p.bathrooms ?? 0), maxGuests: p.maxOccupancy ?? 0, privatePool: hasAmenity(p.amenities ?? [], "private_pool", "heated_private_pool") },
    };
  }

  function feeNotes(q: MpQuote, p: MpProperty): string[] {
    const notes: string[] = [];
    const paid = (q.services ?? []).filter((s) => new Decimal(money2(s.base_amount ?? "0")).gt(0));
    const fees = [...new Set(paid.map((s) => feeLabel(s.name ?? "Taxa")).filter((l) => !/^Caução/.test(l)))];
    if (fees.length) notes.push(`Já inclui: ${fees.join(", ").toLowerCase()} e impostos locais.`);
    const deposit = paid.filter((s) => /^Caução/.test(feeLabel(s.name ?? ""))).reduce((t, s) => t.plus(money2(s.base_amount ?? "0")), new Decimal(0));
    if (deposit.gt(0))
      notes.push(`Inclui caução de ${q.currency ?? "USD"} ${deposit.toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, devolvida pela administradora após a vistoria de saída.`);
    const ci = hourText(p.checkinTime);
    const co = hourText(p.checkoutTime);
    if (ci || co) notes.push([ci ? `Check-in a partir das ${ci}` : null, co ? `check-out até ${co}` : null].filter(Boolean).join(" · "));
    return notes;
  }

  function optionOf(p: MpProperty, q: MpQuote | null, stay: { checkIn: string; nights: number }, pax: PaxConfig, why: string | null): OfferOption {
    const canc = cancellationFor(stay.checkIn, freeCancelDays);
    const fits = guestsOf(pax) <= (p.maxOccupancy ?? 99);
    return {
      optionId: "casa",
      title: "Casa inteira",
      description: subtitleOf(p),
      currency: q ? currencyOf(q) : "USD",
      lines: q ? quoteLines(q, stay.nights) : [],
      attributes: [{ label: "Cancelamento", value: canc.text }],
      notes: q ? feeNotes(q, p) : why ? [why] : [],
      freeCancellationUntil: canc.until,
      available: !!q && fits,
    };
  }

  const adapter: SupplierAdapter & { client: MaproClient; whoami: typeof whoami } = {
    code: MAPRO_CODE,
    name: NAME,
    category: "HOUSES",
    defaultCurrency: "USD",
    live: true,
    client,
    whoami,
    cancelSimulation: false,

    destinations() {
      const list = knownCities.size ? [...knownCities] : ["Orlando", "Kissimmee", "Davenport"];
      return [...new Set(["Orlando", ...list])].map((name) => ({ id: name, name }));
    },

    async search(params: SearchParams): Promise<ProductSummary[]> {
      const stay = validateStay(params.checkIn, params.checkOut);
      await guard();
      const guests = guestsOf(normalizeHousePax(params.pax));
      const list = await quoteAll(stay.checkIn, stay.checkOut);
      return list
        .filter((p) => p.isActive !== 0 && (p.maxOccupancy ?? 0) >= guests)
        .filter((p) =>
          matchesHouseDestination(params.destination, {
            city: p.address?.city,
            state: p.address?.state,
            region: p.address?.cityRegion,
            resort: p.resort?.title,
            title: pick(p.title),
            alias: p.alias,
            address: p.address?.fullAddress,
            lat: p.address?.latitude,
            lon: p.address?.longitude,
          }),
        )
        .map((p) => summaryOf(p, p.quote, stay.nights));
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      await guard();
      const p = await property(productId);
      if (!p) return null;
      const pax = normalizeHousePax(params.pax);
      let stay: { checkIn: string; checkOut: string; nights: number };
      try {
        stay = validateStay(params.checkIn, params.checkOut);
      } catch {
        stay = { checkIn: addDays(todayLocal(), 30), checkOut: addDays(todayLocal(), 37), nights: 7 };
      }
      const q = await quoteFor(p, stay.checkIn, stay.checkOut);
      const why = q ? null : unavailableReason(await calendar(p.id), stay.checkIn, stay.checkOut).reason;
      const option = optionOf(p, q, stay, pax, why);
      const gallery = [...new Set([...(p.photos ?? []), ...(p.photoGallery ?? [])].map((x) => x.preview ?? x.original ?? "").filter((u) => /^https?:\/\//.test(u)))];
      const beds = bedsText(p.roomsDetails);
      const resortText = pick(p.resort?.description);
      const description = [pick(p.description), beds ? `Quartos e camas: ${beds}.` : null, p.resort?.title && resortText ? `Sobre o condomínio ${p.resort.title.trim()}: ${resortText}` : null].filter(Boolean).join("\n\n");
      const m2 = sqftToM2(p.LivingAreaSQFT);
      const summary: ProductSummary = q ? summaryOf(p, q, stay.nights) : { ...summaryOf(p, { summary: { grand_total: "0" }, rent: { base_amount: "0" } }, stay.nights), lines: [] };
      return {
        ...summary,
        imageUrl: gallery[0] ?? summary.imageUrl,
        description,
        gallery,
        highlights: rankAmenities(p.amenities ?? []).slice(0, 18),
        options: [option],
        paxRules: housePaxRules(p.maxOccupancy ?? 1),
        info: [
          { label: "Tipo", value: propertyTypeLabel(p.propertyType) },
          ...(p.bedrooms ? [{ label: "Quartos", value: String(p.bedrooms) }] : []),
          ...(p.bathrooms ? [{ label: "Banheiros", value: bathroomsText(p.bathrooms) }] : []),
          ...(p.maxOccupancy ? [{ label: "Capacidade", value: `${p.maxOccupancy} hóspedes` }] : []),
          ...(m2 ? [{ label: "Área", value: `${m2} m²` }] : []),
          ...(p.resort?.title ? [{ label: "Condomínio", value: p.resort.title.trim() }] : []),
          ...(hourText(p.checkinTime) ? [{ label: "Check-in", value: `a partir das ${hourText(p.checkinTime)}` }] : []),
          ...(hourText(p.checkoutTime) ? [{ label: "Check-out", value: `até ${hourText(p.checkoutTime)}` }] : []),
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      const stay = validateStay(req.checkIn, req.checkOut);
      await guard();
      const p = await property(req.productId);
      if (!p) throw new SupplierError("Casa não encontrada no fornecedor");
      const pax = normalizeHousePax(req.pax);
      const max = p.maxOccupancy ?? 0;
      if (max && guestsOf(pax) > max) throw new SupplierError(`Esta casa acomoda até ${max} hóspedes (adultos e crianças).`);
      const q = await quoteFor(p, stay.checkIn, stay.checkOut, { fresh: true });
      if (!q) throw new SupplierError(unavailableReason(await calendar(p.id), stay.checkIn, stay.checkOut).reason);
      const lines = quoteLines(q, stay.nights);
      const canc = cancellationFor(stay.checkIn, freeCancelDays);
      const who = await whoami().catch(() => null);
      return {
        supplierCode: MAPRO_CODE,
        category: "HOUSES",
        productId: p.id,
        optionId: "casa",
        title: titleOf(p),
        subtitle: `${subtitleOf(p)} · ${stay.nights} noite${stay.nights > 1 ? "s" : ""}`,
        location: locationOf(p) || null,
        imageUrl: photoUrl(p.mainPhoto) ?? photoUrl(p.photos?.[0]),
        serviceDate: stay.checkIn,
        serviceEndDate: stay.checkOut,
        expiresAt: expiresAtFor(stay.checkIn),
        currency: currencyOf(q),
        lines,
        pax,
        paxRules: housePaxRules(max || 1),
        details: {
          propertyId: p.id,
          alias: p.alias ?? null,
          houseName: titleOf(p),
          nights: stay.nights,
          address: p.address?.fullAddress ?? null,
          resort: p.resort?.title?.trim() ?? null,
          bedrooms: p.bedrooms ?? null,
          bathrooms: p.bathrooms ?? null,
          maxOccupancy: max || null,
          checkinTime: hourText(p.checkinTime),
          checkoutTime: hourText(p.checkoutTime),
          grandTotal: money2(q.summary.grand_total),
          cancellation: canc.text,
          freeCancellationUntil: canc.until,
          nonRefundable: !canc.until,
          notes: feeNotes(q, p),
          propertyManager: who?.customer_name ?? null,
        },
        quoteRef: stableId(MAPRO_CODE, p.id, stay.checkIn, stay.checkOut, q.summary.grand_total),
      };
    },

    async findBooking(item: BookItem): Promise<BookingResult | null> {
      const checkIn = item.serviceDate ?? null;
      const checkOut = item.serviceEndDate ?? null;
      if (!checkIn || !checkOut) return null;
      const who = await whoami();
      // mesma casa, mesmas datas, feita pelo nosso canal e não cancelada → é a nossa reserva
      const ours = (x: MpReservation) =>
        x.propertyId === item.productId &&
        (x.arrival ?? "").startsWith(checkIn) &&
        (x.departure ?? "").startsWith(checkOut) &&
        !x.isCanceled &&
        (!who.integration || !x.channel?.name || x.channel.name === who.integration);
      // a lista traz TODAS as reservas da administradora no período: percorre todas as páginas
      const params = { from: checkIn, to: checkOut, limit: "100" };
      let next: string | null = `/v1/reservations?${new URLSearchParams(params)}`;
      for (let page = 0; next && page < 30; page++) {
        const rs: ReservationListRS = await client.get<ReservationListRS>(next, 30_000);
        const list = rs.reservations ?? [];
        const r = list.find(ours);
        if (r) return toResult(r);
        next = list.length ? nextPagePath("/v1/reservations", params, rs.pagination ?? rs.paginanation) : null;
      }
      return null;
    },

    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      const checkIn = item.serviceDate ?? undefined;
      const checkOut = item.serviceEndDate ?? undefined;
      if (!checkIn || !checkOut) throw new SupplierError("Reserva sem datas de check-in/check-out");
      await guard();
      const existing = await adapter.findBooking!(item);
      if (existing) return existing;
      const stay = validateStay(checkIn, checkOut);
      const p = await property(item.productId);
      if (!p) throw new SupplierError("Casa não encontrada no fornecedor");
      // preço do momento: nunca reservar acima do custo vendido
      const q = await quoteFor(p, stay.checkIn, stay.checkOut, { fresh: true });
      if (!q) throw new SupplierError(unavailableReason(await calendar(p.id), stay.checkIn, stay.checkOut).reason);
      const total = new Decimal(money2(q.summary.grand_total));
      if (item.maxCost) {
        if ((q.currency ?? "USD").toUpperCase() !== item.maxCost.currency) throw new SupplierError(`A administradora mudou a moeda (${q.currency}), não reservamos`);
        if (total.gt(new Decimal(item.maxCost.amount).plus("0.01")))
          throw new SupplierError(`A administradora aumentou o preço (${item.maxCost.currency} ${total.toFixed(2)} > vendido ${new Decimal(item.maxCost.amount).toFixed(2)}). A reserva não foi feita.`);
      }
      const holder = ctx.holder ?? ctx.travelers.find((t) => t.type !== "CHILD" && t.name?.trim()) ?? null;
      if (!holder?.name?.trim()) throw new SupplierError("Informe o nome do hóspede responsável");
      const name = splitName(holder.name);
      const email = ctx.contact?.email?.trim() || holder.email?.trim();
      const phone = (ctx.contact?.phone ?? holder.phone ?? "").replace(/[^\d+]/g, "");
      if (!email || !phone) throw new SupplierError("A administradora exige e-mail e telefone do hóspede responsável");
      const state = (ctx.contact?.state ?? holder.address?.state ?? "").trim().toUpperCase();
      let created: { reservation_id?: string; reservation_ulid?: string; msg?: string };
      try {
        created = await client.post("/v1/reservations", {
          property_id: p.id,
          checkin: stay.checkIn,
          checkout: stay.checkOut,
          coupon: "",
          guest: {
            first_name: ascii(name.first),
            last_name: ascii(name.last),
            email,
            phone: phone.startsWith("+") ? phone : `+55${phone.replace(/^0+/, "")}`,
            state_code: /^[A-Z]{2}$/.test(state) ? state : "BR",
          },
        });
      } catch (e) {
        // sem resposta: pode ter reservado — procura antes de dizer que falhou
        if (e instanceof SupplierIntegrationError && e.detail?.timeout) {
          const found = await adapter.findBooking!(item).catch(() => null);
          if (found) return found;
        }
        if (e instanceof MaproApiError && e.status < 500 && e.status !== 401 && e.status !== 403) throw new SupplierError(`A MAPRO recusou a reserva: ${e.message.replace(/^MAPRO [^:]*: /, "")}`);
        throw e;
      }
      if (!created.reservation_ulid) throw new SupplierIntegrationError("MAPRO: reserva sem identificador na resposta", { created });
      const detail = await reservation(created.reservation_ulid).catch(() => null);
      const res = detail ?? { reservationId: created.reservation_ulid, referenceCode: created.reservation_id, status: "Confirmed", propertyId: p.id };
      const out = toResult(res);
      const charged = res.amountTotal ? new Decimal(money2(res.amountTotal)) : null;
      out.payload.quotedTotal = total.toFixed(2);
      if (charged) out.payload.bookedPrice = charged.toFixed(2);
      if (charged && item.maxCost && charged.gt(new Decimal(item.maxCost.amount).plus("0.01"))) out.payload.costAboveSold = true;
      return out;
    },

    async bookingStatus(bookingRef: string, stored?: Record<string, unknown>): Promise<BookingResult> {
      const ulid = ulidOf(bookingRef, stored);
      const r = await reservation(ulid);
      if (!r) throw new SupplierError("Reserva não encontrada na MAPRO");
      return toResult(r);
    },

    async cancelBooking(bookingRef: string, o: { simulate: boolean; stored?: Record<string, unknown> }): Promise<CancelResult> {
      if (o.simulate) throw new SupplierError("A MAPRO não simula a multa de cancelamento, confira a política com a administradora antes de cancelar");
      const ulid = ulidOf(bookingRef, o.stored);
      try {
        const r = await client.delete<{ msg?: string; reservation_id?: string; reservation_ulid?: string }>(`/v1/reservations/${ulid}`);
        return { status: "CANCELLED", penalty: null, reference: r.reservation_id ?? bookingRef, payload: { cancelMessage: r.msg ?? null, canceledAt: new Date().toISOString() } };
      } catch (e) {
        if (e instanceof MaproApiError && e.status < 500 && e.status !== 401 && e.status !== 403) throw new SupplierError(`A MAPRO não permitiu cancelar: ${e.message.replace(/^MAPRO [^:]*: /, "")}`);
        throw e;
      }
    },

    async voucher(bookingRef: string, stored?: Record<string, unknown>) {
      const r = await reservation(ulidOf(bookingRef, stored));
      if (!r) return null;
      const who = await whoami().catch(() => null);
      const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      return {
        bookedAndPayableBy: who?.customer_name ?? null,
        access: { doorCode: clean(r.doorCode), gateCode: clean(r.gateCode), wifiName: clean(r.wifiName), wifiPassword: clean(r.wifiPassword) },
      };
    },
  };

  async function reservation(ulid: string): Promise<MpReservation | null> {
    try {
      return (await client.get<{ reservation?: MpReservation }>(`/v1/reservations/${ulid}`, 30_000)).reservation ?? null;
    } catch (e) {
      if (e instanceof MaproApiError && /invalid_reservation_id|not found/i.test(`${e.code} ${e.message}`)) return null;
      throw e;
    }
  }

  return adapter;
}

function ulidOf(bookingRef: string, stored?: Record<string, unknown>): string {
  const u = typeof stored?.reservationUlid === "string" ? stored.reservationUlid : /^[0-9A-Z]{26}$/.test(bookingRef) ? bookingRef : null;
  if (!u) throw new SupplierError("Reserva sem o identificador da MAPRO (ULID), consulte pelo painel da administradora");
  return u;
}

function toResult(r: MpReservation): BookingResult {
  const status = r.isCanceled || /cancel/i.test(r.status ?? "") ? "CANCELLED" : /confirm|aprov|booked/i.test(r.status ?? "") ? "CONFIRMED" : "PENDING";
  return {
    bookingRef: r.referenceCode ?? r.reservationId,
    status,
    payload: {
      reservationUlid: r.reservationId,
      referenceCode: r.referenceCode ?? null,
      supplierStatus: r.status ?? null,
      currency: r.currency ?? null,
      amountTotal: r.amountTotal ?? null,
      pendingAmount: r.pendingAmount ?? null,
      arrival: r.arrival ?? null,
      departure: r.departure ?? null,
      channel: r.channel?.name ?? null,
      canceledOn: r.canceledOn ?? null,
    },
  };
}

export function createMaproFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const cfg = maproConfig(env);
  if (!cfg) return null;
  const days = Number(env.MAPRO_FREE_CANCEL_DAYS);
  return createMaproAdapter(cfg, {
    freeCancelDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    blockDemo: env.VERCEL_ENV === "production" && env.MAPRO_ALLOW_DEMO !== "1",
  });
}
