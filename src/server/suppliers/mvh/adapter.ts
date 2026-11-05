/**
 * Adaptador real da Master Vacation Home (casas de temporada em Orlando).
 *
 * Referência das rotas: a integração do airnext. O que NÃO repetimos de lá:
 *  - preço da busca diferente do preço da casa: a listagem da Master (`/quote` sem casa) devolve
 *    valores TABELADOS por tier (várias casas com o mesmo número). Aqui ela só diz QUAIS casas estão
 *    livres; o preço de todo lugar (card da busca, página da casa, carrinho, checkout, emissão) vem
 *    da cotação daquela casa (`/quote/{id}` com as datas e o número de hóspedes), guardada numa tabela
 *    única por período + hóspedes. A busca e a página da casa leem a MESMA cotação → mesmo preço;
 *  - cobrança: lá a margem incidia só no aluguel, limpeza/serviço/impostos passavam sem margem e a taxa
 *    do parcelado só em parte do valor, com câmbio "cartão" próprio. Aqui o custo é o TOTAL que a
 *    Master cobra (aluguel − desconto + limpeza + serviço + impostos), em USD, e entra na conta de todo
 *    item (câmbio → margem Subrinho → margem do afiliado → parcelado), como na MAPRO.
 *
 * Fluxo:
 *  - search     → `/quote` (quem está livre) + `getproperties` (conteúdo) → filtra destino, capacidade e
 *                 estadia mínima → cotação de cada casa (concorrência limitada, orçamento de tempo; casa
 *                 sem cotação válida fica fora, nunca aparece com preço tabelado);
 *  - getProduct → conteúdo + descrição + fotos + a cotação da tabela (ou uma nova); indisponível →
 *                 calendário iCal diz o motivo (data ocupada / estadia mínima);
 *  - quote      → cotação nova (carrinho e checkout) — atualiza a tabela, então busca e página passam a
 *                 mostrar o mesmo valor do carrinho;
 *  - book       → a API não tem reserva: a equipe reserva com a Master e registra o localizador no
 *                 Painel Subrinho (`manualIssue`).
 */
import Decimal from "decimal.js";
import type { PaxConfig, PriceLine } from "@/server/db/schema";
import { addDays, todayLocal } from "@/lib/tz";
import { expiresAtFor } from "../mock/util";
import {
  type BookingResult,
  type OfferOption,
  type ProductDetail,
  type ProductSummary,
  type Quote,
  type QuoteRequest,
  type SearchParams,
  type SupplierAdapter,
  SupplierError,
} from "../types";
import { cached, cacheGet, cacheSet } from "../hotels/cache";
import { brDate, money2, stableId, validateStay } from "../hotels/common";
import { bathroomsText, cancellationFor, houseGuests, housePaxRules, matchesHouseDestination, normalizeHousePax, propertyTypeLabel } from "../houses/common";
import { MvhClient, mvhConfig, type MvhConfig, type Transport } from "./client";

export const MVH_CODE = "MASTER_VACATION_HOME";
const NAME = "Master Vacation Home";
const PROPS_TTL = 6 * 3600;
const CONTENT_TTL = 24 * 3600;
const LISTING_TTL = 15 * 60;
/** Validade de cada cotação na tabela de preços (busca e página da casa usam a mesma). */
export const PRICE_TTL = 15 * 60;
const ICAL_TTL = 10 * 60;
const QUOTE_TIMEOUT_MS = 10_000;
/** A Master leva alguns segundos por cotação: várias em paralelo, dentro do tempo da página. */
const CONCURRENCY = 30;
const SEARCH_BUDGET_MS = 35_000;

// ───────────── Tipos da API ─────────────

type Num = number | string | null | undefined;
export type MvhProperty = {
  PropertyID: number | string;
  WebsitePropertyName?: string | null;
  MCPropertyName?: string | null;
  Community?: string | null;
  PropertyType?: string | null;
  Address?: string | null;
  City?: string | null;
  State?: string | null;
  Bedrooms?: Num;
  Bathrooms?: Num;
  Sleeps?: Num;
  MinimumNightsStay?: Num;
  MainImageURL?: string | null;
  XCO?: Num;
  YCO?: Num;
  [amenity: string]: unknown;
};
export type MvhQuote = {
  PropertyID?: number | string;
  QuoteBaseRate?: Num;
  discount_amount?: Num;
  cleaning?: Num;
  service?: Num;
  taxes?: Num;
  QuoteExcludingTax?: Num;
  QuoteIncludingTax?: Num;
  nights?: Num;
  error?: boolean | string;
  message?: string;
};
/** Só os campos de preço (o que a tabela guarda). */
export type MvhPrice = Required<Pick<MvhQuote, "QuoteBaseRate" | "discount_amount" | "cleaning" | "service" | "taxes" | "QuoteIncludingTax">>;
type PriceEntry = { q: MvhPrice | null; at: number };
type PriceTable = Record<string, PriceEntry>;

// ───────────── Helpers puros (testados) ─────────────

const idOf = (p: { PropertyID?: number | string }) => String(p.PropertyID ?? "").trim();

/** Campos de preço da listagem (tabelados por tier): nunca viram preço, então saem do conteúdo. */
const LISTING_PRICE_FIELDS = ["QuoteBaseRate", "discount_amount", "cleaning", "service", "taxes", "QuoteExcludingTax", "QuoteIncludingTax", "nights", "error", "message"];

function contentOnly(l: MvhProperty & MvhQuote): MvhProperty {
  const c: Record<string, unknown> = { ...l };
  for (const k of LISTING_PRICE_FIELDS) delete c[k];
  return c as MvhProperty;
}
const VALID_ID = /^[0-9A-Za-z_-]{1,40}$/;

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

/** Booleanos da Master vêm como true/"true"/"True"/"1"/1/"Yes". */
export function truthy(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === "string" && /^(true|1|yes|y|sim)$/i.test(v.trim()));
}

/** Cotação válida da casa (null = indisponível nas datas). */
export function priceOfQuote(raw: MvhQuote | null | undefined): MvhPrice | null {
  if (!raw || typeof raw !== "object" || raw.error === true || raw.error === "true") return null;
  if (!dec(raw.QuoteIncludingTax).gt(0)) return null;
  return {
    QuoteBaseRate: raw.QuoteBaseRate ?? null,
    discount_amount: raw.discount_amount ?? null,
    cleaning: raw.cleaning ?? null,
    service: raw.service ?? null,
    taxes: raw.taxes ?? null,
    QuoteIncludingTax: raw.QuoteIncludingTax ?? null,
  };
}

/**
 * Linhas de custo (USD) — somam exatamente o total cobrado pela Master (QuoteIncludingTax).
 * Aluguel = base − desconto; limpeza e serviço = taxas; impostos locais à parte. Todas são custo e
 * passam pelas margens (nada "por fora" da conta). Se não somarem o total (convenção diferente,
 * arredondamento), vira uma linha só com o total da Master: o total dela manda.
 */
export function mvhQuoteLines(q: MvhPrice, nights: number): PriceLine[] {
  const total = dec(q.QuoteIncludingTax);
  const n = `${nights} noite${nights > 1 ? "s" : ""}`;
  const single: PriceLine[] = [{ type: "STAY", label: `Estadia completa · ${n} (aluguel, taxas e impostos)`, unitCost: total.toFixed(2), quantity: 1 }];
  const rent = dec(q.QuoteBaseRate).minus(dec(q.discount_amount));
  if (rent.lte(0)) return single;
  const lines: PriceLine[] = [{ type: "NIGHT", label: `Aluguel da casa · ${n}`, unitCost: rent.toFixed(2), quantity: 1 }];
  const cleaning = dec(q.cleaning);
  const service = dec(q.service);
  const taxes = dec(q.taxes);
  if (cleaning.gt(0)) lines.push({ type: "FEE", label: "Taxa de limpeza", unitCost: cleaning.toFixed(2), quantity: 1 });
  if (service.gt(0)) lines.push({ type: "FEE", label: "Taxa de serviço", unitCost: service.toFixed(2), quantity: 1 });
  if (taxes.gt(0)) lines.push({ type: "TAX", label: "Impostos locais (Sales Tax e Tourist Tax)", unitCost: taxes.toFixed(2), quantity: 1 });
  const sum = lines.reduce((s, l) => s.plus(l.unitCost), new Decimal(0));
  return sum.eq(total) ? lines : single;
}

/** Comodidades da Master (campos booleanos) → português, as mais importantes primeiro. */
const AMENITIES: [string, string][] = [
  ["HasPool", "Piscina privativa"],
  ["SouthFacingPool", "Piscina voltada para o sul"],
  ["HasSpa", "Hidromassagem (spa)"],
  ["GamesRoom", "Sala de jogos"],
  ["VideoGames", "Videogame"],
  ["CommunalPool", "Piscina do condomínio"],
  ["CommunalGym", "Academia do condomínio"],
  ["WiFi", "Wi-Fi"],
  ["Internet", "Wi-Fi"],
  ["AirCon", "Ar-condicionado"],
  ["BigScreenTV", "TV de tela grande"],
  ["TVInEveryBedroom", "TV em todos os quartos"],
  ["Kitchen", "Cozinha completa"],
  ["BBQ", "Churrasqueira"],
  ["Grill", "Churrasqueira"],
  ["Parking", "Estacionamento"],
  ["Crib", "Berço"],
  ["PacknPlay", "Berço portátil"],
  ["HighChair", "Cadeirão de bebê"],
  ["Stroller", "Carrinho de bebê"],
  ["HairDryer", "Secador de cabelo"],
  ["DVDPlayer", "DVD"],
  ["PetsAllowed", "Aceita animais"],
  ["WaterView", "Vista para a água"],
  ["GolfView", "Vista para o golfe"],
  ["ConservationView", "Vista para área de preservação"],
];

export function mvhAmenities(p: MvhProperty): string[] {
  return [...new Set(AMENITIES.filter(([k]) => truthy(p[k])).map(([, label]) => label))];
}

/** Latitude/longitude (XCO/YCO). Na Flórida a latitude é positiva e a longitude negativa: corrige se vier trocado. */
export function coordsOf(p: Pick<MvhProperty, "XCO" | "YCO">): { lat: number; lon: number } | null {
  const x = Number(p.XCO);
  const y = Number(p.YCO);
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0) || Math.abs(x) > 180 || Math.abs(y) > 180) return null;
  if (Math.abs(x) > 90 || (x < 0 && y > 0)) return { lat: y, lon: x };
  return { lat: x, lon: y };
}

/** Noites ocupadas (yyyy-mm-dd) no calendário iCal da casa. */
export function icalBusyNights(text: string): Set<string> {
  const busy = new Set<string>();
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const block of unfolded.split(/BEGIN:VEVENT/).slice(1)) {
    const start = block.match(/\nDTSTART[^:\n]*:(\d{8})/)?.[1];
    const end = block.match(/\nDTEND[^:\n]*:(\d{8})/)?.[1];
    if (!start) continue;
    const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const from = iso(start);
    const to = end ? iso(end) : addDays(from, 1);
    for (let d = from, i = 0; d < to && i < 400; d = addDays(d, 1), i++) busy.add(d);
  }
  return busy;
}

/** Por que a casa não está disponível nas datas. */
export function mvhUnavailableReason(busy: Set<string> | null, minNights: number, checkIn: string, checkOut: string): string {
  const nights: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nights.push(d);
  const taken = busy ? nights.find((d) => busy.has(d)) : undefined;
  if (taken) return `A casa já está reservada em ${brDate(taken)}. Escolha outras datas.`;
  if (minNights > nights.length) return `Estadia mínima de ${minNights} noites nesta casa.`;
  return "A casa não está disponível para estas datas.";
}

/** Fotos da casa: lista de URLs (ou objetos com a URL). */
export function imageUrls(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const urls = list.map((x) => (typeof x === "string" ? x : ((x as Record<string, unknown>)?.URL ?? (x as Record<string, unknown>)?.ImageURL ?? (x as Record<string, unknown>)?.url)) as unknown);
  return [...new Set(urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u.trim())).map((u) => u.trim()))];
}

/** Texto da descrição: sem HTML, parágrafos separados por linha em branco. */
export function descriptionText(raw: unknown): string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const t = [r.GetDescriptionsPlainTextResult, r.description, r.Description, typeof raw === "string" ? raw : null].find((v): v is string => typeof v === "string" && !!v.trim()) ?? "";
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

// ───────────── Adaptador ─────────────

export type MvhOptions = { transport?: Transport; freeCancelDays?: number | null; concurrency?: number; searchBudgetMs?: number };

export function createMvhAdapter(cfg: MvhConfig, opts: MvhOptions = {}) {
  const client = new MvhClient(cfg, opts.transport);
  const account = stableId(cfg.baseUrl, cfg.uid).slice(0, 10); // separa o cache por conta, sem expor o uid
  const freeCancelDays = opts.freeCancelDays ?? null;
  const concurrency = Math.max(1, opts.concurrency ?? CONCURRENCY);
  const budgetMs = opts.searchBudgetMs ?? SEARCH_BUDGET_MS;
  const inflight = new Map<string, Promise<MvhPrice | null>>();

  const properties = () =>
    cached(`mvh:${account}:props`, PROPS_TTL, async () => {
      const rs = await client.get<unknown>("getproperties", {}, { timeoutMs: 30_000 });
      return (Array.isArray(rs) ? rs : []).filter((p): p is MvhProperty => !!p && VALID_ID.test(idOf(p as MvhProperty)));
    }, { cacheIf: (v) => v.length > 0 });

  async function property(id: string): Promise<MvhProperty | null> {
    if (!VALID_ID.test(id)) return null;
    return (await properties()).find((p) => idOf(p) === id) ?? null;
  }

  /** Casas livres no período (a listagem da Master). O preço dela NÃO é usado — só a ordem de consulta. */
  const listing = (checkIn: string, checkOut: string) =>
    cached(`mvh:${account}:list:${checkIn}:${checkOut}`, LISTING_TTL, async () => {
      const rs = await client.get<unknown>("quote", { ArriveDate: checkIn, DepartDate: checkOut }, { withUid: true, timeoutMs: 45_000 });
      return (Array.isArray(rs) ? rs : []).filter((p): p is MvhProperty & MvhQuote => !!p && VALID_ID.test(idOf(p as MvhProperty)));
    });

  // ── Tabela de preços: UMA cotação por casa × período × hóspedes, lida pela busca e pela página ──
  const tableKey = (checkIn: string, checkOut: string, guests: number) => `mvh:${account}:prices:${checkIn}:${checkOut}:g${guests}`;

  async function loadTable(key: string): Promise<PriceTable> {
    const raw = (await cacheGet<PriceTable>(key)) ?? {};
    const now = Date.now();
    const out: PriceTable = {};
    for (const [id, e] of Object.entries(raw)) if (e && now - e.at < PRICE_TTL * 1000) out[id] = e;
    return out;
  }

  async function saveTable(key: string, fresh: PriceTable) {
    // junta com o que outra busca simultânea gravou (vale a cotação mais nova de cada casa)
    const merged = await loadTable(key);
    for (const [id, e] of Object.entries(fresh)) if (!merged[id] || merged[id].at <= e.at) merged[id] = e;
    await cacheSet(key, merged, PRICE_TTL);
  }

  /** Cotação real de UMA casa na Master (sem cache). null = indisponível nas datas. */
  function fetchPrice(id: string, checkIn: string, checkOut: string, guests: number): Promise<MvhPrice | null> {
    const k = `${id}:${checkIn}:${checkOut}:${guests}`;
    const pending = inflight.get(k);
    if (pending) return pending;
    const p = client
      .get<MvhQuote>(`quote/${encodeURIComponent(id)}`, { ArriveDate: checkIn, DepartDate: checkOut, Guests: guests }, { withUid: true, timeoutMs: QUOTE_TIMEOUT_MS })
      .then(priceOfQuote)
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  }

  /** Cotação de uma casa: da tabela (mesmo valor da busca) ou nova (`fresh`: carrinho/checkout). */
  async function priceFor(id: string, checkIn: string, checkOut: string, guests: number, o: { fresh?: boolean } = {}): Promise<MvhPrice | null> {
    const key = tableKey(checkIn, checkOut, guests);
    if (!o.fresh) {
      const hit = (await loadTable(key))[id];
      if (hit) return hit.q;
    }
    const q = await fetchPrice(id, checkIn, checkOut, guests);
    await saveTable(key, { [id]: { q, at: Date.now() } });
    return q;
  }

  /**
   * Cotação de várias casas (busca). Reaproveita a tabela; consulta as que faltam em paralelo até o
   * orçamento de tempo. Falha temporária não é gravada (tenta de novo na próxima busca); casa que
   * não coube no tempo fica fora desta resposta e entra na próxima (a tabela vai se completando).
   */
  async function priceMany(ids: string[], checkIn: string, checkOut: string, guests: number): Promise<PriceTable> {
    const key = tableKey(checkIn, checkOut, guests);
    const table = await loadTable(key);
    const missing = ids.filter((id) => !table[id]);
    if (!missing.length) return table;
    const fresh: PriceTable = {};
    const t0 = Date.now();
    let next = 0;
    let failures = 0;
    let firstError: unknown = null;
    const worker = async () => {
      while (next < missing.length && Date.now() - t0 < budgetMs) {
        const id = missing[next++];
        try {
          fresh[id] = { q: await fetchPrice(id, checkIn, checkOut, guests), at: Date.now() };
        } catch (e) {
          failures++;
          firstError ??= e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
    const done = Object.keys(fresh).length;
    if (done) await saveTable(key, fresh);
    // a Master não respondeu nenhuma: erro (a loja avisa que o fornecedor não respondeu), não "sem casas"
    if (!done && !Object.keys(table).length && firstError) throw firstError;
    if (next < missing.length || failures) console.warn(`[busca] ${MVH_CODE}: ${done}/${missing.length} cotações novas (${failures} falhas, ${missing.length - next} ficaram para a próxima busca)`);
    return { ...table, ...fresh };
  }

  async function busyNights(id: string): Promise<Set<string> | null> {
    const list = await cached(`mvh:${account}:ical:${id}`, ICAL_TTL, async () => [...icalBusyNights(await client.ical(id))]).catch(() => null);
    return list ? new Set(list) : null;
  }

  const description = (id: string) =>
    cached(`mvh:${account}:desc:${id}`, CONTENT_TTL, async () => descriptionText(await client.get<unknown>(`getdescription/${encodeURIComponent(id)}`)), { cacheIf: (v) => !!v }).catch(() => "");
  const images = (id: string) =>
    cached(`mvh:${account}:img:${id}`, CONTENT_TTL, async () => imageUrls(await client.get<unknown>(`getimages/${encodeURIComponent(id)}`)), { cacheIf: (v) => v.length > 0 }).catch(() => [] as string[]);

  const titleOf = (p: MvhProperty) => (p.WebsitePropertyName || p.MCPropertyName || "").trim() || "Casa de temporada";
  const maxGuestsOf = (p: MvhProperty) => int(p.Sleeps);
  const subtitleOf = (p: MvhProperty) => {
    const bedrooms = int(p.Bedrooms);
    const bathrooms = Number(p.Bathrooms) || 0;
    const max = maxGuestsOf(p);
    return [propertyTypeLabel(p.PropertyType), bedrooms ? `${bedrooms} quarto${bedrooms > 1 ? "s" : ""}` : null, bathrooms ? `${bathroomsText(bathrooms)} banheiro${bathrooms > 1 ? "s" : ""}` : null, max ? `até ${max} hóspedes` : null]
      .filter(Boolean)
      .join(" · ");
  };
  const communityOf = (p: MvhProperty) => (p.Community ?? "").trim() || null;
  const locationOf = (p: MvhProperty) => [communityOf(p), [p.City?.trim(), p.State?.trim()].filter(Boolean).join(", ") || "Orlando, FL"].filter(Boolean).join(" · ");
  const tagsOf = (p: MvhProperty) => {
    const out: string[] = [];
    if (truthy(p.HasPool)) out.push("Piscina privativa");
    if (truthy(p.GamesRoom)) out.push("Sala de jogos");
    if (truthy(p.HasSpa)) out.push("Hidromassagem");
    if (truthy(p.CommunalPool) || truthy(p.CommunalGym)) out.push("Clube do condomínio");
    return out.slice(0, 3);
  };

  const fitsDestination = (query: string | undefined, p: MvhProperty) => {
    const c = coordsOf(p);
    // sem cidade e sem coordenadas: a casa é da base da Master (região de Orlando)
    const city = p.City?.trim() || (c ? null : "Orlando");
    return matchesHouseDestination(query, { city, state: p.State ?? "FL", resort: p.Community, title: titleOf(p), address: p.Address, lat: c?.lat, lon: c?.lon });
  };

  function summaryOf(p: MvhProperty, q: MvhPrice | null, nights: number): ProductSummary {
    return {
      supplierCode: MVH_CODE,
      supplierName: NAME,
      category: "HOUSES",
      productId: idOf(p),
      title: titleOf(p),
      subtitle: subtitleOf(p),
      location: locationOf(p),
      destination: p.City?.trim() || "Orlando",
      imageUrl: p.MainImageURL?.trim() || null,
      tags: tagsOf(p),
      currency: "USD",
      lines: q ? mvhQuoteLines(q, nights) : [],
      area: communityOf(p),
      house: { bedrooms: int(p.Bedrooms), bathrooms: Number(p.Bathrooms) || 0, maxGuests: maxGuestsOf(p), privatePool: truthy(p.HasPool) },
    };
  }

  function feeNotes(q: MvhPrice, p: MvhProperty): string[] {
    const included = [dec(q.cleaning).gt(0) ? "taxa de limpeza" : null, dec(q.service).gt(0) ? "taxa de serviço" : null].filter(Boolean);
    const notes = [`Já inclui: ${[...included, "impostos locais"].join(", ")}.`];
    const min = int(p.MinimumNightsStay);
    if (min > 1) notes.push(`Estadia mínima de ${min} noites.`);
    return notes;
  }

  function optionOf(p: MvhProperty, q: MvhPrice | null, stay: { checkIn: string; nights: number }, pax: PaxConfig, why: string | null): OfferOption {
    const canc = cancellationFor(stay.checkIn, freeCancelDays);
    const max = maxGuestsOf(p);
    const fits = max > 0 && houseGuests(pax) <= max;
    return {
      optionId: "casa",
      title: "Casa inteira",
      description: subtitleOf(p),
      currency: "USD",
      lines: q ? mvhQuoteLines(q, stay.nights) : [],
      attributes: [{ label: "Cancelamento", value: canc.text }],
      notes: q ? feeNotes(q, p) : why ? [why] : [],
      freeCancellationUntil: canc.until,
      available: !!q && fits,
    };
  }

  const adapter: SupplierAdapter & { client: MvhClient } = {
    code: MVH_CODE,
    name: NAME,
    category: "HOUSES",
    defaultCurrency: "USD",
    live: true,
    manualIssue: true,
    client,

    destinations() {
      return ["Orlando", "Kissimmee", "Davenport"].map((name) => ({ id: name, name }));
    },

    async search(params: SearchParams): Promise<ProductSummary[]> {
      const stay = validateStay(params.checkIn, params.checkOut);
      const guests = houseGuests(normalizeHousePax(params.pax));
      const [free, all] = await Promise.all([listing(stay.checkIn, stay.checkOut), properties().catch(() => [] as MvhProperty[])]);
      const content = new Map(all.map((p) => [idOf(p), p]));
      const candidates = free
        .map((l) => {
          // conteúdo do cadastro completo; a listagem só completa o que faltar (nunca o preço)
          const p = { ...contentOnly(l), ...content.get(idOf(l)) } as MvhProperty;
          return { p, hint: dec(l.QuoteIncludingTax).toNumber() || Number.MAX_SAFE_INTEGER };
        })
        .filter(({ p }) => maxGuestsOf(p) >= guests && int(p.MinimumNightsStay) <= stay.nights && fitsDestination(params.destination, p))
        // as prováveis mais baratas primeiro (aparecem no topo da busca); a ordem final é pelo preço real
        .sort((a, b) => a.hint - b.hint);
      if (!candidates.length) return [];
      const table = await priceMany(
        candidates.map((c) => idOf(c.p)),
        stay.checkIn,
        stay.checkOut,
        guests,
      );
      return candidates.flatMap(({ p }) => {
        const q = table[idOf(p)]?.q;
        return q ? [summaryOf(p, q, stay.nights)] : [];
      });
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      const p = await property(productId);
      if (!p) return null;
      const id = idOf(p);
      const pax = normalizeHousePax(params.pax);
      let stay: { checkIn: string; checkOut: string; nights: number };
      try {
        stay = validateStay(params.checkIn, params.checkOut);
      } catch {
        stay = { checkIn: addDays(todayLocal(), 30), checkOut: addDays(todayLocal(), 37), nights: 7 };
      }
      const max = maxGuestsOf(p);
      const minNights = int(p.MinimumNightsStay);
      const [q, desc, photos] = await Promise.all([
        // falha da Master sobe como erro (não vira "casa indisponível")
        minNights > stay.nights ? Promise.resolve(null) : priceFor(id, stay.checkIn, stay.checkOut, houseGuests(pax)),
        description(id),
        images(id),
      ]);
      const why = q ? null : mvhUnavailableReason(await busyNights(id), minNights, stay.checkIn, stay.checkOut);
      const option = optionOf(p, q, stay, pax, why);
      const gallery = photos.length ? photos : p.MainImageURL ? [p.MainImageURL.trim()] : [];
      const summary = summaryOf(p, q, stay.nights);
      return {
        ...summary,
        imageUrl: gallery[0] ?? summary.imageUrl,
        description: desc,
        gallery,
        highlights: mvhAmenities(p).slice(0, 18),
        options: [option],
        paxRules: housePaxRules(max || 1),
        info: [
          { label: "Tipo", value: propertyTypeLabel(p.PropertyType) },
          ...(int(p.Bedrooms) ? [{ label: "Quartos", value: String(int(p.Bedrooms)) }] : []),
          ...(Number(p.Bathrooms) ? [{ label: "Banheiros", value: bathroomsText(p.Bathrooms) }] : []),
          ...(max ? [{ label: "Capacidade", value: `${max} hóspedes` }] : []),
          ...(communityOf(p) ? [{ label: "Condomínio", value: communityOf(p)! }] : []),
          ...(minNights > 1 ? [{ label: "Estadia mínima", value: `${minNights} noites` }] : []),
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      const stay = validateStay(req.checkIn, req.checkOut);
      const p = await property(req.productId);
      if (!p) throw new SupplierError("Casa não encontrada no fornecedor");
      const id = idOf(p);
      const pax = normalizeHousePax(req.pax);
      const max = maxGuestsOf(p);
      if (!max) throw new SupplierError("Esta casa está sem a capacidade cadastrada, escolha outra");
      if (houseGuests(pax) > max) throw new SupplierError(`Esta casa acomoda até ${max} hóspedes (adultos e crianças).`);
      const minNights = int(p.MinimumNightsStay);
      // preço do momento (e grava na tabela: busca e página da casa passam a mostrar este mesmo valor)
      const q = minNights > stay.nights ? null : await priceFor(id, stay.checkIn, stay.checkOut, houseGuests(pax), { fresh: true });
      if (!q) throw new SupplierError(mvhUnavailableReason(await busyNights(id), minNights, stay.checkIn, stay.checkOut));
      const lines = mvhQuoteLines(q, stay.nights);
      const canc = cancellationFor(stay.checkIn, freeCancelDays);
      return {
        supplierCode: MVH_CODE,
        category: "HOUSES",
        productId: id,
        optionId: "casa",
        title: titleOf(p),
        subtitle: `${subtitleOf(p)} · ${stay.nights} noite${stay.nights > 1 ? "s" : ""}`,
        location: locationOf(p) || null,
        imageUrl: p.MainImageURL?.trim() || null,
        serviceDate: stay.checkIn,
        serviceEndDate: stay.checkOut,
        expiresAt: expiresAtFor(stay.checkIn),
        currency: "USD",
        lines,
        pax,
        paxRules: housePaxRules(max),
        details: {
          propertyId: id,
          houseName: titleOf(p),
          nights: stay.nights,
          guests: houseGuests(pax),
          address: p.Address?.trim() || null,
          resort: communityOf(p),
          bedrooms: int(p.Bedrooms) || null,
          bathrooms: Number(p.Bathrooms) || null,
          maxOccupancy: max,
          grandTotal: dec(q.QuoteIncludingTax).toFixed(2),
          cancellation: canc.text,
          freeCancellationUntil: canc.until,
          nonRefundable: !canc.until,
          notes: feeNotes(q, p),
          manualBooking: true,
        },
        quoteRef: stableId(MVH_CODE, id, stay.checkIn, stay.checkOut, houseGuests(pax), dec(q.QuoteIncludingTax).toFixed(2)),
      };
    },

    async book(): Promise<BookingResult> {
      // A API da Master não recebe reservas. A emissão é manual (Painel Subrinho › pedido › "Registrar
      // reserva"): a equipe reserva com a Master e informa o localizador. Este erro só aparece se
      // alguém tentar a emissão automática.
      throw new SupplierError("A Master Vacation Home não recebe reservas pela API: reserve direto com a Master e registre o localizador no pedido");
    },
  };

  return adapter;
}

export function createMvhFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const cfg = mvhConfig(env);
  if (!cfg) return null;
  const days = Number(env.MASTER_VACATION_HOME_FREE_CANCEL_DAYS);
  return createMvhAdapter(cfg, { freeCancelDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : null });
}
