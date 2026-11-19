/**
 * Adaptador real da Master Vacation Homes (casas de temporada em Orlando e arredores), pela API de
 * parceiros v1 (https://api.mastervh.one/api-docs).
 *
 * Fluxo:
 *  - search     → `/availability` (busca: casas livres no período inteiro, respeitando a estadia mínima
 *                 de cada uma, já filtrada por capacidade; paginada, cache de 15 min) → destino filtrado
 *                 aqui → cotação real das casas (`/quotes/bulk`, 25 por chamada). A cotação da Master é
 *                 assíncrona (pending → ready/failed): a busca espera alguns segundos e mostra só as casas
 *                 já cotadas; as que ficarem pendentes entram na próxima busca. Nunca usa o
 *                 `display_nightly_rate` (estimativa de 4 noites) como preço;
 *  - getProduct → `/units/{id}` (descrição, fotos, comodidades, regras de preço; cache de 6 h) + a
 *                 cotação da tabela (ou uma nova); indisponível → calendário (`/availability?unit_id`)
 *                 diz o motivo (data ocupada / estadia mínima);
 *  - quote      → cotação nova (carrinho e checkout) — atualiza a tabela, então busca e página passam a
 *                 mostrar o mesmo valor do carrinho;
 *  - book       → cotação nova (nunca reserva acima do custo vendido) → POST `/internal/reservations`
 *                 com Idempotency-Key = nossa referência (repetir não duplica) → acompanha a fila
 *                 (`/reservations/status/{correlation_id}`) por alguns segundos: confirmada (SENT) ou
 *                 "aguardando confirmação" (o botão "Atualizar status" do painel termina de acompanhar);
 *  - cancelamento → POST `/internal/reservations/{id}/cancel` (também em fila).
 *
 * Preço = `total_amount` da Master (aluguel + limpeza + proteção contra danos + taxas + impostos, e a
 * taxa de reserva, que a Master já embute no total), em USD. Entra inteiro na conta de todo item
 * (câmbio → margem Subrinho → margem do afiliado → parcelado). Pagamento: é nosso (a Master não cobra
 * o hóspede nesta integração). Chave sandbox: casas e preços reais, reservas simuladas — bloqueada para
 * reservar em produção.
 *
 * Sem permissão de reserva na chave (`write:bookings`, ativada pela Master por parceiro) →
 * MASTER_VACATION_HOME_MANUAL_ISSUE=1: a equipe reserva direto com a Master e registra o localizador.
 */
import Decimal from "decimal.js";
import type { PaxConfig, PriceLine } from "@/server/db/schema";
import { addDays, todayLocal } from "@/lib/tz";
import { expiresAtFor } from "../mock/util";
import {
  type BookContext,
  type BookItem,
  type BookingResult,
  type CancelResult,
  type OfferOption,
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
import { brDate, money2, stableId, validateStay } from "../hotels/common";
import {
  bathroomsText,
  cancellationFor,
  cityLabel,
  hasAmenity,
  hourText,
  houseGuests,
  housePaxRules,
  matchesHouseDestination,
  normalizeHousePax,
  propertyTypeLabel,
  rankAmenities,
} from "../houses/common";
import { MvhApiError, MvhClient, mvhConfig, type MvhConfig, type Transport } from "./client";

export const MVH_CODE = "MASTER_VACATION_HOME";
const NAME = "Master Vacation Home";
const UNIT_TTL = 6 * 3600;
const REGIONS_TTL = 24 * 3600;
const SEARCH_TTL = 15 * 60;
const CALENDAR_TTL = 10 * 60;
/** Validade de cada cotação na tabela de preços (busca e página da casa usam a mesma). */
export const PRICE_TTL = 15 * 60;
/**
 * Casas cotadas por busca (25 por chamada). O limite da chave é de 120 requisições/min (sandbox: 30):
 * uma busca nova gasta ~1 página de disponibilidade + 2 lotes de cotação por rodada (até 3 rodadas).
 */
const MAX_PRICED_PER_SEARCH = 50;
const BULK_SIZE = 25;
/** Casas cotadas suficientes para mostrar a busca sem esperar as outras. */
const ENOUGH_FOR_PAGE = 24;
const SEARCH_PAGE = 200;
const MAX_SEARCH_PAGES = 5;
/** Quanto tempo esperar a Master terminar as cotações pendentes. */
const SEARCH_WAIT_MS = 25_000;
const QUOTE_WAIT_MS = 25_000;
const BOOKING_WAIT_MS = 30_000;

// ───────────── Tipos da API ─────────────

type Num = number | string | null | undefined;
export type MvhUnit = {
  unit_id: number;
  name?: string | null;
  community_name?: string | null;
  property_type?: string | null;
  region_id?: number | null;
  headline?: string | null;
  bedrooms?: Num;
  bathrooms?: Num;
  sleeps?: Num;
  private_pool?: Num | boolean;
  display_nightly_rate?: Num;
  currency_code?: string | null;
  photo_url?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
export type MvhPricing = {
  pool_heatable?: Num;
  pool_heat_included?: Num;
  pool_heat_daily_price?: Num;
  spa?: Num;
  spa_heat_included?: Num;
  spa_heat_daily_price?: Num;
  charge_security_deposit?: Num | boolean;
  security_deposit_amount?: Num;
  minimum_nights_stay?: Num;
  default_check_in_time?: string | null;
  default_check_out_time?: string | null;
  currency_code?: string | null;
};
export type MvhUnitDetail = MvhUnit & {
  description?: string | null;
  amenities?: { code?: string | null; name?: string | null }[] | null;
  photos?: { url?: string | null; caption?: string | null; is_main?: Num; display_order?: Num }[] | null;
  pricing?: MvhPricing | null;
};
export type MvhQuoteData = {
  total_amount?: Num;
  base_amount?: Num;
  currency?: string | null;
  breakdown?: { item?: string | null; value?: Num }[] | null;
  markup?: unknown;
  quoted_at?: string | null;
};
/** Resposta de `/quotes` (uma casa) ou item de `/quotes/bulk` (campos do preço no próprio item). */
export type MvhQuoteRS = MvhQuoteData & {
  unit_id?: number;
  status?: string | null;
  quote?: MvhQuoteData | null;
  retry_after_seconds?: Num;
  error?: string | null;
};
/** Preço guardado na tabela. */
export type MvhPrice = { total: string; currency: string; breakdown: { item: string; value: string }[] };
type PriceEntry = { q: MvhPrice | null; at: number; why?: string | null };
type PriceTable = Record<string, PriceEntry>;
type CalendarDay = { cal_date: string; is_available: Num | boolean; min_stay?: Num };
type JobStatus = {
  correlation_id?: string;
  outbox_id?: number;
  action?: string | null;
  status?: string | null;
  error?: string | null;
  reservation?: { id?: number | string | null; reference?: string | null; unit_id?: number; arrival?: string; departure?: string; type?: string | null } | null;
};
type PartnerReservation = { reservation_id: number; unit_id: number; booking_ref?: string | null; status?: string | null; check_in?: string; check_out?: string; adults?: number; children?: number; last_modified?: string };

// ───────────── Helpers puros (testados) ─────────────

const VALID_ID = /^\d{1,12}$/;
const idOf = (u: { unit_id?: number | string }) => String(u.unit_id ?? "").trim();

function dec(v: Num): Decimal {
  try {
    return new Decimal(money2(v));
  } catch {
    return new Decimal(0);
  }
}

const int = (v: Num): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Booleanos da Master vêm como 1/0, true/false ou "1". */
export function truthy(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === "string" && /^(true|1|yes|y)$/i.test(v.trim()));
}

/** Estado da cotação: pronta (com preço), pendente (a Master ainda está calculando) ou indisponível. */
export type QuoteState = { kind: "ready"; price: MvhPrice } | { kind: "pending"; retryAfterMs: number } | { kind: "unavailable"; why: string | null };

export function quoteState(rs: MvhQuoteRS | null | undefined): QuoteState {
  const status = String(rs?.status ?? "").toLowerCase();
  if (status === "pending") return { kind: "pending", retryAfterMs: Math.min(15, Math.max(1, Number(rs?.retry_after_seconds) || 5)) * 1000 };
  const data = rs?.quote ?? (rs && rs.total_amount !== undefined ? rs : null);
  if (status === "ready" && data) {
    const total = dec(data.total_amount);
    if (total.gt(0))
      return {
        kind: "ready",
        price: {
          total: total.toFixed(2),
          currency: (data.currency || "USD").toUpperCase(),
          breakdown: (data.breakdown ?? []).filter((b) => b && b.item).map((b) => ({ item: String(b.item).trim(), value: dec(b.value).toFixed(2) })),
        },
      };
  }
  return { kind: "unavailable", why: rs?.error ? String(rs.error) : null };
}

/** Item do detalhamento da Master → linha de custo (as de mesmo tipo são somadas). */
function lineKind(item: string): { key: string; type: string; label: string } {
  const k = item.toLowerCase();
  if (/tax/.test(k)) return { key: "tax", type: "TAX", label: "Impostos locais (Sales Tax e Tourist Tax)" };
  if (/^rental rate$|^rent\b|rental rate$/.test(k)) return { key: "rent", type: "NIGHT", label: "" };
  if (/clean/.test(k)) return { key: "clean", type: "FEE", label: "Taxa de limpeza" };
  if (/damage|protection|waiver/.test(k)) return { key: "damage", type: "FEE", label: "Proteção contra danos" };
  if (/pool|spa/.test(k)) return { key: "heat", type: "FEE", label: "Aquecimento da piscina/spa" };
  return { key: "fees", type: "FEE", label: "Taxas de serviço e reserva" };
}

/**
 * Linhas de custo (USD) — somam exatamente o total cobrado pela Master (`total_amount`). O
 * detalhamento vem contra o `base_amount`; a diferença (margem da Master na chave, quando houver) entra
 * nas taxas de serviço. Sem detalhamento, ou se não fechar, vira uma linha só com o total: o total manda.
 */
export function mvhQuoteLines(q: MvhPrice, nights: number): PriceLine[] {
  const total = dec(q.total);
  const n = `${nights} noite${nights > 1 ? "s" : ""}`;
  const single: PriceLine[] = [{ type: "STAY", label: `Estadia completa · ${n} (aluguel, taxas e impostos)`, unitCost: total.toFixed(2), quantity: 1 }];
  const groups = new Map<string, { type: string; label: string; value: Decimal }>();
  for (const b of q.breakdown) {
    const v = dec(b.value);
    if (v.lte(0)) continue;
    const kind = lineKind(b.item);
    const g = groups.get(kind.key) ?? { type: kind.type, label: kind.label || `Aluguel da casa · ${n}`, value: new Decimal(0) };
    g.value = g.value.plus(v);
    groups.set(kind.key, g);
  }
  if (!groups.get("rent")) return single;
  const sum = [...groups.values()].reduce((s, g) => s.plus(g.value), new Decimal(0));
  const rest = total.minus(sum);
  if (rest.lt(0)) return single;
  if (rest.gt(0)) {
    const g = groups.get("fees") ?? { type: "FEE", label: "Taxas de serviço e reserva", value: new Decimal(0) };
    g.value = g.value.plus(rest);
    groups.set("fees", g);
  }
  const order = ["rent", "clean", "damage", "heat", "fees", "tax"];
  return order.flatMap((k) => {
    const g = groups.get(k);
    return g && g.value.gt(0) ? [{ type: g.type, label: g.label, unitCost: g.value.toFixed(2), quantity: 1 }] : [];
  });
}

/** Por que a casa não está disponível nas datas (calendário da Master). */
export function mvhUnavailableReason(days: CalendarDay[] | null, checkIn: string, checkOut: string): string {
  const nights: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nights.push(d);
  const byDate = new Map((days ?? []).map((d) => [d.cal_date, d]));
  const taken = days ? nights.find((d) => byDate.has(d) && !truthy(byDate.get(d)!.is_available)) : undefined;
  if (taken) return `A casa já está reservada em ${brDate(taken)}. Escolha outras datas.`;
  const min = int(byDate.get(checkIn)?.min_stay);
  if (min > nights.length) return `Estadia mínima de ${min} noites para chegada em ${brDate(checkIn)}.`;
  return "A casa não está disponível para estas datas.";
}

/** Fotos da casa, na ordem da Master (principal primeiro), sem repetidas. */
export function photoUrls(photos: MvhUnitDetail["photos"]): string[] {
  const list = [...(photos ?? [])].filter((p) => typeof p?.url === "string" && /^https?:\/\//.test(p.url.trim()));
  list.sort((a, b) => Number(truthy(b.is_main)) - Number(truthy(a.is_main)) || (Number(a.display_order) || 999) - (Number(b.display_order) || 999));
  return [...new Set(list.map((p) => p.url!.trim()))];
}

/** Texto da descrição: sem HTML, parágrafos separados por linha em branco. */
export function descriptionText(raw: unknown): string {
  const t = typeof raw === "string" ? raw : "";
  return t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Status da fila da Master → nosso status de reserva. */
export function jobOutcome(s: JobStatus | null | undefined): "DONE" | "FAILED" | "QUEUED" {
  const st = String(s?.status ?? "").toUpperCase();
  if (st === "SENT" || st === "CREATED" || st === "CONFIRMED" || st === "DONE") return "DONE";
  if (st === "FAILED" || st === "DEAD" || st === "ERROR" || st === "REJECTED") return "FAILED";
  return "QUEUED";
}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ───────────── Adaptador ─────────────

export type MvhOptions = {
  transport?: Transport;
  freeCancelDays?: number | null;
  /** A chave não reserva (sem `write:bookings`): reserva manual pelo painel. */
  manualIssue?: boolean;
  /** Bloqueia reservas com a chave sandbox (produção). */
  blockSandboxBooking?: boolean;
  /** Testes: espera sem relógio real. */
  sleep?: (ms: number) => Promise<void>;
  searchWaitMs?: number;
  quoteWaitMs?: number;
  bookingWaitMs?: number;
};

export function createMvhAdapter(cfg: MvhConfig, opts: MvhOptions = {}) {
  const client = new MvhClient(cfg, opts.transport);
  const account = stableId(cfg.baseUrl, cfg.apiKey).slice(0, 10); // separa o cache por conta, sem expor a chave
  const freeCancelDays = opts.freeCancelDays ?? null;
  const sleep = opts.sleep ?? sleepReal;
  const searchWait = opts.searchWaitMs ?? SEARCH_WAIT_MS;
  const quoteWait = opts.quoteWaitMs ?? QUOTE_WAIT_MS;
  const bookingWait = opts.bookingWaitMs ?? BOOKING_WAIT_MS;
  const manual = opts.manualIssue === true;

  const regions = () =>
    cached(`mvh:${account}:regions`, REGIONS_TTL, async () => {
      const rs = await client.get<{ regions?: { id: number; name: string }[] }>("/api/v1/public/regions");
      return Object.fromEntries((rs.regions ?? []).map((r) => [String(r.id), r.name])) as Record<string, string>;
    }).catch(() => ({}) as Record<string, string>);

  const unit = (id: string) =>
    VALID_ID.test(id)
      ? cached(
          `mvh:${account}:unit:${id}`,
          UNIT_TTL,
          async () => {
            try {
              return await client.get<MvhUnitDetail>(`/api/v1/public/units/${id}`);
            } catch (e) {
              if (e instanceof MvhApiError && (e.status === 404 || e.status === 422)) return null;
              throw e;
            }
          },
          { cacheIf: (v) => !!v },
        )
      : Promise.resolve(null);

  /** Cadastro resumido de todas as casas (a busca não traz foto nem título): id → foto, título. */
  const catalog = () =>
    cached(`mvh:${account}:catalog`, UNIT_TTL, async () => {
      const rs = await client.get<{ units?: MvhUnit[] }>("/api/v1/public/units", {}, { timeoutMs: 30_000 });
      return Object.fromEntries((rs.units ?? []).filter((u) => VALID_ID.test(idOf(u))).map((u) => [idOf(u), { headline: u.headline ?? null, photo_url: u.photo_url ?? null }])) as Record<string, Pick<MvhUnit, "headline" | "photo_url">>;
    }, { cacheIf: (v) => Object.keys(v).length > 0 }).catch(() => ({}) as Record<string, Pick<MvhUnit, "headline" | "photo_url">>);

  /**
   * Uma página da busca de disponibilidade: casas livres no período inteiro (já respeitando a estadia
   * mínima e a capacidade), das prováveis mais baratas para as mais caras (`price_asc`: cotação em
   * cache na Master, senão a estimativa). Cada página leva alguns segundos: a busca só pede a próxima
   * quando precisa de mais casas para cotar.
   */
  const availablePage = (checkIn: string, checkOut: string, guests: number, offset: number) =>
    cached(`mvh:${account}:avail:${checkIn}:${checkOut}:g${guests}:o${offset}`, SEARCH_TTL, async () => {
      const rs = await client.get<{ total?: number; units?: MvhUnit[] }>(
        "/api/v1/public/availability",
        { from_date: checkIn, to_date: checkOut, guests, sort: "price_asc", limit: SEARCH_PAGE, offset },
        { timeoutMs: 30_000 },
      );
      return { total: Number(rs.total ?? 0), units: (rs.units ?? []).filter((u) => VALID_ID.test(idOf(u))) };
    });

  const calendar = (id: string, checkIn: string, checkOut: string) =>
    cached(`mvh:${account}:cal:${id}:${checkIn}:${checkOut}`, CALENDAR_TTL, async () => {
      const rs = await client.get<{ days?: CalendarDay[] }>("/api/v1/public/availability", { unit_id: id, from_date: checkIn, to_date: addDays(checkOut, -1) });
      return rs.days ?? [];
    }).catch(() => null);

  // ── Tabela de preços: UMA cotação por casa × período, lida pela busca e pela página ──
  // (a cotação da Master não depende do número de hóspedes)
  const tableKey = (checkIn: string, checkOut: string) => `mvh:${account}:prices:${checkIn}:${checkOut}`;

  async function loadTable(key: string): Promise<PriceTable> {
    const raw = (await cacheGet<PriceTable>(key)) ?? {};
    const now = Date.now();
    const out: PriceTable = {};
    for (const [id, e] of Object.entries(raw)) if (e && now - e.at < PRICE_TTL * 1000) out[id] = e;
    return out;
  }

  async function saveTable(key: string, fresh: PriceTable) {
    if (!Object.keys(fresh).length) return;
    // junta com o que outra busca simultânea gravou (vale a cotação mais nova de cada casa)
    const merged = await loadTable(key);
    for (const [id, e] of Object.entries(fresh)) if (!merged[id] || merged[id].at <= e.at) merged[id] = e;
    await cacheSet(key, merged, PRICE_TTL);
  }

  /**
   * Cotações de várias casas pela Master (`/quotes/bulk`, lotes em paralelo), esperando as pendentes
   * até `waitMs` (ou até ter `enough` prontas). Devolve só as resolvidas (prontas ou indisponíveis).
   */
  async function fetchPrices(ids: string[], checkIn: string, checkOut: string, waitMs: number, enough = Infinity): Promise<PriceTable> {
    const done: PriceTable = {};
    let pending = [...new Set(ids)];
    const t0 = Date.now();
    let firstError: unknown = null;
    let stop = false;
    for (let round = 0; pending.length && round < 6 && !stop; round++) {
      let retryAfter = 15_000;
      const still: string[] = [];
      const chunks: string[][] = [];
      for (let i = 0; i < pending.length; i += BULK_SIZE) chunks.push(pending.slice(i, i + BULK_SIZE));
      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const rs = await client.get<{ quotes?: MvhQuoteRS[] }>("/api/v1/public/quotes/bulk", { unit_ids: chunk.join(","), arrival: checkIn, departure: checkOut });
            const byId = new Map((rs.quotes ?? []).map((q) => [String(q.unit_id), q]));
            for (const id of chunk) {
              const s = quoteState(byId.get(id) ?? { status: "pending" });
              if (s.kind === "pending") {
                still.push(id);
                retryAfter = Math.min(retryAfter, s.retryAfterMs);
              } else done[id] = { q: s.kind === "ready" ? s.price : null, why: s.kind === "unavailable" ? s.why : null, at: Date.now() };
            }
          } catch (e) {
            firstError ??= e;
            // limite de requisições ou chave recusada: não insiste nesta busca
            if (e instanceof MvhApiError && (e.status === 429 || e.status === 401 || e.status === 403)) stop = true;
          }
        }),
      );
      pending = ids.filter((id) => still.includes(id)); // mantém a ordem (as mais baratas primeiro)
      const ready = Object.values(done).filter((e) => e.q).length;
      if (stop || !pending.length || ready >= enough || Date.now() - t0 + retryAfter > waitMs) break;
      await sleep(retryAfter);
    }
    if (!Object.keys(done).length && firstError) throw firstError;
    return done;
  }

  /** Cotação de uma casa: da tabela (mesmo valor da busca) ou nova (`fresh`: carrinho/checkout). */
  async function priceFor(id: string, checkIn: string, checkOut: string, o: { fresh?: boolean } = {}): Promise<PriceEntry | null> {
    const key = tableKey(checkIn, checkOut);
    if (!o.fresh) {
      const hit = (await loadTable(key))[id];
      if (hit) return hit;
    }
    const t0 = Date.now();
    for (let round = 0; round < 10; round++) {
      const s = quoteState(await client.get<MvhQuoteRS>("/api/v1/public/quotes", { unit_id: id, arrival: checkIn, departure: checkOut }));
      if (s.kind !== "pending") {
        const e: PriceEntry = { q: s.kind === "ready" ? s.price : null, why: s.kind === "unavailable" ? s.why : null, at: Date.now() };
        await saveTable(key, { [id]: e });
        return e;
      }
      if (Date.now() - t0 + s.retryAfterMs > quoteWait) break;
      await sleep(s.retryAfterMs);
    }
    return null; // a Master ainda está calculando
  }

  /** Cotação de várias casas (busca): reaproveita a tabela e cota as que faltam (até o limite por busca). */
  async function priceMany(ids: string[], checkIn: string, checkOut: string): Promise<PriceTable> {
    const key = tableKey(checkIn, checkOut);
    const table = await loadTable(key);
    const missing = ids.filter((id) => !table[id]).slice(0, MAX_PRICED_PER_SEARCH);
    if (!missing.length) return table;
    const have = Object.values(table).filter((e) => e.q).length;
    let fresh: PriceTable = {};
    try {
      // para de esperar quando já há casas suficientes para a página (as pendentes entram na próxima busca)
      fresh = await fetchPrices(missing, checkIn, checkOut, searchWait, Math.max(0, ENOUGH_FOR_PAGE - have));
    } catch (e) {
      // a Master não respondeu nenhuma: erro (a loja avisa que o fornecedor não respondeu), não "sem casas"
      if (!Object.keys(table).length) throw e;
    }
    await saveTable(key, fresh);
    const left = missing.length - Object.keys(fresh).length;
    if (left > 0) console.warn(`[busca] ${MVH_CODE}: ${Object.keys(fresh).length}/${missing.length} cotações novas (${left} ainda em cálculo na Master, entram na próxima busca)`);
    return { ...table, ...fresh };
  }

  // ── Conteúdo ──
  const titleOf = (u: MvhUnit) => (u.headline || u.name || "").trim() || "Casa de temporada";
  const maxGuestsOf = (u: MvhUnit) => int(u.sleeps);
  const pool = (u: MvhUnit) => truthy(u.private_pool);
  const subtitleOf = (u: MvhUnit) => {
    const bedrooms = int(u.bedrooms);
    const bathrooms = Number(u.bathrooms) || 0;
    const max = maxGuestsOf(u);
    return [propertyTypeLabel(u.property_type), bedrooms ? `${bedrooms} quarto${bedrooms > 1 ? "s" : ""}` : null, bathrooms ? `${bathroomsText(bathrooms)} banheiro${bathrooms > 1 ? "s" : ""}` : null, max ? `até ${max} hóspedes` : null]
      .filter(Boolean)
      .join(" · ");
  };
  const communityOf = (u: MvhUnit) => (u.community_name ?? "").trim() || null;
  const cityOf = (u: MvhUnit) => cityLabel(u.city);
  const locationOf = (u: MvhUnit) => [communityOf(u), [cityOf(u), u.state?.trim()].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ") || "Flórida";
  const amenityCodes = (u: MvhUnitDetail) => (u.amenities ?? []).map((a) => String(a?.code ?? a?.name ?? "")).filter(Boolean);
  const tagsOf = (u: MvhUnit, codes: string[] = []) => {
    const out: string[] = [];
    if (pool(u) || hasAmenity(codes, "private_pool", "heated_private_pool")) out.push("Piscina privativa");
    if (hasAmenity(codes, "game_room")) out.push("Sala de jogos");
    if (hasAmenity(codes, "hot_tub", "jacuzzi")) out.push("Hidromassagem");
    if (hasAmenity(codes, "resort_access", "communal_pool")) out.push("Clube do condomínio");
    return out.slice(0, 3);
  };

  const fitsDestination = (query: string | undefined, u: MvhUnit, regionNames: Record<string, string>) =>
    matchesHouseDestination(query, {
      city: u.city,
      state: u.state,
      region: u.region_id != null ? regionNames[String(u.region_id)] : null,
      resort: u.community_name,
      title: `${u.name ?? ""} ${u.headline ?? ""}`,
      address: [u.address1, u.city, u.state, u.zip].filter(Boolean).join(", "),
      lat: u.latitude,
      lon: u.longitude,
    });

  function summaryOf(u: MvhUnit, q: MvhPrice | null, nights: number, codes: string[] = []): ProductSummary {
    return {
      supplierCode: MVH_CODE,
      supplierName: NAME,
      category: "HOUSES",
      productId: idOf(u),
      title: titleOf(u),
      subtitle: subtitleOf(u),
      location: locationOf(u),
      destination: cityOf(u) || "Orlando",
      imageUrl: u.photo_url?.trim() || null,
      tags: tagsOf(u, codes),
      currency: "USD",
      lines: q ? mvhQuoteLines(q, nights) : [],
      area: communityOf(u),
      house: { bedrooms: int(u.bedrooms), bathrooms: Number(u.bathrooms) || 0, maxGuests: maxGuestsOf(u), privatePool: pool(u) },
    };
  }

  const usd = (v: Num) => `US$ ${dec(v).toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function feeNotes(q: MvhPrice | null, u: MvhUnitDetail | null): string[] {
    const notes: string[] = [];
    if (q) {
      const kinds = new Set(q.breakdown.map((b) => lineKind(b.item).key));
      const included = [kinds.has("clean") ? "taxa de limpeza" : null, kinds.has("damage") ? "proteção contra danos" : null, "taxas de serviço e reserva", "impostos locais"].filter(Boolean);
      notes.push(`Já inclui: ${included.join(", ")}.`);
    }
    const p = u?.pricing;
    if (p && pool(u!) && truthy(p.pool_heatable) && !truthy(p.pool_heat_included) && dec(p.pool_heat_daily_price).gt(0))
      notes.push(`Aquecimento da piscina não incluído: opcional, ${usd(p.pool_heat_daily_price)} por dia, contratado à parte com a administradora.`);
    if (p && truthy(p.charge_security_deposit) && dec(p.security_deposit_amount).gt(0)) notes.push(`Caução de ${usd(p.security_deposit_amount)} exigida pela administradora.`);
    return notes;
  }

  function optionOf(u: MvhUnitDetail, q: MvhPrice | null, stay: { checkIn: string; nights: number }, pax: PaxConfig, why: string | null): OfferOption {
    const canc = cancellationFor(stay.checkIn, freeCancelDays);
    const max = maxGuestsOf(u);
    const fits = max > 0 && houseGuests(pax) <= max;
    return {
      optionId: "casa",
      title: "Casa inteira",
      description: subtitleOf(u),
      currency: "USD",
      lines: q ? mvhQuoteLines(q, stay.nights) : [],
      attributes: [{ label: "Cancelamento", value: canc.text }],
      notes: q ? feeNotes(q, u) : why ? [why] : [],
      freeCancellationUntil: canc.until,
      available: !!q && fits,
    };
  }

  const STILL_PRICING = "A Master ainda está calculando o preço desta estadia. Atualize a página em alguns segundos.";

  async function unavailableWhy(id: string, checkIn: string, checkOut: string): Promise<string> {
    return mvhUnavailableReason(await calendar(id, checkIn, checkOut), checkIn, checkOut);
  }

  async function jobStatus(correlationId: string): Promise<JobStatus> {
    return client.get<JobStatus>(`/api/v1/internal/reservations/status/${encodeURIComponent(correlationId)}`);
  }

  /** Acompanha a fila da Master até o resultado (ou até `waitMs`). */
  async function waitJob(correlationId: string, waitMs: number): Promise<JobStatus | null> {
    const t0 = Date.now();
    let last: JobStatus | null = null;
    for (let i = 0; i < 20; i++) {
      last = await jobStatus(correlationId).catch(() => last);
      if (last && jobOutcome(last) !== "QUEUED") return last;
      if (Date.now() - t0 + 3000 > waitMs) break;
      await sleep(3000);
    }
    return last;
  }

  function bookingResult(job: JobStatus | null, base: Record<string, unknown>, fallbackRef: string): BookingResult {
    const r = job?.reservation;
    const done = jobOutcome(job) === "DONE";
    const reservationId = r?.id != null ? String(r.id) : ((base.reservationId as string | undefined) ?? null);
    return {
      bookingRef: (done && (r?.reference || reservationId)) || fallbackRef,
      status: done ? "CONFIRMED" : "PENDING",
      payload: {
        ...base,
        reservationId,
        bookingReference: r?.reference ?? (base.bookingReference as string | undefined) ?? null,
        supplierStatus: job?.status ?? (base.supplierStatus as string | undefined) ?? null,
        reservationType: r?.type ?? null,
        sandbox: cfg.sandbox,
      },
    };
  }

  const adapter: SupplierAdapter & { client: MvhClient; sandbox: boolean } = {
    code: MVH_CODE,
    name: NAME,
    category: "HOUSES",
    defaultCurrency: "USD",
    live: true,
    manualIssue: manual,
    cancelSimulation: false,
    client,
    sandbox: cfg.sandbox,

    destinations() {
      return ["Orlando", "Kissimmee", "Davenport", "Clermont", "Miami", "Cocoa Beach", "St. Augustine"].map((name) => ({ id: name, name }));
    },

    async search(params: SearchParams): Promise<ProductSummary[]> {
      const stay = validateStay(params.checkIn, params.checkOut);
      const guests = houseGuests(normalizeHousePax(params.pax));
      const [regionNames, cat, table0] = await Promise.all([regions(), catalog(), loadTable(tableKey(stay.checkIn, stay.checkOut))]);
      // páginas até ter casas sem cotação suficientes para esta busca (as já cotadas vêm da tabela)
      const seen = new Set<string>();
      const candidates: MvhUnit[] = [];
      for (let page = 0, offset = 0; page < MAX_SEARCH_PAGES; page++) {
        const rs = await availablePage(stay.checkIn, stay.checkOut, guests, offset);
        for (const row of rs.units) {
          const id = idOf(row);
          if (seen.has(id)) continue;
          seen.add(id);
          // a busca não traz título nem foto: vêm do cadastro
          const u = { ...row, headline: row.headline ?? cat[id]?.headline ?? null, photo_url: row.photo_url ?? cat[id]?.photo_url ?? null };
          if (maxGuestsOf(u) >= guests && fitsDestination(params.destination, u, regionNames)) candidates.push(u);
        }
        offset += rs.units.length;
        if (!rs.units.length || offset >= rs.total) break;
        if (candidates.filter((u) => !table0[idOf(u)]).length >= MAX_PRICED_PER_SEARCH) break;
      }
      if (!candidates.length) return [];
      const table = await priceMany(candidates.map(idOf), stay.checkIn, stay.checkOut);
      return candidates.flatMap((u) => {
        const q = table[idOf(u)]?.q;
        return q ? [summaryOf(u, q, stay.nights)] : [];
      });
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      const u = await unit(productId);
      if (!u) return null;
      const id = idOf(u);
      const pax = normalizeHousePax(params.pax);
      let stay: { checkIn: string; checkOut: string; nights: number };
      try {
        stay = validateStay(params.checkIn, params.checkOut);
      } catch {
        stay = { checkIn: addDays(todayLocal(), 30), checkOut: addDays(todayLocal(), 37), nights: 7 };
      }
      const max = maxGuestsOf(u);
      // falha da Master sobe como erro (não vira "casa indisponível")
      const entry = await priceFor(id, stay.checkIn, stay.checkOut);
      const q = entry?.q ?? null;
      const why = q ? null : entry ? await unavailableWhy(id, stay.checkIn, stay.checkOut) : STILL_PRICING;
      const codes = amenityCodes(u);
      const option = optionOf(u, q, stay, pax, why);
      const gallery = photoUrls(u.photos);
      if (!gallery.length && u.photo_url) gallery.push(u.photo_url.trim());
      const summary = summaryOf(u, q, stay.nights, codes);
      const amenities = rankAmenities(codes);
      if (pool(u) && !amenities.includes("Piscina privativa")) amenities.unshift("Piscina privativa");
      const p = u.pricing;
      const minNights = int(p?.minimum_nights_stay);
      const checkin = hourText(p?.default_check_in_time);
      const checkout = hourText(p?.default_check_out_time);
      return {
        ...summary,
        imageUrl: gallery[0] ?? summary.imageUrl,
        description: descriptionText(u.description),
        gallery,
        highlights: amenities.slice(0, 18),
        options: [option],
        paxRules: housePaxRules(max || 1),
        info: [
          { label: "Tipo", value: propertyTypeLabel(u.property_type) },
          ...(int(u.bedrooms) ? [{ label: "Quartos", value: String(int(u.bedrooms)) }] : []),
          ...(Number(u.bathrooms) ? [{ label: "Banheiros", value: bathroomsText(u.bathrooms) }] : []),
          ...(max ? [{ label: "Capacidade", value: `${max} hóspedes` }] : []),
          ...(communityOf(u) ? [{ label: "Condomínio", value: communityOf(u)! }] : []),
          ...(u.address1 ? [{ label: "Endereço", value: [u.address1, cityOf(u), u.state].filter(Boolean).join(", ") }] : []),
          ...(checkin ? [{ label: "Check-in", value: `a partir das ${checkin}` }] : []),
          ...(checkout ? [{ label: "Check-out", value: `até ${checkout}` }] : []),
          ...(minNights > 1 ? [{ label: "Estadia mínima", value: `${minNights} noites` }] : []),
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      const stay = validateStay(req.checkIn, req.checkOut);
      const u = await unit(req.productId);
      if (!u) throw new SupplierError("Casa não encontrada no fornecedor");
      const id = idOf(u);
      const pax = normalizeHousePax(req.pax);
      const max = maxGuestsOf(u);
      if (!max) throw new SupplierError("Esta casa está sem a capacidade cadastrada, escolha outra");
      if (houseGuests(pax) > max) throw new SupplierError(`Esta casa acomoda até ${max} hóspedes (adultos e crianças).`);
      // preço do momento (e grava na tabela: busca e página da casa passam a mostrar este mesmo valor)
      const entry = await priceFor(id, stay.checkIn, stay.checkOut, { fresh: true });
      if (!entry) throw new SupplierError(STILL_PRICING.replace("Atualize a página", "Tente de novo"));
      const q = entry.q;
      if (!q) throw new SupplierError(await unavailableWhy(id, stay.checkIn, stay.checkOut));
      if (q.currency !== "USD") throw new SupplierIntegrationError(`Master Vacation Home: cotação em ${q.currency} (esperado USD)`, { currency: q.currency });
      const lines = mvhQuoteLines(q, stay.nights);
      const canc = cancellationFor(stay.checkIn, freeCancelDays);
      const p = u.pricing;
      return {
        supplierCode: MVH_CODE,
        category: "HOUSES",
        productId: id,
        optionId: "casa",
        title: titleOf(u),
        subtitle: `${subtitleOf(u)} · ${stay.nights} noite${stay.nights > 1 ? "s" : ""}`,
        location: locationOf(u) || null,
        imageUrl: u.photo_url?.trim() || photoUrls(u.photos)[0] || null,
        serviceDate: stay.checkIn,
        serviceEndDate: stay.checkOut,
        expiresAt: expiresAtFor(stay.checkIn),
        currency: "USD",
        lines,
        pax,
        paxRules: housePaxRules(max),
        details: {
          propertyId: id,
          houseName: titleOf(u),
          nights: stay.nights,
          guests: houseGuests(pax),
          address: [u.address1, cityOf(u), u.state, u.zip].filter(Boolean).join(", ") || null,
          resort: communityOf(u),
          bedrooms: int(u.bedrooms) || null,
          bathrooms: Number(u.bathrooms) || null,
          maxOccupancy: max,
          checkinTime: hourText(p?.default_check_in_time),
          checkoutTime: hourText(p?.default_check_out_time),
          grandTotal: q.total,
          cancellation: canc.text,
          freeCancellationUntil: canc.until,
          nonRefundable: !canc.until,
          notes: feeNotes(q, u),
          ...(manual ? { manualBooking: true } : {}),
        },
        quoteRef: stableId(MVH_CODE, id, stay.checkIn, stay.checkOut, q.total),
      };
    },

    async findBooking(item: BookItem): Promise<BookingResult | null> {
      const checkIn = item.serviceDate ?? null;
      const checkOut = item.serviceEndDate ?? null;
      if (!checkIn || !checkOut || !VALID_ID.test(item.productId)) return null;
      // reservas feitas pela nossa chave (a Master só devolve as nossas), alteradas nos últimos 90 dias
      const since = `${addDays(todayLocal(), -90)}T00:00:00`;
      let cursor: string | undefined;
      try {
        for (let page = 0; page < 20; page++) {
          const rs = await client.get<{ has_more?: boolean; next_cursor?: string | null; reservations?: PartnerReservation[] }>("/api/v1/partner/reservations", { modified_since: since, limit: 500, cursor });
          const r = (rs.reservations ?? []).find((x) => String(x.unit_id) === item.productId && x.check_in === checkIn && x.check_out === checkOut && !/cancel/i.test(x.status ?? ""));
          if (r)
            return {
              bookingRef: r.booking_ref || String(r.reservation_id),
              status: /confirm|booked/i.test(r.status ?? "confirmed") ? "CONFIRMED" : "PENDING",
              payload: { reservationId: String(r.reservation_id), bookingReference: r.booking_ref ?? null, supplierStatus: r.status ?? null, sandbox: cfg.sandbox },
            };
          if (!rs.has_more || !rs.next_cursor) break;
          cursor = rs.next_cursor;
        }
      } catch (e) {
        // chave sem `read:reservations`: não há como procurar
        if (e instanceof MvhApiError && e.status === 403) return null;
        throw e;
      }
      return null;
    },

    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      if (manual) throw new SupplierError("A Master Vacation Home está em reserva manual: reserve direto com a Master e registre o localizador no pedido");
      if (cfg.sandbox && opts.blockSandboxBooking)
        throw new SupplierError("Chave SANDBOX da Master: as reservas são simuladas e não chegam à Master. Configure a chave de produção antes de vender.");
      const checkIn = item.serviceDate ?? undefined;
      const checkOut = item.serviceEndDate ?? undefined;
      if (!checkIn || !checkOut) throw new SupplierError("Reserva sem datas de check-in/check-out");
      const stay = validateStay(checkIn, checkOut);
      const u = await unit(item.productId);
      if (!u) throw new SupplierError("Casa não encontrada no fornecedor");
      const id = idOf(u);
      const pax = normalizeHousePax(item.pax);
      // preço do momento: nunca reservar acima do custo vendido
      const entry = await priceFor(id, stay.checkIn, stay.checkOut, { fresh: true });
      if (!entry) throw new SupplierError("A Master ainda está calculando o preço da estadia. Tente emitir de novo em alguns segundos.");
      if (!entry.q) throw new SupplierError(await unavailableWhy(id, stay.checkIn, stay.checkOut));
      const total = new Decimal(entry.q.total);
      if (item.maxCost) {
        if (entry.q.currency !== item.maxCost.currency) throw new SupplierError(`A Master mudou a moeda (${entry.q.currency}), não reservamos`);
        if (total.gt(new Decimal(item.maxCost.amount).plus("0.01")))
          throw new SupplierError(`A Master aumentou o preço (${item.maxCost.currency} ${total.toFixed(2)} > vendido ${new Decimal(item.maxCost.amount).toFixed(2)}). A reserva não foi feita.`);
      }
      const holder = ctx.holder ?? ctx.travelers.find((t) => t.type !== "CHILD" && t.name?.trim()) ?? null;
      const name = holder?.name?.trim();
      if (!name) throw new SupplierError("Informe o nome do hóspede responsável");
      const email = (ctx.contact?.email ?? holder?.email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SupplierError("A Master exige o e-mail do hóspede responsável");
      const reference = item.reference ?? stableId(MVH_CODE, id, stay.checkIn, stay.checkOut);
      // nova tentativa depois de falha: outra chave (a mesma devolveria o pedido recusado)
      const idempotencyKey = ctx.retry ? `${reference}-${Date.now().toString(36)}` : reference;
      const notes = [`Subrinho ${reference}`, ctx.remark?.trim() ? `Pedidos do hóspede: ${ctx.remark.trim().slice(0, 500)}` : null].filter(Boolean).join(" · ");
      let queued: { correlation_id?: string; outbox_id?: number; status?: string; idempotent_replay?: boolean };
      try {
        queued = await client.post(
          "/api/v1/internal/reservations",
          { unit_id: Number(id), arrival: stay.checkIn, departure: stay.checkOut, adults: pax.adults, children: pax.children ?? 0, guest_name: name, guest_email: email, notes },
          { idempotencyKey },
        );
      } catch (e) {
        if (e instanceof MvhApiError && e.status === 403)
          throw new SupplierIntegrationError(
            "A chave da Master não tem permissão de reserva (write:bookings). Peça à Master para ativar, ou use MASTER_VACATION_HOME_MANUAL_ISSUE=1 para reservar manualmente.",
            { status: 403 },
          );
        if (e instanceof MvhApiError && e.status < 500 && e.status !== 401 && e.status !== 429) throw new SupplierError(`A Master recusou a reserva: ${e.message.replace(/^Master Vacation Home [^:]*: /, "")}`);
        throw e;
      }
      const cid = queued.correlation_id;
      if (!cid) throw new SupplierIntegrationError("Master Vacation Home: reserva sem correlation_id na resposta", { queued });
      const base = { correlationId: cid, outboxId: queued.outbox_id ?? null, idempotencyKey, idempotentReplay: queued.idempotent_replay ?? false, quotedTotal: total.toFixed(2) };
      const job = await waitJob(cid, bookingWait);
      if (job && jobOutcome(job) === "FAILED") throw new SupplierError(`A Master recusou a reserva: ${job.error || job.status}`);
      return bookingResult(job, base, cid);
    },

    async bookingStatus(bookingRef: string, stored?: Record<string, unknown>): Promise<BookingResult> {
      const s = stored ?? {};
      const cancel = (s.cancellation ?? {}) as Record<string, unknown>;
      // cancelamento em fila: acompanha até a Master confirmar
      if (typeof cancel.cancelCorrelationId === "string") {
        const job = await jobStatus(cancel.cancelCorrelationId);
        const out = jobOutcome(job);
        if (out === "DONE") return { bookingRef, status: "CANCELLED", payload: { cancelStatus: job.status, cancelledAt: new Date().toISOString() } };
        if (out === "FAILED") return { bookingRef, status: "CONFIRMED", payload: { cancelStatus: job.status, cancelError: job.error ?? null } };
        return { bookingRef, status: "CANCEL_REQUESTED", payload: { cancelStatus: job.status } };
      }
      const cid = typeof s.correlationId === "string" ? s.correlationId : null;
      if (!cid) throw new SupplierError("Reserva sem o identificador da fila da Master (correlation_id), consulte com a Master");
      const job = await jobStatus(cid);
      if (jobOutcome(job) === "FAILED") return { bookingRef, status: "REJECTED", payload: { supplierStatus: job.status, error: job.error ?? null } };
      return bookingResult(job, s, bookingRef);
    },

    async cancelBooking(bookingRef: string, o: { simulate: boolean; stored?: Record<string, unknown> }): Promise<CancelResult> {
      if (o.simulate) throw new SupplierError("A Master não simula a multa de cancelamento, confira a política com a Master antes de cancelar");
      const rid = String(o.stored?.reservationId ?? (VALID_ID.test(bookingRef) ? bookingRef : ""));
      if (!VALID_ID.test(rid)) throw new SupplierError("Reserva sem o id da Master (ainda aguardando confirmação?). Atualize o status antes de cancelar.");
      let queued: { correlation_id?: string; status?: string };
      try {
        queued = await client.post(`/api/v1/internal/reservations/${rid}/cancel`, { reason: "Cancelado pela Subrinho" }, { idempotencyKey: `cancel-${rid}` });
      } catch (e) {
        if (e instanceof MvhApiError && e.status === 409) return { status: "CANCELLED", penalty: null, reference: bookingRef, payload: { cancelMessage: "Já estava cancelada na Master" } };
        if (e instanceof MvhApiError && e.status < 500 && e.status !== 401 && e.status !== 429) throw new SupplierError(`A Master não permitiu cancelar: ${e.message.replace(/^Master Vacation Home [^:]*: /, "")}`);
        throw e;
      }
      const cid = queued.correlation_id ?? null;
      const job = cid ? await waitJob(cid, bookingWait) : null;
      const out = jobOutcome(job);
      if (out === "FAILED") throw new SupplierError(`A Master não conseguiu cancelar: ${job?.error || job?.status}`);
      return {
        status: out === "DONE" ? "CANCELLED" : "CANCEL_REQUESTED",
        penalty: null,
        reference: bookingRef,
        payload: { cancelCorrelationId: cid, cancelStatus: job?.status ?? queued.status ?? null, requestedAt: new Date().toISOString() },
      };
    },
  };

  return adapter;
}

export function createMvhFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const cfg = mvhConfig(env);
  if (!cfg) return null;
  const days = Number(env.MASTER_VACATION_HOME_FREE_CANCEL_DAYS);
  return createMvhAdapter(cfg, {
    freeCancelDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    manualIssue: /^(1|true|sim|yes)$/i.test(env.MASTER_VACATION_HOME_MANUAL_ISSUE?.trim() ?? ""),
    blockSandboxBooking: env.VERCEL_ENV === "production" && env.MASTER_VACATION_HOME_ALLOW_SANDBOX !== "1",
  });
}
