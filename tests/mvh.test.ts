/**
 * Master Vacation Home (casas) — API de parceiros v1 (api.mastervh.one). O preço da busca é o mesmo
 * da página da casa e do carrinho (sempre a cotação real daquela casa, nunca o `display_nightly_rate`),
 * o custo é o `total_amount` da Master e tudo passa pelas margens. A cotação é assíncrona
 * (pending → ready/failed) e a reserva vai para uma fila (correlation_id). Transporte falso no
 * formato da documentação da Master.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMvhAdapter,
  createMvhFromEnv,
  descriptionText,
  jobOutcome,
  mvhQuoteLines,
  mvhUnavailableReason,
  photoUrls,
  quoteState,
  truthy,
  type MvhPrice,
  type MvhUnitDetail,
} from "@/server/suppliers/mvh/adapter";
import { errorMessage, mvhConfig, mvhMissing, type Transport } from "@/server/suppliers/mvh/client";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";
import { applyDiscounts, priceItem } from "@/server/pricing/engine";
import { SupplierError, SupplierIntegrationError } from "@/server/suppliers/types";

const STAY = { checkIn: "2027-01-10", checkOut: "2027-01-17" };
const BASE = "https://mvh.test";
const KEY = "mvh_live_secret_123";
const NOW = new Date("2026-11-04T12:00:00-03:00");

const unit = (id: number, o: Partial<MvhUnitDetail> = {}): MvhUnitDetail => ({
  unit_id: id,
  name: `${id} Reading Trail`,
  community_name: "Windsor Hills",
  property_type: "house",
  region_id: 5,
  headline: `5 BD/ 4.5 BA/ Windsor Hills (${id})`,
  bedrooms: 5,
  bathrooms: 4.5,
  sleeps: 12,
  private_pool: 1,
  display_nightly_rate: 300,
  currency_code: "USD",
  photo_url: `https://cdn.test/${id}/main.jpg`,
  address1: `${id} Reading Trail`,
  city: "Kissimmee",
  state: "FL",
  zip: "34747",
  country: "US",
  latitude: 28.3349,
  longitude: -81.5934,
  description: "Casa com piscina.\r\n\r\n<b>5 quartos</b> perto da Disney.",
  amenities: [{ code: "amenity_game_room" }, { code: "amenity_wireless_internet" }, { code: "amenity_private_pool" }],
  photos: [
    { url: `https://cdn.test/${id}/2.jpg`, is_main: 0, display_order: 2 },
    { url: `https://cdn.test/${id}/1.jpg`, is_main: 1, display_order: 1 },
    { url: `https://cdn.test/${id}/2.jpg`, is_main: 0, display_order: 3 },
  ],
  pricing: { pool_heatable: 1, pool_heat_included: 0, pool_heat_daily_price: 35, minimum_nights_stay: 3, default_check_in_time: "16:00:00", default_check_out_time: "10:00:00", charge_security_deposit: 0 },
  ...o,
});

const H1 = unit(398103); // a boa
const H2 = unit(398104, { sleeps: 8, bedrooms: 4, display_nightly_rate: 200 }); // menor (e mais barata)
const H4 = unit(398106, { display_nightly_rate: 250 }); // ocupada: cotação "failed"
const MIAMI = unit(398107, { city: "Miami", region_id: 8, latitude: 25.77, longitude: -80.19, community_name: "501 First Residence" });
const H5 = unit(398108, { display_nightly_rate: 400 }); // a Master nunca termina de cotar
const UNITS = [H1, H2, H4, MIAMI, H5];

const BREAKDOWN = [
  { item: "Rental Rate", value: 2000 },
  { item: "Rental Rate Tax 1", value: 150 },
  { item: "Rental Rate Tax 2", value: 120 },
  { item: "Clean Fee", value: 250 },
  { item: "Clean Fee Tax 1", value: 18.75 },
  { item: "Clean Fee Tax 2", value: 15 },
  { item: "Damage Protection 5-Bed", value: 58 },
  { item: "Other Fees", value: 183.55 },
];
const TOTAL: Record<string, string> = { "398103": "2795.30", "398104": "1825.60", "398107": "1000.00" };
const scaled = (id: string) => (id === "398103" ? BREAKDOWN : [{ item: "Rental Rate", value: Number(TOTAL[id]) }]);

type Opts = { bump?: string; markup?: boolean; status?: (n: number) => Record<string, unknown>; postStatus?: number; slowQuote?: boolean };

function fake(o: Opts = {}) {
  const calls: { method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body?: unknown }[] = [];
  const seen = new Map<string, number>();
  let statusCalls = 0;
  const transport: Transport = async (req) => {
    const u = new URL(req.url);
    const query = Object.fromEntries(u.searchParams);
    calls.push({ method: req.method, path: u.pathname, query, headers: req.headers, body: req.body ? JSON.parse(req.body) : undefined });
    const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
    if (req.headers["X-API-Key"] !== KEY) return json({ detail: "Invalid API key" }, 401);
    const priced = (id: string) => {
      const total = o.bump && id === "398103" ? o.bump : TOTAL[id];
      const breakdown = o.bump && id === "398103" ? [{ item: "Rental Rate", value: Number(o.bump) }] : scaled(id);
      const amount = o.markup ? (Number(total) * 1.12).toFixed(2) : total;
      return { base_amount: Number(total), total_amount: Number(amount), currency: "USD", breakdown, ...(o.markup ? { markup: { type: "percent", value: 12, mode: "we_collect", basis: "total" } } : {}) };
    };
    // 1ª consulta de cada casa: "pending" (a Master calcula em segundo plano); a H5 nunca fica pronta
    const state = (id: string) => {
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      if (!UNITS.some((x) => String(x.unit_id) === id)) return { unit_id: Number(id), status: "not_found" };
      if (id === "398108" || n === 1 || (o.slowQuote && n < 4)) return { unit_id: Number(id), status: "pending", retry_after_seconds: 5 };
      if (id === "398106") return { unit_id: Number(id), status: "failed", error: 'CiiRUS 400: {"message": "Unit is not available for 7 nights. Valid stays: 0"}' };
      return { unit_id: Number(id), status: "ready", ...priced(id) };
    };
    if (u.pathname === "/api/v1/public/regions") return json({ count: 2, regions: [{ id: 5, name: "Orlando - Disney Area" }, { id: 8, name: "Miami" }] });
    const um = u.pathname.match(/^\/api\/v1\/public\/units\/(\d+)$/);
    if (um) {
      const x = UNITS.find((h) => String(h.unit_id) === um[1]);
      return x ? json(x) : json({ detail: "Unit not found" }, 404);
    }
    if (u.pathname === "/api/v1/public/units") return json({ count: UNITS.length, units: UNITS.map(({ unit_id, name, headline, photo_url }) => ({ unit_id, name, headline, photo_url })) });
    if (u.pathname === "/api/v1/public/availability" && query.unit_id) {
      const days = [];
      for (let d = new Date(`${query.from_date}T12:00:00Z`); d.toISOString().slice(0, 10) <= query.to_date; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        days.push({ cal_date: iso, is_available: query.unit_id === "398106" && iso >= "2027-01-12" && iso < "2027-01-15" ? 0 : 1, min_stay: 3 });
      }
      return json({ unit_id: Number(query.unit_id), count: days.length, days });
    }
    if (u.pathname === "/api/v1/public/availability") {
      // a Master filtra capacidade (guests) e pagina; aqui, 2 por página
      // como na Master: a busca não traz título (headline) nem foto
      const list = UNITS.filter((x) => Number(x.sleeps) >= Number(query.guests ?? 0))
        .sort((x, y) => (query.sort === "price_asc" ? Number(x.display_nightly_rate) - Number(y.display_nightly_rate) : 0))
        .map(({ description: _d, amenities: _a, photos: _p, pricing: _pr, headline: _h, photo_url: _f, ...rest }) => rest);
      const offset = Number(query.offset ?? 0);
      const page = list.slice(offset, offset + 2);
      return json({ from: query.from_date, to: query.to_date, total: list.length, count: page.length, limit: 2, offset, units: page });
    }
    if (u.pathname === "/api/v1/public/quotes/bulk") return json({ arrival: query.arrival, departure: query.departure, quotes: query.unit_ids.split(",").map(state) });
    if (u.pathname === "/api/v1/public/quotes") {
      const s = state(query.unit_id) as Record<string, unknown>;
      const { status, unit_id, retry_after_seconds, error, ...quote } = s;
      return json({ unit_id, arrival: query.arrival, departure: query.departure, status, quote: status === "ready" ? quote : null, ...(retry_after_seconds ? { retry_after_seconds } : {}), ...(error ? { error } : {}) });
    }
    if (u.pathname === "/api/v1/internal/reservations" && req.method === "POST") {
      if (o.postStatus) return json({ detail: "Key lacks write:bookings scope" }, o.postStatus);
      return json({ queued: true, outbox_id: 202301, correlation_id: "corr-1", status: "PENDING", idempotent_replay: false }, 202);
    }
    if (u.pathname === "/api/v1/internal/reservations/status/corr-1") {
      statusCalls++;
      const s = o.status?.(statusCalls) ?? (statusCalls < 2 ? { status: "SENDING" } : { status: "SENT", reservation: { id: 900000123, reference: "HMN34K5YF4", unit_id: 398103, type: "confirmed" } });
      return json({ correlation_id: "corr-1", outbox_id: 202301, action: "CREATE_RESERVATION", error: null, ...s });
    }
    if (u.pathname === "/api/v1/internal/reservations/900000123/cancel") return json({ queued: true, correlation_id: "corr-cancel", status: "PENDING" }, 202);
    if (u.pathname === "/api/v1/internal/reservations/status/corr-cancel") return json({ correlation_id: "corr-cancel", action: "CANCEL_RESERVATION", status: "SENT" });
    if (u.pathname === "/api/v1/partner/reservations")
      return json({ scope: "own_bookings", has_more: false, reservations: [{ reservation_id: 43611474, unit_id: 398103, booking_ref: "HMN34K5YF4", status: "confirmed", check_in: STAY.checkIn, check_out: STAY.checkOut }] });
    throw new Error(`rota inesperada ${req.method} ${req.url}`);
  };
  return { calls, transport };
}

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const cfg = { apiKey: KEY, baseUrl: BASE, sandbox: false };
/** Espera falsa: avança o relógio (os testes não esperam de verdade). */
const sleep = async (ms: number) => void vi.setSystemTime(Date.now() + ms);
const make = (f: ReturnType<typeof fake>, o: Parameters<typeof createMvhAdapter>[1] = {}) => createMvhAdapter(cfg, { transport: f.transport, sleep, ...o });
const quoteCalls = (f: ReturnType<typeof fake>) => f.calls.filter((c) => c.path.startsWith("/api/v1/public/quotes"));
const sum = (lines: { unitCost: string; quantity: number }[]) => lines.reduce((s, l) => s + Number(l.unitCost) * l.quantity, 0).toFixed(2);
const price = (total: string, breakdown: MvhPrice["breakdown"] = []): MvhPrice => ({ total, currency: "USD", breakdown });
const holder = { name: "Ana Souza", email: "ana@cliente.com" };

beforeAll(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  vi.setSystemTime(NOW);
  clearMemoryCache();
});

describe("Master Vacation Home — preço e textos", () => {
  it("custo = total da Master; linhas agrupadas (aluguel, limpeza, proteção, taxas, impostos) somam exatamente o total", () => {
    const s = quoteState({ status: "ready", quote: { total_amount: 2795.3, base_amount: 2795.3, currency: "USD", breakdown: BREAKDOWN } });
    expect(s.kind).toBe("ready");
    const lines = mvhQuoteLines((s as { price: MvhPrice }).price, 7);
    expect(lines).toEqual([
      { type: "NIGHT", label: "Aluguel da casa · 7 noites", unitCost: "2000.00", quantity: 1 },
      { type: "FEE", label: "Taxa de limpeza", unitCost: "250.00", quantity: 1 },
      { type: "FEE", label: "Proteção contra danos", unitCost: "58.00", quantity: 1 },
      { type: "FEE", label: "Taxas de serviço e reserva", unitCost: "183.55", quantity: 1 },
      { type: "TAX", label: "Impostos locais (Sales Tax e Tourist Tax)", unitCost: "303.75", quantity: 1 },
    ]);
    expect(sum(lines)).toBe("2795.30");
  });

  it("margem da Master na chave (total > detalhamento): a diferença entra nas taxas; sem aluguel ou se passar do total, linha única", () => {
    const withMarkup = mvhQuoteLines(price("3130.74", BREAKDOWN.map((b) => ({ item: b.item, value: b.value.toFixed(2) }))), 7);
    expect(withMarkup.find((l) => l.label === "Taxas de serviço e reserva")!.unitCost).toBe("518.99");
    expect(sum(withMarkup)).toBe("3130.74");
    const single = [{ type: "STAY", label: "Estadia completa · 3 noites (aluguel, taxas e impostos)", unitCost: "900.00", quantity: 1 }];
    expect(mvhQuoteLines(price("900.00"), 3)).toEqual(single);
    expect(mvhQuoteLines(price("900.00", [{ item: "Rental Rate", value: "950.00" }]), 3)).toEqual(single);
  });

  it("estado da cotação: pending / ready (uma casa ou bulk) / failed / not_found / total zero", () => {
    expect(quoteState({ status: "pending", retry_after_seconds: 5 })).toEqual({ kind: "pending", retryAfterMs: 5000 });
    expect(quoteState({ status: "ready", total_amount: 812.4, currency: "usd", breakdown: [] })).toEqual({ kind: "ready", price: price("812.40") });
    expect(quoteState({ status: "failed", error: "Unit is not available" })).toEqual({ kind: "unavailable", why: "Unit is not available" });
    expect(quoteState({ status: "not_found" })).toEqual({ kind: "unavailable", why: null });
    expect(quoteState({ status: "ready", quote: { total_amount: 0 } }).kind).toBe("unavailable");
    expect(quoteState(null).kind).toBe("unavailable");
  });

  it("cobrança: o total inteiro da Master (com limpeza e impostos) passa pelas margens e pelo parcelado", () => {
    const lines = mvhQuoteLines((quoteState({ status: "ready", quote: { total_amount: 2795.3, breakdown: BREAKDOWN } }) as { price: MvhPrice }).price, 7);
    const p = applyDiscounts(priceItem({ costCurrency: "USD", lines, fxRate: "5.00", subrinhoMarginPct: "5", affiliateMarginPct: "10", installmentFeePct: "9.68" }));
    expect(p.costForeign.toFixed(2)).toBe("2795.30");
    expect(p.costBrl.toFixed(2)).toBe("13976.50");
    expect(p.finalPix.gt(p.netSubrinho) && p.finalInstallment.gt(p.finalPix)).toBe(true);
  });

  it("calendário, fotos, descrição, fila e erros", () => {
    expect(truthy(1) && truthy("1") && truthy(true) && !truthy(0) && !truthy(undefined)).toBe(true);
    const days = [
      { cal_date: "2027-01-10", is_available: 1, min_stay: 3 },
      { cal_date: "2027-01-12", is_available: 0, min_stay: 0 },
    ];
    expect(mvhUnavailableReason(days, "2027-01-10", "2027-01-17")).toBe("A casa já está reservada em 12/01/2027. Escolha outras datas.");
    expect(mvhUnavailableReason([{ cal_date: "2027-01-10", is_available: 1, min_stay: 10 }], "2027-01-10", "2027-01-17")).toBe("Estadia mínima de 10 noites para chegada em 10/01/2027.");
    expect(mvhUnavailableReason(null, "2027-01-10", "2027-01-17")).toBe("A casa não está disponível para estas datas.");
    expect(photoUrls(H1.photos)).toEqual(["https://cdn.test/398103/1.jpg", "https://cdn.test/398103/2.jpg"]);
    expect(photoUrls([{ url: "ftp://x" }, { url: null }])).toEqual([]);
    expect(descriptionText("Linha 1<br>Linha 2\r\n\r\n\r\n<b>Fim</b>&nbsp;!")).toBe("Linha 1\nLinha 2\n\nFim !");
    expect([jobOutcome({ status: "SENT" }), jobOutcome({ status: "DEAD" }), jobOutcome({ status: "SENDING" }), jobOutcome(null)]).toEqual(["DONE", "FAILED", "QUEUED", "QUEUED"]);
    expect(errorMessage('{"detail":[{"msg":"Input should be a valid integer"}]}')).toBe("Input should be a valid integer");
    expect(errorMessage('{"detail":"Not authenticated"}')).toBe("Not authenticated");
  });

  it("credenciais: MASTER_VACATION_HOME_API_KEY (X-API-Key), endereço padrão, sandbox e reserva manual", () => {
    expect(mvhConfig(env({}))).toBeNull();
    expect(mvhMissing(env({}))).toEqual(["MASTER_VACATION_HOME_API_KEY"]);
    expect(mvhConfig(env({ MASTER_VACATION_HOME_API_KEY: " mvh_sandbox_abc " }))).toEqual({ apiKey: "mvh_sandbox_abc", baseUrl: "https://api.mastervh.one", sandbox: true });
    expect(mvhConfig(env({ MASTER_VACATION_HOME_API_KEY: "mvh_live_x", MASTER_VACATION_HOME_API_URL: "https://outra.api/" }))).toEqual({ apiKey: "mvh_live_x", baseUrl: "https://outra.api", sandbox: false });
    expect(createMvhFromEnv(env({ MASTER_VACATION_HOME_API_KEY: "mvh_live_x" }))!.manualIssue).toBe(false);
    expect(createMvhFromEnv(env({ MASTER_VACATION_HOME_API_KEY: "mvh_live_x", MASTER_VACATION_HOME_MANUAL_ISSUE: "1" }))!.manualIssue).toBe(true);
  });
});

describe("Master Vacation Home — busca, casa e cotação", () => {
  it("busca: todas as páginas da disponibilidade, destino filtrado aqui, preço = cotação real (espera as pendentes)", async () => {
    const f = fake();
    const a = make(f);
    const list = await a.search({ destination: "Orlando", ...STAY, pax: { adults: 6, children: 3 } });
    // H2 acomoda 8 (< 9 hóspedes, a Master já tira); H4 ocupada; Miami fora de Orlando; H5 não ficou pronta
    expect(list.map((x) => x.productId)).toEqual(["398103"]);
    expect(sum(list[0].lines)).toBe("2795.30"); // e não 300 × 7 do display_nightly_rate
    expect(list[0]).toMatchObject({
      title: "5 BD/ 4.5 BA/ Windsor Hills (398103)",
      subtitle: "Casa · 5 quartos · 4½ banheiros · até 12 hóspedes",
      location: "Windsor Hills · Kissimmee, FL",
      destination: "Kissimmee",
      currency: "USD",
      imageUrl: "https://cdn.test/398103/main.jpg",
    });
    expect(list[0].house).toEqual({ bedrooms: 5, bathrooms: 4.5, maxGuests: 12, privatePool: true });
    // disponibilidade com datas e hóspedes, paginada; chave só no cabeçalho
    const avail = f.calls.filter((c) => c.path === "/api/v1/public/availability");
    expect(avail.map((c) => c.query.offset)).toEqual(["0", "2"]);
    expect(avail[0].query).toMatchObject({ from_date: "2027-01-10", to_date: "2027-01-17", guests: "9", sort: "price_asc" });
    expect(f.calls.every((c) => !JSON.stringify(c.query).includes(KEY))).toBe(true);
    // cotações em lote, só das casas que passaram no filtro, as mais baratas (estimativa) primeiro
    const bulk = quoteCalls(f).filter((c) => c.path.endsWith("/bulk"));
    expect(bulk[0].query).toEqual({ unit_ids: "398106,398103,398108", arrival: "2027-01-10", departure: "2027-01-17" });
    expect(bulk[1].query.unit_ids).toBe("398106,398103,398108");
    expect(bulk.at(-1)!.query.unit_ids).toBe("398108"); // só a que continuou pendente
  });

  it("página da casa mostra EXATAMENTE o preço do card da busca (mesma cotação, sem chamar de novo)", async () => {
    const f = fake();
    const a = make(f);
    const pax = { adults: 2, children: 2 };
    const list = await a.search({ destination: "Kissimmee", ...STAY, pax });
    const card = list.find((x) => x.productId === "398103")!;
    const before = quoteCalls(f).length;
    const d = await a.getProduct("398103", { ...STAY, pax });
    expect(quoteCalls(f).length).toBe(before);
    expect(d!.lines).toEqual(card.lines);
    expect(d!.options[0]).toMatchObject({
      available: true,
      lines: card.lines,
      attributes: [{ label: "Cancelamento", value: "Não reembolsável" }],
      notes: [
        "Já inclui: taxa de limpeza, proteção contra danos, taxas de serviço e reserva, impostos locais.",
        "Aquecimento da piscina não incluído: opcional, US$ 35,00 por dia, contratado à parte com a administradora.",
      ],
    });
    expect(d!.gallery).toEqual(["https://cdn.test/398103/1.jpg", "https://cdn.test/398103/2.jpg"]);
    expect(d!.description).toBe("Casa com piscina.\n\n5 quartos perto da Disney.");
    expect(d!.highlights.slice(0, 3)).toEqual(["Piscina privativa", "Sala de jogos", "Wi-Fi"]);
    expect(d!.tags).toEqual(["Piscina privativa", "Sala de jogos"]);
    expect(d!.info).toEqual(
      expect.arrayContaining([
        { label: "Condomínio", value: "Windsor Hills" },
        { label: "Check-in", value: "a partir das 16h" },
        { label: "Check-out", value: "até 10h" },
        { label: "Estadia mínima", value: "3 noites" },
      ]),
    );
  });

  it("página aberta antes da busca: a busca reaproveita a mesma cotação daquela casa", async () => {
    const f = fake();
    const a = make(f);
    const pax = { adults: 4 };
    const d = await a.getProduct("398103", { ...STAY, pax });
    const list = await a.search({ destination: "Orlando", ...STAY, pax });
    expect(quoteCalls(f).filter((c) => c.query.unit_id === "398103" || c.query.unit_ids?.split(",").includes("398103"))).toHaveLength(2); // pending + ready, só na página
    expect(list.find((x) => x.productId === "398103")!.lines).toEqual(d!.lines);
  });

  it("carrinho/checkout: cotação nova; se a Master mudou o preço, busca e página passam a mostrar o valor do carrinho", async () => {
    const f = fake();
    const a = make(f, { freeCancelDays: 30 });
    const pax = { adults: 4, children: 2 };
    await a.search({ destination: "Orlando", ...STAY, pax });
    const bumped = fake({ bump: "2815.30" });
    const b = make(bumped, { freeCancelDays: 30 });
    const q = await b.quote({ productId: "398103", ...STAY, pax });
    expect(sum(q.lines)).toBe("2815.30");
    expect(q.details).toMatchObject({ grandTotal: "2815.30", cancellation: "Cancelamento grátis até 11/12/2026", freeCancellationUntil: "2026-12-11", guests: 6, checkinTime: "16h" });
    expect(q.details.manualBooking).toBeUndefined();
    const d = await b.getProduct("398103", { ...STAY, pax });
    expect(sum(d!.lines)).toBe("2815.30");
    const list = await b.search({ destination: "Orlando", ...STAY, pax });
    expect(sum(list.find((x) => x.productId === "398103")!.lines)).toBe("2815.30");
  });

  it("margem configurada na chave da Master: o custo é o total_amount (com a margem dela)", async () => {
    const a = make(fake({ markup: true }));
    const q = await a.quote({ productId: "398103", ...STAY, pax: { adults: 2, children: 0 } });
    expect(sum(q.lines)).toBe("3130.74");
  });

  it("cotação: capacidade, casa ocupada (motivo pelo calendário), casa inexistente e Master ainda calculando", async () => {
    const f = fake();
    const a = make(f);
    await expect(a.quote({ productId: "398103", ...STAY, pax: { adults: 10, children: 3 } })).rejects.toThrow(/acomoda até 12 hóspedes/);
    await expect(a.quote({ productId: "398106", ...STAY, pax: { adults: 2, children: 0 } })).rejects.toThrow("A casa já está reservada em 12/01/2027. Escolha outras datas.");
    const d = await a.getProduct("398106", { ...STAY, pax: { adults: 2 } });
    expect(d!.options[0]).toMatchObject({ available: false, notes: ["A casa já está reservada em 12/01/2027. Escolha outras datas."] });
    expect(await a.getProduct("999999", { ...STAY, pax: { adults: 2 } })).toBeNull();
    expect(await a.getProduct("abc", { ...STAY, pax: { adults: 2 } })).toBeNull();
    const slow = make(fake({ slowQuote: true }), { quoteWaitMs: 6000 });
    await expect(slow.quote({ productId: "398103", ...STAY, pax: { adults: 2, children: 0 } })).rejects.toThrow(/ainda está calculando/);
  });

  it("limite de requisições (429): respeita o Retry-After sem chamar a Master de novo", async () => {
    let calls = 0;
    const transport: Transport = async () => {
      calls++;
      return { status: 429, body: '{"detail":"Rate limit exceeded"}', retryAfter: "60" };
    };
    const a = createMvhAdapter({ ...cfg, apiKey: "mvh_rate_limited" }, { transport, sleep });
    await expect(a.search({ destination: "Orlando", ...STAY, pax: { adults: 2, children: 0 } })).rejects.toThrow(/limite de requisições/);
    const n = calls;
    await expect(a.quote({ productId: "398103", ...STAY, pax: { adults: 2, children: 0 } })).rejects.toThrow(/limite de requisições/);
    expect(calls).toBe(n);
    vi.setSystemTime(Date.now() + 61_000);
    await a.quote({ productId: "398103", ...STAY, pax: { adults: 2, children: 0 } }).catch(() => null);
    expect(calls).toBeGreaterThan(n);
  });

  it("chave inválida: erro técnico claro (sem a chave na mensagem), não “nenhuma casa”", async () => {
    const a = createMvhAdapter({ ...cfg, apiKey: "errada" }, { transport: fake().transport, sleep });
    const err = await a.search({ destination: "Orlando", ...STAY, pax: { adults: 2 } }).catch((e) => e);
    expect(err).toBeInstanceOf(SupplierIntegrationError);
    expect(err.message).toMatch(/chave da API inválida/);
    expect(err.message).not.toContain("errada");
  });
});

describe("Master Vacation Home — reserva", () => {
  const item = (o: Record<string, unknown> = {}) => ({
    quoteRef: null,
    productId: "398103",
    optionId: "casa",
    pax: { adults: 4, children: 2 },
    serviceDate: STAY.checkIn,
    serviceEndDate: STAY.checkOut,
    reference: "SUB1042-1",
    maxCost: { currency: "USD" as const, amount: "2795.30" },
    ...o,
  });

  it("reserva pela API: cotação nova, POST com Idempotency-Key = nossa referência, acompanha a fila até confirmar", async () => {
    const f = fake();
    const a = make(f);
    expect(a.manualIssue).toBe(false);
    const r = await a.book(item(), { travelers: [{ name: "Ana Souza" }], holder, contact: { email: "ana@cliente.com" }, remark: "Berço" });
    expect(r).toMatchObject({ bookingRef: "HMN34K5YF4", status: "CONFIRMED", payload: { reservationId: "900000123", correlationId: "corr-1", quotedTotal: "2795.30", supplierStatus: "SENT", idempotencyKey: "SUB1042-1" } });
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(post.headers["Idempotency-Key"]).toBe("SUB1042-1");
    expect(post.body).toEqual({ unit_id: 398103, arrival: "2027-01-10", departure: "2027-01-17", adults: 4, children: 2, guest_name: "Ana Souza", guest_email: "ana@cliente.com", notes: "Subrinho SUB1042-1 · Pedidos do hóspede: Berço" });
  });

  it("nunca reserva acima do custo vendido nem sem e-mail do hóspede", async () => {
    const f = fake({ bump: "2900.00" });
    const a = make(f);
    await expect(a.book(item(), { travelers: [], holder })).rejects.toThrow(/aumentou o preço/);
    await expect(make(fake()).book(item(), { travelers: [], holder: { name: "Ana Souza" } })).rejects.toThrow(/e-mail do hóspede/);
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("fila demorada: “aguardando confirmação” com o correlation_id; o status depois traz o localizador", async () => {
    let confirmed = false;
    const f = fake({ status: () => (confirmed ? { status: "SENT", reservation: { id: 900000123, reference: "HMN34K5YF4" } } : { status: "PENDING" }) });
    const a = make(f, { bookingWaitMs: 7000 });
    const r = await a.book(item(), { travelers: [], holder });
    expect(r).toMatchObject({ bookingRef: "corr-1", status: "PENDING", payload: { correlationId: "corr-1" } });
    confirmed = true;
    const s = await a.bookingStatus!("corr-1", r.payload);
    expect(s).toMatchObject({ bookingRef: "HMN34K5YF4", status: "CONFIRMED", payload: { reservationId: "900000123" } });
  });

  it("Master recusou na fila → erro (falha na emissão); nova tentativa usa outra Idempotency-Key", async () => {
    const f = fake({ status: () => ({ status: "FAILED", error: "Unit not available" }) });
    const a = make(f);
    await expect(a.book(item(), { travelers: [], holder })).rejects.toThrow("A Master recusou a reserva: Unit not available");
    await a.book(item(), { travelers: [], holder, retry: true }).catch(() => null);
    const keys = f.calls.filter((c) => c.method === "POST").map((c) => c.headers["Idempotency-Key"]);
    expect(keys[0]).toBe("SUB1042-1");
    expect(keys[1]).toMatch(/^SUB1042-1-/);
  });

  it("chave sem write:bookings → erro técnico explicando; reserva manual por variável; sandbox bloqueada em produção", async () => {
    const err = await make(fake({ postStatus: 403 }))
      .book(item(), { travelers: [], holder })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SupplierIntegrationError);
    expect(err.message).toMatch(/write:bookings/);
    const manual = make(fake(), { manualIssue: true });
    expect(manual.manualIssue).toBe(true);
    await expect(manual.book(item(), { travelers: [], holder })).rejects.toThrow(/reserva manual/);
    const sandbox = createMvhAdapter({ ...cfg, sandbox: true }, { transport: fake().transport, sleep, blockSandboxBooking: true });
    const e2 = await sandbox.book(item(), { travelers: [], holder }).catch((e) => e);
    expect(e2).toBeInstanceOf(SupplierError);
    expect(e2.message).toMatch(/SANDBOX/);
  });

  it("procura a reserva pela casa e datas; cancelamento em fila; sem simulação de multa", async () => {
    const f = fake();
    const a = make(f);
    expect(await a.findBooking!(item())).toMatchObject({ bookingRef: "HMN34K5YF4", status: "CONFIRMED", payload: { reservationId: "43611474" } });
    expect(await a.findBooking!(item({ serviceDate: "2027-02-01" }))).toBeNull();
    await expect(a.cancelBooking!("HMN34K5YF4", { simulate: true, stored: { reservationId: "900000123" } })).rejects.toThrow(/não simula/);
    const c = await a.cancelBooking!("HMN34K5YF4", { simulate: false, stored: { reservationId: "900000123" } });
    expect(c).toMatchObject({ status: "CANCELLED", penalty: null, payload: { cancelCorrelationId: "corr-cancel", cancelStatus: "SENT" } });
    expect(f.calls.find((x) => x.path.endsWith("/cancel"))!.headers["Idempotency-Key"]).toBe("cancel-900000123");
    await expect(a.cancelBooking!("corr-1", { simulate: false, stored: {} })).rejects.toThrow(/sem o id da Master/);
  });
});
