/**
 * Master Vacation Home (casas) — o preço da busca é o mesmo da página da casa e do carrinho (sempre a
 * cotação daquela casa, nunca o valor tabelado da listagem), o custo é o total cobrado pela Master
 * (aluguel + limpeza + serviço + impostos) e tudo passa pelas margens. Transporte falso no formato
 * das rotas `api/v2` da Master (mesmas da integração do airnext).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coordsOf,
  createMvhAdapter,
  descriptionText,
  icalBusyNights,
  imageUrls,
  mvhAmenities,
  mvhQuoteLines,
  mvhUnavailableReason,
  priceOfQuote,
  truthy,
  type MvhProperty,
  type MvhQuote,
} from "@/server/suppliers/mvh/adapter";
import { mvhConfig, mvhMissing, type Transport } from "@/server/suppliers/mvh/client";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";
import { applyDiscounts, priceItem } from "@/server/pricing/engine";
import { SupplierIntegrationError } from "@/server/suppliers/types";

const STAY = { checkIn: "2027-01-10", checkOut: "2027-01-17" };
const BASE = "https://mvh.test/api/v2";

const prop = (id: number, o: Partial<MvhProperty> = {}): MvhProperty => ({
  PropertyID: id,
  WebsitePropertyName: `Windsor Hills ${id}`,
  Community: "Windsor Hills",
  PropertyType: "House",
  Bedrooms: "5",
  Bathrooms: "4.5",
  Sleeps: "12",
  MinimumNightsStay: "3",
  MainImageURL: `https://cdn.test/${id}/main.jpg`,
  XCO: "28.3349",
  YCO: "-81.5934",
  HasPool: "True",
  GamesRoom: true,
  WiFi: "1",
  AirCon: "true",
  CommunalPool: "true",
  HasSpa: "false",
  ...o,
});

const H1 = prop(398103);
const H2 = prop(398104, { Sleeps: "8", Bedrooms: 4 }); // menor
const H3 = prop(398105, { MinimumNightsStay: 10 }); // estadia mínima maior que a busca
const H4 = prop(398106); // ocupada: /quote/{id} devolve error
const PORTLAND = prop(398107, { XCO: "45.52", YCO: "-122.68" });

/** Cotação REAL de cada casa (o que vale). */
const REAL: Record<string, MvhQuote> = {
  "398103": { QuoteBaseRate: "2100.00", discount_amount: "100.00", cleaning: "250.00", service: "45.00", taxes: "300.30", QuoteExcludingTax: "2395.00", QuoteIncludingTax: "2595.30" },
  "398104": { QuoteBaseRate: "1400.00", discount_amount: "0", cleaning: "200.00", service: "30.00", taxes: "195.60", QuoteExcludingTax: "1630.00", QuoteIncludingTax: "1825.60" },
  "398105": { QuoteBaseRate: "2100.00", cleaning: "250", QuoteIncludingTax: "2600.00" },
  "398106": { error: true, message: "Property not available" },
  "398107": { QuoteBaseRate: "900.00", QuoteIncludingTax: "1000.00" },
};
/** Listagem: o MESMO valor tabelado para casas diferentes (o erro de preço busca × página do airnext). */
const TIER = { QuoteBaseRate: "12495.91", QuoteIncludingTax: "13999.00", cleaning: "0", service: "0", taxes: "0" };

type Opts = { bump?: string; down?: boolean; flaky?: string };

function fake(o: Opts = {}) {
  const calls: { path: string; query: Record<string, string> }[] = [];
  let flakyLeft = 1;
  const transport: Transport = async (req) => {
    const u = new URL(req.url);
    const query = Object.fromEntries(u.searchParams);
    calls.push({ path: u.pathname, query });
    const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
    if (o.down) return { status: 404, body: "<!DOCTYPE html><html><title>404: This page could not be found.</title></html>" };
    if (u.pathname === "/api/v2/getproperties") return json([H1, H2, H3, H4, PORTLAND]);
    if (u.pathname === "/api/v2/quote") return json([H1, H2, H3, H4, PORTLAND].map((h) => ({ PropertyID: h.PropertyID, WebsitePropertyName: h.WebsitePropertyName, ...TIER })));
    const m = u.pathname.match(/^\/api\/v2\/quote\/(\d+)$/);
    if (m) {
      if (o.flaky === m[1] && flakyLeft-- > 0) return { status: 500, body: "Internal Server Error" };
      const q = REAL[m[1]];
      if (o.bump && m[1] === "398103") return json({ ...q, taxes: "320.30", QuoteIncludingTax: o.bump });
      return json(q ?? { error: true });
    }
    if (u.pathname === "/api/v2/getdescription/398103") return json({ GetDescriptionsPlainTextResult: "Casa com piscina.\r\n\r\n<b>5 quartos</b> perto da Disney." });
    if (u.pathname === "/api/v2/getimages/398103") return json(["https://cdn.test/398103/1.jpg", "https://cdn.test/398103/2.jpg", "https://cdn.test/398103/1.jpg"]);
    if (u.pathname.startsWith("/api/v2/getdescription/") || u.pathname.startsWith("/api/v2/getimages/")) return json([]);
    if (u.host === "ical.test") {
      // só a 398106 tem noites ocupadas na estadia buscada
      const event = u.pathname === "/398106/airbnb/ical.ics" ? "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270112\r\nDTEND;VALUE=DATE:20270115\r\nEND:VEVENT\r\n" : "";
      return { status: 200, body: `BEGIN:VCALENDAR\r\nPRODID: Ciirus Property Manager\r\n${event}END:VCALENDAR\r\n` };
    }
    throw new Error(`rota inesperada ${req.url}`);
  };
  return { calls, transport };
}

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const cfg = { uid: "vpo-test", baseUrl: BASE, icalUrl: "https://ical.test" };
const houseQuotes = (f: ReturnType<typeof fake>) => f.calls.filter((c) => /^\/api\/v2\/quote\/\d+$/.test(c.path));
const sum = (lines: { unitCost: string; quantity: number }[]) => lines.reduce((s, l) => s + Number(l.unitCost) * l.quantity, 0).toFixed(2);

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-11-04T12:00:00-03:00"), toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => clearMemoryCache());

describe("Master Vacation Home — preço e textos", () => {
  it("custo = aluguel − desconto + limpeza + serviço + impostos e soma exatamente o total da Master", () => {
    const lines = mvhQuoteLines(priceOfQuote(REAL["398103"])!, 7);
    expect(lines).toEqual([
      { type: "NIGHT", label: "Aluguel da casa · 7 noites", unitCost: "2000.00", quantity: 1 },
      { type: "FEE", label: "Taxa de limpeza", unitCost: "250.00", quantity: 1 },
      { type: "FEE", label: "Taxa de serviço", unitCost: "45.00", quantity: 1 },
      { type: "TAX", label: "Impostos locais (Sales Tax e Tourist Tax)", unitCost: "300.30", quantity: 1 },
    ]);
    expect(sum(lines)).toBe("2595.30");
  });

  it("total que não fecha com o detalhamento vira uma linha só com o total da Master", () => {
    const lines = mvhQuoteLines(priceOfQuote({ QuoteBaseRate: "2000", cleaning: "250", QuoteIncludingTax: "2400.00" })!, 3);
    expect(lines).toEqual([{ type: "STAY", label: "Estadia completa · 3 noites (aluguel, taxas e impostos)", unitCost: "2400.00", quantity: 1 }]);
  });

  it("cotação com erro ou total zero = indisponível", () => {
    expect(priceOfQuote({ error: true })).toBeNull();
    expect(priceOfQuote({ QuoteIncludingTax: "0" })).toBeNull();
    expect(priceOfQuote(null)).toBeNull();
  });

  it("cobrança: o total inteiro da Master (com limpeza e impostos) passa pelas margens e pelo parcelado", () => {
    // no airnext a margem incidia só no aluguel e limpeza/serviço/impostos iam "por fora"
    const lines = mvhQuoteLines(priceOfQuote(REAL["398103"])!, 7);
    const p = applyDiscounts(priceItem({ costCurrency: "USD", lines, fxRate: "5.00", subrinhoMarginPct: "5", affiliateMarginPct: "10", installmentFeePct: "9.68" }));
    expect(p.costForeign.toFixed(2)).toBe("2595.30");
    expect(p.costBrl.toFixed(2)).toBe("12976.50");
    expect(p.netSubrinho.toFixed(2)).toBe("13659.47"); // 12976,50 / 0,95
    expect(p.finalPix.toFixed(2)).toBe("15177.19"); // / 0,90
    expect(p.finalInstallment.toFixed(2)).toBe("16803.80"); // / (1 − 9,68%)
  });

  it("comodidades, coordenadas, calendário, fotos e descrição", () => {
    expect(truthy("True") && truthy(1) && truthy("yes") && !truthy("false") && !truthy(undefined)).toBe(true);
    expect(mvhAmenities(H1)).toEqual(["Piscina privativa", "Sala de jogos", "Piscina do condomínio", "Wi-Fi", "Ar-condicionado"]);
    expect(coordsOf(H1)).toEqual({ lat: 28.3349, lon: -81.5934 });
    expect(coordsOf({ XCO: "-81.5934", YCO: "28.3349" })).toEqual({ lat: 28.3349, lon: -81.5934 });
    expect(coordsOf({ XCO: "0", YCO: "0" })).toBeNull();
    const busy = icalBusyNights("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270112\r\nDTEND;VALUE=DATE:20270115\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20270120T160000Z\r\nDTEND:20270122T100000Z\r\nEND:VEVENT");
    expect([...busy]).toEqual(["2027-01-12", "2027-01-13", "2027-01-14", "2027-01-20", "2027-01-21"]);
    expect(mvhUnavailableReason(busy, 3, "2027-01-10", "2027-01-17")).toBe("A casa já está reservada em 12/01/2027. Escolha outras datas.");
    expect(mvhUnavailableReason(new Set(), 10, "2027-01-10", "2027-01-17")).toBe("Estadia mínima de 10 noites nesta casa.");
    expect(imageUrls(["https://a/1.jpg", { URL: "https://a/2.jpg" }, "ftp://x", null])).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(descriptionText({ GetDescriptionsPlainTextResult: "Linha 1<br>Linha 2\r\n\r\n\r\n<b>Fim</b>&nbsp;!" })).toBe("Linha 1\nLinha 2\n\nFim !");
  });

  it("credenciais: MASTER_VACATION_HOME_API_KEY (uid) e endereços padrão, configuráveis", () => {
    expect(mvhConfig(env({}))).toBeNull();
    expect(mvhMissing(env({}))).toEqual(["MASTER_VACATION_HOME_API_KEY"]);
    expect(mvhConfig(env({ MASTER_VACATION_HOME_API_KEY: " vpo-x " }))).toEqual({ uid: "vpo-x", baseUrl: "https://mastervacationhomes.com/api/v2", icalUrl: "https://mastervh.com" });
    expect(mvhConfig(env({ MASTER_VACATION_HOME_API_KEY: "vpo-x", MASTER_VACATION_HOME_API_URL: "https://nova.api/v3/" }))?.baseUrl).toBe("https://nova.api/v3");
  });
});

describe("Master Vacation Home — fluxo do adaptador", () => {
  it("busca: preço de cada casa pela cotação dela (nunca o valor tabelado da listagem), com filtros", async () => {
    const f = fake();
    const a = createMvhAdapter(cfg, { transport: f.transport });
    const list = await a.search({ destination: "Orlando", ...STAY, pax: { adults: 6, children: 3 } });
    // H2 acomoda 8 (< 9 hóspedes); H3 exige 10 noites; H4 ocupada; Portland fora de Orlando
    expect(list.map((x) => x.productId)).toEqual(["398103"]);
    expect(sum(list[0].lines)).toBe("2595.30"); // e não 13999.00 da listagem
    expect(list[0]).toMatchObject({ title: "Windsor Hills 398103", subtitle: "Casa · 5 quartos · 4½ banheiros · até 12 hóspedes", location: "Windsor Hills · Orlando, FL", currency: "USD", tags: ["Piscina privativa", "Sala de jogos", "Clube do condomínio"] });
    expect(list[0].house).toEqual({ bedrooms: 5, bathrooms: 4.5, maxGuests: 12, privatePool: true });
    // só as casas que passaram nos filtros são cotadas, com datas + hóspedes; o uid vai só nas cotações
    expect(houseQuotes(f).map((c) => c.path)).toEqual(["/api/v2/quote/398103", "/api/v2/quote/398106"]);
    expect(houseQuotes(f)[0].query).toEqual({ uid: "vpo-test", ArriveDate: "2027-01-10", DepartDate: "2027-01-17", Guests: "9" });
    expect(f.calls.find((c) => c.path === "/api/v2/getproperties")!.query).toEqual({});
  });

  it("página da casa mostra EXATAMENTE o preço do card da busca (mesma cotação, sem chamar de novo)", async () => {
    const f = fake();
    const a = createMvhAdapter(cfg, { transport: f.transport });
    const pax = { adults: 2, children: 2 };
    const list = await a.search({ destination: "Kissimmee", ...STAY, pax });
    const card = list.find((x) => x.productId === "398103")!;
    const before = houseQuotes(f).length;
    const d = await a.getProduct("398103", { ...STAY, pax });
    expect(houseQuotes(f).length).toBe(before);
    expect(d!.lines).toEqual(card.lines);
    expect(d!.options[0].lines).toEqual(card.lines);
    expect(d!.options[0]).toMatchObject({ available: true, attributes: [{ label: "Cancelamento", value: "Não reembolsável" }], notes: ["Já inclui: taxa de limpeza, taxa de serviço, impostos locais.", "Estadia mínima de 3 noites."] });
    expect(d!.gallery).toEqual(["https://cdn.test/398103/1.jpg", "https://cdn.test/398103/2.jpg"]);
    expect(d!.description).toBe("Casa com piscina.\n\n5 quartos perto da Disney.");
    expect(d!.info).toContainEqual({ label: "Condomínio", value: "Windsor Hills" });
  });

  it("página aberta antes da busca: a busca reaproveita a mesma cotação daquela casa", async () => {
    const f = fake();
    const a = createMvhAdapter(cfg, { transport: f.transport });
    const pax = { adults: 4 };
    const d = await a.getProduct("398103", { ...STAY, pax });
    const list = await a.search({ destination: "Orlando", ...STAY, pax });
    expect(houseQuotes(f).filter((c) => c.path === "/api/v2/quote/398103")).toHaveLength(1);
    expect(list.find((x) => x.productId === "398103")!.lines).toEqual(d!.lines);
  });

  it("carrinho/checkout: cotação nova; se a Master mudou o preço, busca e página passam a mostrar o mesmo valor do carrinho", async () => {
    const f = fake();
    const a = createMvhAdapter(cfg, { transport: f.transport, freeCancelDays: 30 });
    const pax = { adults: 4, children: 2 };
    await a.search({ destination: "Orlando", ...STAY, pax });
    const bumped = fake({ bump: "2615.30" });
    const b = createMvhAdapter(cfg, { transport: bumped.transport, freeCancelDays: 30 });
    const q = await b.quote({ productId: "398103", ...STAY, pax });
    expect(houseQuotes(bumped)).toHaveLength(1); // sempre nova no carrinho
    expect(sum(q.lines)).toBe("2615.30");
    expect(q.details).toMatchObject({ grandTotal: "2615.30", cancellation: "Cancelamento grátis até 11/12/2026", freeCancellationUntil: "2026-12-11", manualBooking: true, guests: 6 });
    const d = await b.getProduct("398103", { ...STAY, pax });
    expect(sum(d!.lines)).toBe("2615.30");
    const list = await b.search({ destination: "Orlando", ...STAY, pax });
    expect(sum(list.find((x) => x.productId === "398103")!.lines)).toBe("2615.30");
  });

  it("cotação: capacidade, estadia mínima e casa ocupada (motivo pelo calendário)", async () => {
    const f = fake();
    const a = createMvhAdapter(cfg, { transport: f.transport });
    await expect(a.quote({ productId: "398103", ...STAY, pax: { adults: 10, children: 3 } })).rejects.toThrow(/acomoda até 12 hóspedes/);
    await expect(a.quote({ productId: "398105", ...STAY, pax: { adults: 2, children: 0 } })).rejects.toThrow("Estadia mínima de 10 noites nesta casa.");
    await expect(a.quote({ productId: "398106", ...STAY, pax: { adults: 2, children: 0 } })).rejects.toThrow("A casa já está reservada em 12/01/2027. Escolha outras datas.");
    const d = await a.getProduct("398106", { ...STAY, pax: { adults: 2 } });
    expect(d!.options[0]).toMatchObject({ available: false, notes: ["A casa já está reservada em 12/01/2027. Escolha outras datas."] });
    expect(await a.getProduct("999999", { ...STAY, pax: { adults: 2 } })).toBeNull();
  });

  it("falha temporária numa cotação: a casa fica fora agora e é cotada de novo na próxima busca", async () => {
    const f = fake({ flaky: "398103" });
    const a = createMvhAdapter(cfg, { transport: f.transport });
    const pax = { adults: 2 };
    expect((await a.search({ destination: "Orlando", ...STAY, pax })).map((x) => x.productId)).toEqual(["398104"]);
    expect((await a.search({ destination: "Orlando", ...STAY, pax })).map((x) => x.productId).sort()).toEqual(["398103", "398104"]);
    // a 2ª busca só cotou a que tinha falhado (as outras vieram da tabela)
    expect(houseQuotes(f).map((c) => c.path)).toEqual(["/api/v2/quote/398103", "/api/v2/quote/398104", "/api/v2/quote/398106", "/api/v2/quote/398103"]);
  });

  it("API fora do ar / endereço antigo (404 em HTML): erro técnico claro, não “nenhuma casa”", async () => {
    const f = fake({ down: true });
    const a = createMvhAdapter(cfg, { transport: f.transport });
    const err = await a.search({ destination: "Orlando", ...STAY, pax: { adults: 2 } }).catch((e) => e);
    expect(err).toBeInstanceOf(SupplierIntegrationError);
    expect(err.message).toMatch(/rota não encontrada, confira MASTER_VACATION_HOME_API_URL/);
    expect(err.message).not.toContain("vpo-test");
  });

  it("reserva: manual (a API não reserva), nunca emissão automática", async () => {
    const a = createMvhAdapter(cfg, { transport: fake().transport });
    expect(a.manualIssue).toBe(true);
    await expect(a.book({ quoteRef: null, productId: "398103", optionId: "casa", pax: { adults: 2, children: 0 } }, { travelers: [] })).rejects.toThrow(/não recebe reservas pela API/);
  });
});
