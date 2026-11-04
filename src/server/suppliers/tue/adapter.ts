/**
 * Adaptador real da Tu Experienza (Tue Distributor API v2.0) — ingressos e experiências.
 *
 * Fluxo (como recomenda a documentação da Tue):
 *  - search     → catálogo do distribuidor (GET /products, paginado; cache de 6 h) filtrado por destino;
 *  - getProduct → produto + horários da data (GET /availability, cache curto) → uma opção por horário;
 *  - quote      → horário revalidado (vagas) + preço por tipo de ingresso (adulto, criança…) na temporada;
 *  - book       → procura pedido com a nossa referência (nunca duplica) → cotação nova (não reserva acima
 *                 do custo vendido) → POST /reservations (bloqueio + preço do servidor, conferido) →
 *                 POST /orders CONFIRM_RESERVATION; sem resposta → procura pela referência antes de falhar;
 *  - status / voucher (códigos de entrada) → GET /orders/{ref}; cancelamento → DELETE /orders/{ref}.
 *
 * Custo = preço de revenda ao distribuidor (`product_type_resale_price`). Se a API não informar, vale o
 * preço de venda ao público (`product_type_sales_price`) — nunca vende abaixo do custo — e a cotação marca
 * `costBasis: "sales"` para a equipe conferir.
 */
import Decimal from "decimal.js";
import type { Currency, PaxConfig, PriceLine } from "@/server/db/schema";
import { addDays, startOfLocalDay, todayLocal } from "@/lib/tz";
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
import { cached, cachedStale, cacheSet } from "../hotels/cache";
import { asCurrency, ascii, brDate, money2, normalizeText, splitName, stableId, titleCase } from "../hotels/common";
import { TueApiError, TueClient, tueConfig, type TueConfig, type Transport } from "./client";

export const TUE_CODE = "TU_EXPERIENZA";
const NAME = "Tu Experienza";
const CATALOG_TTL = 6 * 3600;
const CATALOG_STALE = 48 * 3600;
const DETAIL_TTL = 6 * 3600;
const DEST_TTL = 24 * 3600;
const AVAIL_TTL = 3 * 60;
const MAX_PAGES = 20;

// ───────────── Tipos da API (somente o que usamos) ─────────────

type Pricing = { product_type_list_price?: string; product_type_sales_price?: string; product_type_resale_price?: string | null; product_type_discount?: string | null };
export type TueType = {
  product_type: string;
  product_type_id: string;
  product_type_label?: string;
  product_type_description?: string;
  product_type_age_from?: number | null;
  product_type_age_to?: number | null;
  product_type_quantity_min?: number | null;
  product_type_quantity_max?: number | null;
  product_type_price_type?: "INDIVIDUAL" | "GROUP";
  product_type_pricing: Pricing;
};
type Season = { product_type_season_start_date?: string; product_type_season_end_date?: string | null; product_type_season_details?: TueType[] };
type Address = { city?: string; country?: string; country_code?: string; latitude?: string; longitude?: string; street?: string; name?: string };
type Location = { location_id?: string; location_name?: string; location_type?: string; location_address?: Address };
type Policy = { cancellation_description?: string; cancellation_type?: string; cancellation_fee_threshold?: number; cancellation_fee_percentage?: number; cancellation_fee_amount?: string };
type Content = {
  product_title?: string;
  product_short_description?: string;
  product_long_description?: string;
  product_additional_information?: string;
  product_entry_notes?: string;
  product_duration_text?: string;
  product_highlights?: { highlight_description?: string }[];
  product_includes?: { include_description?: string }[];
  product_excludes?: { exclude_description?: string }[];
  product_images?: { image_type?: string; image_url?: string }[];
};
export type TueProduct = {
  product_id: string;
  product_class?: string;
  product_catalogue_status?: string;
  product_admission_type?: string;
  product_availability?: boolean;
  product_capacity?: boolean;
  product_traveldate_required?: boolean;
  product_booking_quantity_min?: number | null;
  product_booking_quantity_max?: number | null;
  product_booking_advance_time_min?: number | null;
  product_booking_start_date?: string | null;
  product_end_date?: string | null;
  product_pickup_point?: string;
  product_options?: { option_mandatory?: boolean }[];
  product_cancellation_allowed?: boolean;
  product_cancellation_policies?: Policy[];
  product_payment_detail?: { product_payment_currency?: { currency_code?: string } };
  product_content_languages?: string[];
  product_content?: Content;
  product_locations?: Location[];
  product_destinations?: string[];
  product_duration?: number | null;
  product_type_seasons?: Season[];
  product_code_settings?: { product_code_format?: string };
};
export type TueSlot = {
  availability_id: string;
  availability_active?: boolean;
  availability_label?: string;
  availability_from_date_time: string;
  availability_to_date_time?: string;
  availability_spots?: { availability_spots_open?: number };
  availability_pricing?: {
    availability_pricing_variation_amount: string;
    availability_pricing_variation_price_type?: "SALES_PRICE" | "RESALE_PRICE";
    availability_pricing_variation_product_type_id?: string;
    availability_pricing_variation_product_type?: string;
  }[];
};
type Destination = { destination_id: string; destination_name?: string; destination_city?: string; destination_country?: string };
type ListEnvelope<T> = { data?: { items?: T[]; page_index?: number; total_pages?: number; total_items?: number } };
type BookingRS = {
  booking_reference?: string;
  booking_external_reference?: string;
  booking_status?: string;
  booking_travel_date?: string;
  booking_voucher_released?: boolean;
  booking_voucher_url?: string;
  product_id?: string;
  product_title?: string;
  product_currency_code?: string;
  product_availability_from_date_time?: string;
  product_code?: string;
  product_code_settings?: { product_code_format?: string };
  product_cancellation_allowed?: boolean;
  product_cancellation_policies?: Policy[];
  product_entry_notes?: string;
  booking_pricing?: { price_total?: string };
  product_type_details?: { product_type?: string; product_type_label?: string; product_type_code?: string; product_type_status?: string }[];
};
export type TueOrder = {
  order_reference: string;
  order_external_reference?: string;
  order_status?: string;
  order_voucher_url?: string;
  order_pricing?: { price_total?: string };
  order_bookings?: BookingRS[];
};
type ReservationRS = {
  reservation_reference?: string;
  reservation_valid_until?: string;
  reservation_pricing?: { price_total?: string };
  reservation_details?: { product_currency_code?: string; booking_status?: string }[];
  reservation_checkout_fields?: { checkout_field_id?: string; checkout_field_restriction?: string; checkout_field_type?: string }[];
};

// ───────────── Regras puras (testadas) ─────────────

type Kind = "ADULT" | "CHILD" | "SENIOR";
const KIND_TYPES: Record<Kind, string[]> = { ADULT: ["ADULT", "PERSON"], CHILD: ["CHILD", "YOUTH"], SENIOR: ["SENIOR"] };
const KIND_LABEL: Record<Kind, string> = { ADULT: "Adulto", CHILD: "Criança", SENIOR: "Sênior" };

const day = (iso: string | null | undefined) => (iso ?? "").slice(0, 10);

/** Temporada de preço que vale para a data (início ≤ data ≤ fim). */
export function seasonFor(p: Pick<TueProduct, "product_type_seasons">, date: string): Season | null {
  const seasons = p.product_type_seasons ?? [];
  return (
    seasons.find((s) => day(s.product_type_season_start_date) <= date && (!s.product_type_season_end_date || date <= day(s.product_type_season_end_date))) ??
    (seasons.length === 1 && !seasons[0].product_type_season_start_date ? seasons[0] : null)
  );
}

export function typeFor(season: Season | null, kind: Kind): TueType | null {
  const list = season?.product_type_season_details ?? [];
  for (const t of KIND_TYPES[kind]) {
    const hit = list.find((x) => x.product_type === t && x.product_type_id);
    if (hit) return hit;
  }
  // sênior sem tarifa própria paga como adulto
  return kind === "SENIOR" ? typeFor(season, "ADULT") : null;
}

/** Base de custo do produto: revenda ao distribuidor quando a API informa; senão, preço de venda. */
export function costBasisOf(types: TueType[]): "resale" | "sales" {
  return types.length && types.every((t) => (t.product_type_pricing.product_type_resale_price ?? "").trim() !== "") ? "resale" : "sales";
}

/** Custo unitário do tipo (na base escolhida) + variações do horário (dinâmicas/diárias). */
export function unitCost(t: TueType, basis: "resale" | "sales", slot?: TueSlot | null): string {
  const base = basis === "resale" ? t.product_type_pricing.product_type_resale_price : t.product_type_pricing.product_type_sales_price;
  let v = new Decimal(money2(base ?? "NaN"));
  for (const pv of slot?.availability_pricing ?? []) {
    const type = pv.availability_pricing_variation_price_type ?? "SALES_PRICE";
    if ((basis === "resale") !== (type === "RESALE_PRICE")) continue;
    if (pv.availability_pricing_variation_product_type_id && pv.availability_pricing_variation_product_type_id !== t.product_type_id) continue;
    if (pv.availability_pricing_variation_product_type && pv.availability_pricing_variation_product_type !== t.product_type) continue;
    v = v.plus(new Decimal(String(pv.availability_pricing_variation_amount || "0")));
  }
  if (v.lt(0)) v = new Decimal(0);
  return v.toFixed(2);
}

export function typeLabel(t: TueType, kind: Kind): string {
  const from = t.product_type_age_from;
  const to = t.product_type_age_to;
  // faixa "0 a 99" = qualquer idade: não diz nada ao cliente
  const anyAge = (from ?? 0) <= 0 && (to == null || to >= 99);
  const ages = anyAge ? "" : from != null && to != null && to < 99 ? ` (${from} a ${to} anos)` : from != null ? ` (${from}+ anos)` : to != null ? ` (até ${to} anos)` : "";
  return `${KIND_LABEL[kind]}${ages}`;
}

/** Política de cancelamento em português (a Tue fatura conforme esta política). */
export function cancellationOf(p: Pick<TueProduct, "product_cancellation_allowed" | "product_cancellation_policies">, visitDate: string | null): { text: string; until: string | null } {
  if (p.product_cancellation_allowed === false) return { text: "Não reembolsável", until: null };
  const policies = p.product_cancellation_policies ?? [];
  // o texto livre da política vem no idioma do fornecedor (às vezes espanhol): montamos em português
  // a partir dos campos estruturados, sempre pelo lado seguro (prazo maior, 1 dia de folga pelo fuso)
  if (policies.some((x) => x.cancellation_type === "BOOKING_DATE")) return { text: "Cancelamento com multa, conforme a política do ingresso", until: null };
  // percentual/valor ausentes = multa não informada (só um 0 explícito é grátis): conta como multa, pelo lado seguro
  const charged = policies.filter((x) => (x.cancellation_fee_percentage == null && x.cancellation_fee_amount == null) || Number(x.cancellation_fee_percentage ?? 0) > 0 || Number(x.cancellation_fee_amount ?? 0) > 0);
  const maxMinutes = Math.max(0, ...policies.map((x) => Number(x.cancellation_fee_threshold) || 0));
  const days = Math.ceil(maxMinutes / 1440) + 1;
  const pct = Math.max(0, ...charged.map((x) => Number(x.cancellation_fee_percentage ?? 0)));
  const afterwards = !charged.length ? "" : pct >= 100 && charged.length === 1 ? "; depois, não reembolsável" : pct > 0 ? `; depois, multa de até ${pct.toLocaleString("pt-BR")}%` : "; depois, com multa";
  if (!visitDate) return { text: `Cancelamento grátis até ${days} ${days > 1 ? "dias" : "dia"} antes da visita${afterwards}`, until: null };
  const until = addDays(visitDate, -days);
  if (until >= todayLocal()) return { text: `Cancelamento grátis até ${brDate(until)}${afterwards}`, until };
  if (!charged.length) return { text: "Cancelamento grátis antes do uso", until: null };
  return { text: pct >= 100 && charged.length === 1 ? "Não reembolsável para esta data" : `Cancelamento com multa${pct > 0 ? ` de até ${pct.toLocaleString("pt-BR")}%` : ""} para esta data`, until: null };
}

/** "1.5 hour" → "1,5 h", "1 day" → "1 dia", "2-3 hours" → "2 a 3 h"; sem padrão conhecido, usa os minutos. */
export function durationPt(text: string | undefined | null, minutes?: number | null): string {
  const t = (text ?? "").trim();
  const m = t.match(/^(?:approx\.?\s*|aprox\.?\s*|about\s+)?(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to|a)\s*(\d+(?:[.,]\d+)?))?\s*(minutes?|minutos?|mins?|hours?|horas?|hrs?|h|days?|dias?|d)\.?$/i);
  if (m) {
    const n = (v: string) => v.replace(".", ",");
    const range = m[2] ? `${n(m[1])} a ${n(m[2])}` : n(m[1]);
    const unit = m[3].toLowerCase();
    if (unit.startsWith("m")) return `${range} min`;
    if (unit.startsWith("h")) return `${range} h`;
    return `${range} ${Number((m[2] ?? m[1]).replace(",", ".")) > 1 ? "dias" : "dia"}`;
  }
  if (minutes && minutes > 0) {
    if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} ${minutes > 1440 ? "dias" : "dia"}`;
    const h = Math.floor(minutes / 60);
    return [h ? `${h} h` : "", minutes % 60 ? `${minutes % 60} min` : ""].filter(Boolean).join(" ");
  }
  return t;
}

const ADMISSION_PT: Record<string, string> = {
  TIME_POINT: "Entrada no horário marcado",
  TIME_SLOT: "Horário de início e fim marcados",
  TIME_PERIOD: "Entrada a qualquer hora no período",
  TIME_DATE: "Válido durante o dia escolhido",
  TIME_OPEN: "Ingresso aberto (sem data marcada)",
};

/** "2026-12-18T10:30:00+01:00" → "10:30" (hora local do local da visita). */
export function slotTime(iso: string | undefined): string {
  const m = (iso ?? "").match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

/** Nomes em português → como o fornecedor escreve (busca por destino). */
const CITY_ALIASES: Record<string, string[]> = {
  roma: ["rome", "roma", "vatican", "vaticano"],
  vaticano: ["vatican", "vaticano", "rome", "roma"],
  florenca: ["florence", "firenze"],
  veneza: ["venice", "venezia"],
  milao: ["milan", "milano"],
  napoles: ["naples", "napoli"],
  pisa: ["pisa"],
  londres: ["london"],
  paris: ["paris"],
  lisboa: ["lisbon", "lisboa"],
  porto: ["porto", "oporto"],
  madri: ["madrid"],
  barcelona: ["barcelona"],
  amsterda: ["amsterdam"],
  amsterdam: ["amsterdam"],
  "nova york": ["new york", "nyc"],
  orlando: ["orlando", "kissimmee"],
  dubai: ["dubai"],
  atenas: ["athens"],
  berlim: ["berlin"],
  viena: ["vienna", "wien"],
  praga: ["prague", "praha"],
};

export function matchesTicketDestination(query: string | null | undefined, hay: string): boolean {
  const q = normalizeText((query ?? "").split(",")[0]);
  if (!q) return true;
  const h = normalizeText(hay);
  const terms = CITY_ALIASES[q] ?? [q];
  return terms.some((t) => h.includes(t));
}

/** Data/hora da visita para datas sem horário: meio-dia UTC mantém o mesmo dia em qualquer fuso. */
const travelDateTime = (date: string) => `${date}T12:00:00+00:00`;

function bookingStatusOf(bookings: BookingRS[]): string {
  const st = bookings.map((b) => b.booking_status ?? "");
  if (!st.length) return "PENDING";
  if (st.every((s) => /^BOOKING_(CONFIRMED|UPDATED)$/.test(s))) return "CONFIRMED";
  if (st.every((s) => /CANCELLED|EXPIRED/.test(s))) return "CANCELLED";
  if (st.some((s) => s === "BOOKING_FAILED")) return "REJECTED";
  return "PENDING";
}

/** Códigos de entrada (um por pessoa, ou um do grupo) — vão para o voucher do cliente. */
export function ticketCodes(order: TueOrder) {
  const out: { label: string; code: string }[] = [];
  for (const b of order.order_bookings ?? []) {
    if (b.product_code) out.push({ label: "Código do grupo", code: b.product_code });
    for (const t of b.product_type_details ?? []) if (t.product_type_code && t.product_type_code !== b.product_code) out.push({ label: t.product_type_label || KIND_LABEL[(t.product_type as Kind) ?? "ADULT"] || "Ingresso", code: t.product_type_code });
  }
  return out;
}

function resultOf(o: TueOrder): BookingResult {
  const b = o.order_bookings ?? [];
  return {
    bookingRef: o.order_reference,
    status: bookingStatusOf(b),
    payload: {
      orderReference: o.order_reference,
      externalReference: o.order_external_reference ?? null,
      bookingReferences: b.map((x) => x.booking_reference).filter(Boolean),
      supplierStatus: b.map((x) => x.booking_status).join(",") || (o.order_status ?? null),
      priceTotal: o.order_pricing?.price_total ?? null,
      currency: b[0]?.product_currency_code ?? null,
      travelDate: b[0]?.product_availability_from_date_time ?? b[0]?.booking_travel_date ?? null,
      codeFormat: b[0]?.product_code_settings?.product_code_format ?? null,
      codes: ticketCodes(o),
      vouchersReleased: b.every((x) => x.booking_voucher_released !== false),
      // link do voucher do fornecedor: só para a equipe (o cliente usa o nosso voucher com os códigos)
      supplierVoucherUrl: o.order_voucher_url ?? b[0]?.booking_voucher_url ?? null,
    },
  };
}

// ───────────── Adaptador ─────────────

export function createTueAdapter(cfg: TueConfig, opts: { transport?: Transport } = {}) {
  const client = new TueClient(cfg, opts.transport);
  const account = stableId(cfg.baseUrl, cfg.distributorId, cfg.username).slice(0, 10);
  const knownCities = new Set<string>();

  /** Catálogo do distribuidor (todas as páginas), já sem o que não dá para vender pela loja. */
  async function catalog(): Promise<TueProduct[]> {
    // catálogo velho (até 2 dias) é servido na hora enquanto a versão nova é baixada em segundo plano:
    // a loja não espera os ~20 s do catálogo completo; preço e vagas são reconfirmados no detalhe e na cotação
    return cachedStale(`tue:${account}:catalog-v2:${cfg.language}`, CATALOG_TTL, CATALOG_STALE, async () => {
      const out: TueProduct[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const rs = await client.get<ListEnvelope<TueProduct>>("/products", { distributor_id: cfg.distributorId, product_content_language: cfg.language, items_per_page: 500, page }, 45_000);
        out.push(...(rs.data?.items ?? []).filter(sellable).map(slim));
        const idx = rs.data?.page_index ?? page;
        if (!rs.data?.total_pages || idx >= rs.data.total_pages || !(rs.data.items ?? []).length) break;
      }
      for (const p of out) {
        const c = venue(p)?.location_address?.city;
        if (c) knownCities.add(titleCase(c));
      }
      return out;
    });
  }

  async function destinations(): Promise<Map<string, Destination>> {
    const list = await cached(`tue:${account}:destinations:${cfg.language}`, DEST_TTL, async () => {
      const rs = await client.get<ListEnvelope<Destination>>("/products/destinations", { distributor_id: cfg.distributorId, items_per_page: 500 }, 30_000);
      return (rs.data?.items ?? []).map((d) => ({ destination_id: d.destination_id, destination_name: d.destination_name, destination_city: d.destination_city, destination_country: d.destination_country }));
    }).catch(() => [] as Destination[]);
    return new Map(list.map((d) => [d.destination_id, d]));
  }

  async function product(id: string): Promise<TueProduct | null> {
    if (!/^[A-Za-z0-9._~-]{1,80}$/.test(id)) return null;
    return cached(
      `tue:${account}:product:${id}:${cfg.language}`,
      DETAIL_TTL,
      async () => {
        try {
          const rs = await client.get<{ data?: { product?: TueProduct } }>(`/products/${encodeURIComponent(id)}`, { distributor_id: cfg.distributorId, product_content_language: cfg.language }, 30_000);
          const p = rs.data?.product ?? null;
          return p && sellable(p) ? p : null;
        } catch (e) {
          if (e instanceof TueApiError && (e.status === 404 || e.status === 422)) return null;
          throw e;
        }
      },
      { cacheIf: (v) => v !== null },
    );
  }

  /** Horários de um dia (cache curto; `fresh` = consulta nova, usada ao cotar e reservar). */
  async function slots(productId: string, date: string, o: { fresh?: boolean } = {}): Promise<TueSlot[]> {
    const key = `tue:${account}:avail:${productId}:${date}`;
    const load = async () => {
      const rs = await client.get<ListEnvelope<TueSlot>>("/availability", { distributor_id: cfg.distributorId, product_id: productId, from_date: date, to_date: date }, 30_000);
      return (rs.data?.items ?? []).filter((s) => s.availability_active !== false && day(s.availability_from_date_time) === date).sort((a, b) => a.availability_from_date_time.localeCompare(b.availability_from_date_time));
    };
    if (!o.fresh) return cached(key, AVAIL_TTL, load);
    const fresh = await load();
    await cacheSet(key, fresh, AVAIL_TTL).catch(() => {});
    return fresh;
  }

  const currencyOf = (p: TueProduct): Currency => {
    const c = asCurrency(p.product_payment_detail?.product_payment_currency?.currency_code ?? "EUR");
    if (!c) throw new SupplierIntegrationError(`Tue: moeda não suportada (${p.product_payment_detail?.product_payment_currency?.currency_code})`);
    return c;
  };
  const titleOf = (p: TueProduct) => (p.product_content?.product_title ?? "").trim() || "Ingresso";
  const placeOf = (p: TueProduct, dest: Map<string, Destination>) => {
    const v = venue(p);
    const d = (p.product_destinations ?? []).map((id) => dest.get(id)).find(Boolean);
    const city = v?.location_address?.city || d?.destination_city || d?.destination_name || "";
    const country = v?.location_address?.country || d?.destination_country || "";
    return { city: city ? titleCase(city) : "", country, venue: v?.location_name ?? null };
  };
  const imagesOf = (p: TueProduct) => {
    const imgs = (p.product_content?.product_images ?? []).filter((i) => /^https?:\/\//.test(i.image_url ?? ""));
    const rank = (t?: string) => ["MAIN", "BANNER", "DETAIL", "THUMBNAIL"].indexOf(t ?? "") >>> 0;
    return [...new Set(imgs.sort((a, b) => rank(a.image_type) - rank(b.image_type)).map((i) => i.image_url!))];
  };
  const defaultDate = () => addDays(todayLocal(), 1);
  const validDate = (date: string | undefined, p: TueProduct): string => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SupplierError("Informe a data da visita");
    if (startOfLocalDay(date).getTime() < startOfLocalDay(todayLocal()).getTime()) throw new SupplierError("A data da visita já passou");
    if (p.product_booking_start_date && date < day(p.product_booking_start_date)) throw new SupplierError(`Vendas a partir de ${brDate(day(p.product_booking_start_date))}`);
    if (p.product_end_date && date > day(p.product_end_date)) throw new SupplierError("Este ingresso não está disponível para essa data");
    return date;
  };

  function paxRulesOf(p: TueProduct, season: Season | null): PaxRule[] {
    const max = Math.min(p.product_booking_quantity_max ?? 20, 20);
    const adult = typeFor(season, "ADULT");
    const child = typeFor(season, "CHILD");
    const rules: PaxRule[] = [{ type: "ADULT", label: adult ? typeLabel(adult, "ADULT") : "Adulto", min: 0, max: Math.min(adult?.product_type_quantity_max ?? max, max) }];
    if (child) rules.push({ type: "CHILD", label: typeLabel(child, "CHILD"), min: 0, max: Math.min(child.product_type_quantity_max ?? max, max), hint: child.product_type_description?.slice(0, 120) });
    return rules;
  }

  /** Linhas de custo para a quantidade pedida (por tipo de ingresso). */
  function linesFor(p: TueProduct, date: string, pax: PaxConfig, slot: TueSlot | null) {
    const season = seasonFor(p, date);
    if (!season) throw new SupplierError("Este ingresso não tem preço para a data escolhida");
    const wanted: [Kind, number][] = [
      ["ADULT", pax.adults ?? 0],
      ["CHILD", pax.children ?? 0],
      ["SENIOR", pax.seniors ?? 0],
    ];
    const picked: { kind: Kind; type: TueType; count: number }[] = [];
    for (const [kind, count] of wanted) {
      if (count <= 0) continue;
      const type = typeFor(season, kind);
      if (!type) throw new SupplierError(kind === "CHILD" ? "Este ingresso não tem tarifa infantil" : "Este ingresso não tem tarifa para adultos");
      if (type.product_type_quantity_min && count < type.product_type_quantity_min) throw new SupplierError(`Mínimo de ${type.product_type_quantity_min} ingresso(s) ${KIND_LABEL[kind].toLowerCase()}`);
      if (type.product_type_quantity_max && count > type.product_type_quantity_max) throw new SupplierError(`Máximo de ${type.product_type_quantity_max} ingresso(s) ${KIND_LABEL[kind].toLowerCase()}`);
      picked.push({ kind, type, count });
    }
    const units = picked.reduce((s, x) => s + x.count, 0);
    if (units <= 0) throw new SupplierError("Selecione ao menos 1 ingresso");
    if (p.product_booking_quantity_min && units < p.product_booking_quantity_min) throw new SupplierError(`Mínimo de ${p.product_booking_quantity_min} ingressos por reserva`);
    if (p.product_booking_quantity_max && units > p.product_booking_quantity_max) throw new SupplierError(`Máximo de ${p.product_booking_quantity_max} ingressos por reserva`);
    const basis = costBasisOf(picked.map((x) => x.type));
    const lines: PriceLine[] = picked.map((x) => ({ type: x.kind, label: typeLabel(x.type, x.kind), unitCost: unitCost(x.type, basis, slot), quantity: x.count }));
    const salesTotal = picked.reduce((s, x) => s.plus(new Decimal(unitCost(x.type, "sales", slot)).times(x.count)), new Decimal(0));
    return { lines, picked, basis, units, salesTotal: salesTotal.toFixed(2) };
  }

  /** Opções (horários) do dia, ou a entrada do dia / ingresso aberto. */
  async function optionsFor(p: TueProduct, date: string, o: { fresh?: boolean } = {}): Promise<{ optionId: string; title: string; description?: string; slot: TueSlot | null; spots: number | null }[]> {
    if (p.product_availability) {
      const list = await slots(p.product_id, date, o);
      const admission = p.product_admission_type ?? "TIME_POINT";
      return list.map((s) => {
        const from = slotTime(s.availability_from_date_time);
        const to = slotTime(s.availability_to_date_time);
        const title = admission === "TIME_DATE" ? `Entrada em ${brDate(date)}` : admission === "TIME_SLOT" || admission === "TIME_PERIOD" ? (to && to !== from ? `${from} – ${to}` : from) : from || `Entrada em ${brDate(date)}`;
        return { optionId: s.availability_id, title, description: s.availability_label, slot: s, spots: s.availability_spots?.availability_spots_open ?? null };
      });
    }
    if (p.product_traveldate_required) return [{ optionId: "dia", title: `Ingresso para ${brDate(date)}`, slot: null, spots: null }];
    return [{ optionId: "aberto", title: "Ingresso aberto (use em qualquer data)", slot: null, spots: null }];
  }

  function summaryOf(p: TueProduct, dest: Map<string, Destination>, date: string): ProductSummary | null {
    try {
      const { lines } = linesFor(p, date, { adults: 1, children: 0 }, null);
      const place = placeOf(p, dest);
      return {
        supplierCode: TUE_CODE,
        supplierName: NAME,
        category: "TICKETS",
        productId: p.product_id,
        title: titleOf(p),
        subtitle: (p.product_content?.product_short_description ?? "").replace(/\s+/g, " ").trim().slice(0, 140) || undefined,
        location: [place.venue, [place.city, place.country].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
        destination: place.city,
        imageUrl: imagesOf(p)[0] ?? null,
        tags: [durationPt(p.product_content?.product_duration_text, p.product_duration), p.product_cancellation_allowed === false ? null : "Cancelável"].filter((x): x is string => !!x),
        currency: currencyOf(p),
        lines,
      };
    } catch {
      return null; // sem preço para a data / sem tarifa de adulto
    }
  }

  const adapter: SupplierAdapter & { client: TueClient } = {
    code: TUE_CODE,
    name: NAME,
    category: "TICKETS",
    defaultCurrency: "EUR",
    live: true,
    client,
    cancelSimulation: false,

    destinations() {
      const list = knownCities.size ? [...knownCities].sort() : ["Roma", "Florença", "Veneza", "Milão", "Paris", "Londres"];
      return list.map((name) => ({ id: name, name }));
    },

    async search(params: SearchParams): Promise<ProductSummary[]> {
      const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : defaultDate();
      const [list, dest] = await Promise.all([catalog(), destinations()]);
      return list
        .filter((p) => {
          const place = placeOf(p, dest);
          const hay = [titleOf(p), place.city, place.country, place.venue, ...(p.product_destinations ?? []).map((id) => dest.get(id)?.destination_name ?? "")].join(" ");
          return matchesTicketDestination(params.destination, hay);
        })
        .map((p) => summaryOf(p, dest, date))
        .filter((s): s is ProductSummary => !!s);
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      const p = await product(productId);
      if (!p) return null;
      const dest = await destinations();
      let date: string;
      try {
        date = validDate(params.date, p);
      } catch {
        date = defaultDate();
      }
      const season = seasonFor(p, date);
      const opts = await optionsFor(p, date).catch(() => []);
      const canc = cancellationOf(p, date);
      const options: OfferOption[] = opts.map((o) => {
        let lines: PriceLine[] = [];
        let childLines: PriceLine[] | null = null;
        try {
          lines = linesFor(p, date, { adults: 1, children: 0 }, o.slot).lines;
        } catch {
          lines = [];
        }
        try {
          childLines = linesFor(p, date, { adults: 0, children: 1 }, o.slot).lines;
        } catch {
          childLines = null;
        }
        return {
          optionId: o.optionId,
          title: o.title,
          description: o.description,
          currency: currencyOf(p),
          lines,
          childLines,
          attributes: [{ label: "Cancelamento", value: canc.text }],
          notes: o.spots !== null && o.spots > 0 && o.spots <= 10 ? [`Últimas ${o.spots} vagas neste horário`] : [],
          freeCancellationUntil: canc.until,
          available: lines.length > 0 && (o.spots === null || o.spots > 0),
        };
      });
      const c = p.product_content ?? {};
      const list = (xs: { include_description?: string; exclude_description?: string }[] | undefined, k: "include_description" | "exclude_description") =>
        (xs ?? []).map((x) => x[k]?.trim()).filter((x): x is string => !!x);
      const includes = list(c.product_includes, "include_description");
      const excludes = list(c.product_excludes, "exclude_description");
      const description = [
        c.product_long_description || c.product_short_description,
        includes.length ? `Inclui: ${includes.join("; ")}.` : null,
        excludes.length ? `Não inclui: ${excludes.join("; ")}.` : null,
        c.product_additional_information,
        c.product_entry_notes ? `Antes de ir: ${c.product_entry_notes}` : null,
      ]
        .filter((x): x is string => !!x?.trim())
        .map((x) => x.replace(/\r\n?/g, "\n").trim())
        .join("\n\n");
      const place = placeOf(p, dest);
      const base: ProductSummary = summaryOf(p, dest, date) ?? {
        supplierCode: TUE_CODE,
        supplierName: NAME,
        category: "TICKETS",
        productId: p.product_id,
        title: titleOf(p),
        location: [place.venue, [place.city, place.country].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
        destination: place.city,
        tags: [],
        currency: currencyOf(p),
        lines: [],
      };
      const gallery = imagesOf(p);
      const duration = durationPt(c.product_duration_text, p.product_duration);
      return {
        ...base,
        description,
        gallery,
        imageUrl: gallery[0] ?? null,
        highlights: (c.product_highlights ?? []).map((h) => h.highlight_description?.trim()).filter((x): x is string => !!x).slice(0, 10),
        options,
        paxRules: paxRulesOf(p, season),
        info: [
          ...(duration ? [{ label: "Duração", value: duration }] : []),
          ...(p.product_admission_type && ADMISSION_PT[p.product_admission_type] ? [{ label: "Entrada", value: ADMISSION_PT[p.product_admission_type] }] : []),
          { label: "Cancelamento", value: canc.text },
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      const p = await product(req.productId);
      if (!p) throw new SupplierError("Ingresso não encontrado no fornecedor");
      const open = !p.product_availability && !p.product_traveldate_required;
      const date = open ? (req.date && /^\d{4}-\d{2}-\d{2}$/.test(req.date) ? req.date : defaultDate()) : validDate(req.date, p);
      const pax: PaxConfig = { adults: Math.max(0, req.pax.adults ?? 0), children: Math.max(0, req.pax.children ?? 0), ...(req.pax.seniors ? { seniors: req.pax.seniors } : {}) };
      let slot: TueSlot | null = null;
      if (p.product_availability) {
        const list = await slots(p.product_id, date, { fresh: true });
        slot = list.find((s) => s.availability_id === req.optionId) ?? null;
        if (!slot) throw new SupplierError("Este horário não está mais disponível. Escolha outro horário.");
      }
      const { lines, picked, basis, units, salesTotal } = linesFor(p, date, pax, slot);
      const open_ = slot?.availability_spots?.availability_spots_open;
      if (typeof open_ === "number" && open_ < units) throw new SupplierError(open_ > 0 ? `Restam só ${open_} vagas neste horário` : "Este horário esgotou. Escolha outro.");
      const canc = cancellationOf(p, date);
      // ingresso válido no dia inteiro (TIME_DATE) não tem horário: o "00:00" do fornecedor não vai para a tela
      const timed = !!slot && (p.product_admission_type ?? "TIME_POINT") !== "TIME_DATE" && p.product_admission_type !== "TIME_OPEN";
      const when = timed ? slotTime(slot!.availability_from_date_time) : "";
      return {
        supplierCode: TUE_CODE,
        category: "TICKETS",
        productId: p.product_id,
        optionId: slot?.availability_id ?? (open ? "aberto" : "dia"),
        title: titleOf(p),
        subtitle: open ? "Ingresso aberto" : `${brDate(date)}${when ? ` · ${when}` : ""}`,
        location: placeOf(p, await destinations()).city || null,
        imageUrl: imagesOf(p)[0] ?? null,
        serviceDate: open ? null : date,
        serviceEndDate: null,
        expiresAt: open ? null : startOfLocalDay(date),
        currency: currencyOf(p),
        lines,
        pax,
        paxRules: paxRulesOf(p, seasonFor(p, date)),
        details: {
          productTypes: picked.map((x) => ({ kind: x.kind, type: x.type.product_type, id: x.type.product_type_id, count: x.count })),
          availabilityId: slot?.availability_id ?? null,
          slotFrom: slot?.availability_from_date_time ?? null,
          startTime: when || null,
          travelDate: open ? null : date,
          admissionType: p.product_admission_type ?? null,
          costBasis: basis,
          expectedSalesTotal: salesTotal,
          cancellation: canc.text,
          freeCancellationUntil: canc.until,
          nonRefundable: p.product_cancellation_allowed === false,
          notes: [p.product_content?.product_entry_notes ? `Antes de ir: ${p.product_content.product_entry_notes.trim()}` : null].filter(Boolean),
          codeFormat: p.product_code_settings?.product_code_format ?? null,
        },
        quoteRef: stableId(TUE_CODE, p.product_id, slot?.availability_id ?? date, JSON.stringify(lines)),
      };
    },

    async findBooking(item: BookItem): Promise<BookingResult | null> {
      if (!item.reference) return null;
      const rs = await client.get<ListEnvelope<TueOrder>>("/orders", { distributor_id: cfg.distributorId, order_external_reference: item.reference, cache: false }, 30_000);
      const o = (rs.data?.items ?? []).find((x) => x.order_external_reference === item.reference && bookingStatusOf(x.order_bookings ?? []) !== "CANCELLED" && bookingStatusOf(x.order_bookings ?? []) !== "REJECTED");
      return o ? resultOf(o) : null;
    },

    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      const reference = (item.reference ?? "").replace(/[^A-Za-z0-9_/-]/g, "-").slice(0, 50);
      if (!reference) throw new SupplierError("Reserva sem referência interna");
      const existing = await adapter.findBooking!({ ...item, reference });
      if (existing) return existing;

      // cotação nova: horário com vaga e custo que não passa do vendido
      const q = await adapter.quote({ productId: item.productId, optionId: item.optionId, date: item.serviceDate ?? undefined, pax: item.pax });
      const cost = q.lines.reduce((s, l) => s.plus(new Decimal(l.unitCost).times(l.quantity)), new Decimal(0));
      if (item.maxCost) {
        if (item.maxCost.currency !== q.currency) throw new SupplierError(`O fornecedor mudou a moeda do ingresso (${q.currency}), não reservamos`);
        if (cost.gt(new Decimal(item.maxCost.amount).plus("0.01"))) throw new SupplierError(`O fornecedor aumentou o preço (${q.currency} ${cost.toFixed(2)} > vendido ${new Decimal(item.maxCost.amount).toFixed(2)}). A reserva não foi feita.`);
      }
      const d = q.details as { productTypes: { type: string; id: string; count: number }[]; availabilityId: string | null; travelDate: string | null; expectedSalesTotal: string };
      const holder = ctx.holder ?? ctx.travelers.find((t) => t.type !== "CHILD" && t.name?.trim()) ?? null;
      if (!holder?.name?.trim()) throw new SupplierError("Informe o nome do responsável pelos ingressos");
      const name = splitName(holder.name);
      const email = ctx.contact?.email?.trim() || holder.email?.trim() || undefined;
      const phone = (ctx.contact?.phone ?? holder.phone ?? "").replace(/[^\d+]/g, "");
      const contact = {
        contact_type: "BOOKER",
        contact_name_first: ascii(name.first),
        contact_name_last: ascii(name.last),
        ...(email ? { contact_email: email } : {}),
        ...(phone ? { contact_phone: phone.startsWith("+") ? phone : `+55${phone.replace(/^0+/, "")}` } : {}),
      };
      const detail = {
        booking_external_reference: reference,
        product_id: item.productId,
        ...(d.availabilityId ? { product_availability_id: d.availabilityId } : {}),
        ...(!d.availabilityId && d.travelDate ? { booking_travel_date: travelDateTime(d.travelDate) } : {}),
        product_type_details: d.productTypes.map((t) => ({ product_type: t.type, product_type_id: t.id, product_type_count: t.count })),
      };

      // 1) bloqueio com o preço calculado pelo servidor
      let res: ReservationRS;
      try {
        const rs = await client.post<{ data?: { reservation?: ReservationRS } }>(
          "/reservations",
          { data: { reservation: { reservation_distributor_id: cfg.distributorId, reservation_external_reference: reference, reservation_details: [detail], reservation_contacts: [contact] } } },
          { idempotencyKey: `subrinho-res-${reference}` },
        );
        res = rs.data?.reservation ?? {};
      } catch (e) {
        if (e instanceof TueApiError && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 429) throw new SupplierError(`A Tu Experienza recusou a reserva: ${e.message.replace(/^Tue [^:]*: /, "")}`);
        throw e;
      }
      const release = (why: string) => (res.reservation_reference ? client.delete(`/reservations/${encodeURIComponent(res.reservation_reference)}`, { cancellation_reason: why }).catch(() => null) : Promise.resolve(null));
      if (!res.reservation_reference) throw new SupplierIntegrationError("Tue: reserva sem referência na resposta", { res });
      const required = (res.reservation_checkout_fields ?? []).filter((f) => f.checkout_field_restriction === "REQUIRED");
      if (required.length) {
        await release("Dados extras obrigatórios");
        throw new SupplierError(`Este ingresso exige dados extras (${required.map((f) => f.checkout_field_type ?? f.checkout_field_id).join(", ")}), emita pelo portal da Tu Experienza`);
      }
      // conferência do preço do servidor (recomendação da Tue): não confirma se subiu
      const server = res.reservation_pricing?.price_total ? new Decimal(money2(res.reservation_pricing.price_total)) : null;
      const ceiling = Decimal.max(cost, new Decimal(d.expectedSalesTotal)).times("1.01").plus("0.01");
      if (server && server.gt(ceiling)) {
        await release("Preço diferente do cotado");
        throw new SupplierError(`O preço do fornecedor mudou (${q.currency} ${server.toFixed(2)}). A reserva não foi feita.`);
      }

      // 2) confirmação (pedido com a nossa referência)
      let order: TueOrder | undefined;
      try {
        const rs = await client.post<{ data?: { order?: TueOrder } }>(
          "/orders",
          {
            data: {
              order: {
                order_distributor_id: cfg.distributorId,
                order_external_reference: reference,
                order_language: "pt",
                order_options: { email_options: { email_types: { send_tickets: false } } },
                order_bookings: [{ booking_option_type: "CONFIRM_RESERVATION", reservation_reference: res.reservation_reference }],
              },
            },
          },
          { idempotencyKey: `subrinho-ord-${reference}`, timeoutMs: 75_000 },
        );
        order = rs.data?.order;
      } catch (e) {
        // sem resposta / erro do servidor: o pedido pode ter sido criado — procura antes de falhar
        if ((e instanceof SupplierIntegrationError && e.detail?.timeout) || (e instanceof TueApiError && e.status >= 500)) {
          const found = await adapter.findBooking!({ ...item, reference }).catch(() => null);
          if (found) return found;
        }
        if (e instanceof TueApiError && e.status === 402) throw new SupplierError("A Tu Experienza recusou por limite de crédito da conta (HTTP 402), fale com o gerente de conta");
        if (e instanceof TueApiError && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 429) {
          await release("Confirmação recusada");
          throw new SupplierError(`A Tu Experienza recusou a confirmação: ${e.message.replace(/^Tue [^:]*: /, "")}`);
        }
        throw e;
      }
      if (!order?.order_reference) throw new SupplierIntegrationError("Tue: pedido sem referência na resposta", { order });
      const out = resultOf(order);
      out.payload.quotedCost = cost.toFixed(2);
      out.payload.costBasis = (q.details as { costBasis?: string }).costBasis ?? null;
      if (server) out.payload.bookedPrice = server.toFixed(2);
      return out;
    },

    async bookingStatus(bookingRef: string): Promise<BookingResult> {
      const rs = await client.get<{ data?: { order?: TueOrder } }>(`/orders/${encodeURIComponent(bookingRef)}`, { cache: false }, 30_000);
      if (!rs.data?.order) throw new SupplierError("Pedido não encontrado na Tu Experienza");
      return resultOf(rs.data.order);
    },

    async cancelBooking(bookingRef: string, o: { simulate: boolean }): Promise<CancelResult> {
      if (o.simulate) throw new SupplierError("A Tu Experienza não simula a multa, confira a política do ingresso antes de cancelar");
      try {
        const rs = await client.delete<{ data?: { order?: TueOrder } }>(`/orders/${encodeURIComponent(bookingRef)}`, { cancellation_reason: "Cancelado pela agência" });
        const order = rs.data?.order;
        const status = order ? bookingStatusOf(order.order_bookings ?? []) : "CANCELLED";
        return { status: status === "CANCELLED" ? "CANCELLED" : status, penalty: null, reference: bookingRef, payload: { cancelledAt: new Date().toISOString(), priceTotalAfter: order?.order_pricing?.price_total ?? null } };
      } catch (e) {
        if (e instanceof TueApiError && (e.status === 409 || e.status === 422 || e.status === 400)) throw new SupplierError(`A Tu Experienza não permitiu cancelar: ${e.message.replace(/^Tue [^:]*: /, "")}`);
        throw e;
      }
    },

    async voucher(bookingRef: string) {
      const r = await adapter.bookingStatus!(bookingRef);
      return { tickets: { codes: r.payload.codes, codeFormat: r.payload.codeFormat, travelDate: r.payload.travelDate, released: r.payload.vouchersReleased } };
    },
  };

  return adapter;
}

/** O que dá para vender pela loja (produto simples, ativo, sem opções/ponto de encontro obrigatórios). */
function sellable(p: TueProduct): boolean {
  if (!p?.product_id) return false;
  if (p.product_class && p.product_class !== "STANDARD") return false;
  if (p.product_catalogue_status && p.product_catalogue_status !== "ACTIVE") return false;
  if ((p.product_options ?? []).some((o) => o.option_mandatory)) return false;
  if (p.product_pickup_point === "MANDATORY") return false;
  return (p.product_type_seasons ?? []).some((s) => (s.product_type_season_details ?? []).some((t) => KIND_TYPES.ADULT.includes(t.product_type)));
}

const venue = (p: TueProduct) => (p.product_locations ?? []).find((l) => (l.location_type ?? "VENUE") === "VENUE") ?? p.product_locations?.[0];

/** O cache do catálogo guarda só o necessário para listar e buscar. */
function slim(p: TueProduct): TueProduct {
  const c = p.product_content ?? {};
  return {
    product_id: p.product_id,
    product_class: p.product_class,
    product_catalogue_status: p.product_catalogue_status,
    product_admission_type: p.product_admission_type,
    product_availability: p.product_availability,
    product_traveldate_required: p.product_traveldate_required,
    product_booking_quantity_min: p.product_booking_quantity_min,
    product_booking_quantity_max: p.product_booking_quantity_max,
    product_cancellation_allowed: p.product_cancellation_allowed,
    product_duration: p.product_duration,
    product_payment_detail: p.product_payment_detail,
    product_locations: (p.product_locations ?? []).slice(0, 2).map((l) => ({ location_name: l.location_name, location_type: l.location_type, location_address: { city: l.location_address?.city, country: l.location_address?.country } })),
    product_destinations: p.product_destinations,
    product_type_seasons: p.product_type_seasons,
    product_content: {
      product_title: c.product_title,
      product_short_description: (c.product_short_description ?? "").slice(0, 200),
      product_duration_text: c.product_duration_text,
      product_images: imagesFirst(c.product_images),
    },
  };
}

function imagesFirst(imgs: Content["product_images"]) {
  const list = (imgs ?? []).filter((i) => /^https?:\/\//.test(i.image_url ?? ""));
  return [...list.filter((i) => i.image_type === "MAIN"), ...list.filter((i) => i.image_type !== "MAIN")].slice(0, 1);
}

export function createTueFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const cfg = tueConfig(env);
  return cfg ? createTueAdapter(cfg) : null;
}

