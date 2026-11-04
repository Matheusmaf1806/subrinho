/**
 * MAPRO (casas) — linhas de custo, destino "Orlando e arredores", fluxo completo do adaptador com
 * transporte falso no formato real da API (busca → detalhe → cotação → reserva → status → cancelamento).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bedsText, cancellationFor, createMaproAdapter, feeLabel, nextPagePath, quoteLines, unavailableReason, type MpQuote } from "@/server/suppliers/mapro/adapter";
import { maproConfig, type Transport } from "@/server/suppliers/mapro/client";
import { matchesHouseDestination, rankAmenities } from "@/server/suppliers/houses/common";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";
import { SupplierIntegrationError } from "@/server/suppliers/types";

const STAY = { checkIn: "2027-01-10", checkOut: "2027-01-15" };

const QUOTE: MpQuote = {
  currency: "USD",
  summary: { subtotal: "1875.04", tax_total: "199.13", discount_total: "0.00", grand_total: "2074.17" },
  rent: { base_amount: "858.00", tax_total: "107.25", total: "965.25" },
  services: [
    { name: "Cleaning Castles", base_amount: "700.00", tax_total: "87.50", total: "787.50" },
    { name: "Handyman", base_amount: "100.00", tax_total: "0.00", total: "100.00" },
    { name: "Linen 7 bedrooms", base_amount: "35.00", tax_total: "4.38", total: "39.38" },
    { name: "Processing Fee - Website", base_amount: "88.93", tax_total: "0.00", total: "88.93" },
    { name: "Processing Fee teste", base_amount: "93.11", tax_total: "0.00", total: "93.11" },
  ],
};

function house(id: string, o: { alias: string; city: string; lat: number; lon: number; max: number; bedrooms: number; total?: string }) {
  return {
    id,
    alias: o.alias,
    title: { en: `House ${o.alias}`, pt: `Casa ${o.alias}` },
    description: { en: "Beautiful vacation home near the parks." },
    bedrooms: o.bedrooms,
    bathrooms: 3.5,
    maxOccupancy: o.max,
    propertyType: "house",
    checkinTime: "16:00:00",
    checkoutTime: "10:00:00",
    address: { city: o.city, state: "FL", cityRegion: "Central Florida", fullAddress: `1 Main St, ${o.city}, FL`, latitude: o.lat, longitude: o.lon },
    amenities: ["amenity_private_pool", "amenity_game_room", "amenity_wireless_internet"],
    resort: { id: "R1", title: "Windsor Hills" },
    mainPhoto: { preview: `https://img.test/${id}-1220.jpg` },
    isActive: 1,
    quote: o.total ? { ...QUOTE, summary: { ...QUOTE.summary, grand_total: o.total } } : QUOTE,
  };
}

const H1 = house("01HOUSEORLANDO00000000001", { alias: "H01 101", city: "Kissimmee", lat: 28.33, lon: -81.58, max: 16, bedrooms: 7 });
const H2 = house("01HOUSEDAVENPORT000000002", { alias: "H02 102", city: "Davenport", lat: 28.2, lon: -81.6, max: 8, bedrooms: 4 });
const H3 = house("01HOUSEPORTLAND0000000003", { alias: "H03 103", city: "Portland", lat: 45.5, lon: -122.6, max: 10, bedrooms: 5 });

const DETAIL = {
  ...H1,
  quote: undefined,
  photos: [{ preview: "https://img.test/a-1220.jpg" }, { preview: "https://img.test/b-1220.jpg" }],
  roomsDetails: [
    { type: "bed", master: 1, private: 1, bedsDetails: [{ title: "King" }] },
    { type: "bed", master: 0, private: 0, bedsDetails: [{ title: "Bunk bed (twin/twin)" }, { title: "Bunk bed (twin/twin)" }] },
  ],
  LivingAreaSQFT: 3000,
  resort: { id: "R1", title: "Windsor Hills", description: { en_US: "Gated resort with water park." } },
};

const RESERVATION = {
  propertyId: H1.id,
  reservationId: "01KHER11D0PP9MQMBCY7SB2DYG",
  status: "Confirmed",
  referenceCode: "6529537",
  arrival: "2027-01-10 16:00:00",
  departure: "2027-01-15 10:00:00",
  isCanceled: false,
  channel: { id: "1865", name: "Website" },
  doorCode: "4821",
  gateCode: "",
  wifiName: "Castle",
  wifiPassword: "magic123",
  currency: "USD",
  amountTotal: "2070.00",
  guest: { guestFirstName: "Maria", guestLastName: "Silva" },
};

type Opts = { propertyIdBroken?: boolean; existing?: unknown[]; bump?: string; createStatus?: number; createTimeout?: boolean; busy?: boolean };

function fake(o: Opts = {}) {
  const calls: { method: string; path: string; body?: unknown; auth: string }[] = [];
  let created = false;
  const transport: Transport = async (req) => {
    const u = new URL(req.url);
    const body = req.body ? JSON.parse(req.body) : undefined;
    calls.push({ method: req.method, path: `${u.pathname}${u.search}`, body, auth: req.headers.Authorization });
    const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
    if (u.pathname === "/v1/whoami") return json({ status: 1, integration: "Website", customer_id: "C1", customer_name: "Orlando Homes LLC" });
    if (u.pathname === "/v1/quote") {
      if (u.searchParams.get("property_id")) {
        if (o.propertyIdBroken) return json({ status: 0, message: "internal server error, please try again later." }, 500);
        // casa ocupada: a cotação não traz a casa
        if (o.busy) return json({ error: "internal-error", message: "no matching properties" }, 400);
        const id = u.searchParams.get("property_id");
        const list = [H1, H2, H3].filter((h) => h.id === id).map((h) => (o.bump ? { ...h, quote: { ...h.quote, summary: { ...h.quote.summary, grand_total: o.bump } } } : h));
        return list.length ? json({ status: 1, quote: list, paginanation: { hasNextPage: false, nextCursor: null } }) : json({ error: "internal-error", message: "no matching properties" }, 400);
      }
      if (u.searchParams.get("query")) {
        const q = u.searchParams.get("query");
        return json({ status: 1, quote: [H1, H2, H3].filter((h) => h.alias === q), paginanation: { hasNextPage: false, nextCursor: null } });
      }
      // paginação por cursor: 1ª página H1+H2, 2ª página H3
      if (u.searchParams.get("cursor") === "c2") return json({ status: 1, quote: [H3], paginanation: { hasNextPage: false, nextCursor: null } });
      return json({ status: 1, quote: [H1, H2], paginanation: { hasNextPage: true, nextCursor: "c2" } });
    }
    if (u.pathname === `/v1/properties/${H1.id}`) return json({ status: 1, property: DETAIL });
    if (u.pathname === `/v1/properties/${H1.id}/calendars`) {
      const cal: Record<string, unknown> = {};
      for (let i = 0; i < 40; i++) {
        const d = new Date(Date.UTC(2026, 10, 10 + i)).toISOString().slice(0, 10);
        cal[d] = { rate: "198.00", minStayDays: d === "2026-12-01" ? 5 : 2, isAvailable: o.busy && d === "2026-11-21" ? 0 : 1 };
      }
      return json({ status: 1, calendars: cal });
    }
    if (u.pathname === "/v1/reservations" && req.method === "GET") return json({ status: 1, pagination: { hasNextPage: false }, reservations: o.existing ?? (created ? [RESERVATION] : []) });
    if (u.pathname === "/v1/reservations" && req.method === "POST") {
      if (o.createTimeout) {
        created = true;
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      if (o.createStatus) return json({ error: "internal-error", message: "Property not available for the selected dates." }, o.createStatus);
      created = true;
      return json({ status: 1, msg: "Reservation #6529537 booked successfully!", reservation_id: "6529537", reservation_ulid: RESERVATION.reservationId });
    }
    if (u.pathname === `/v1/reservations/${RESERVATION.reservationId}` && req.method === "GET") return json({ status: 1, reservation: RESERVATION });
    if (u.pathname === `/v1/reservations/${RESERVATION.reservationId}` && req.method === "DELETE") return json({ status: 1, msg: "Reservation #6529537 canceled!", reservation_id: "6529537", reservation_ulid: RESERVATION.reservationId });
    throw new Error(`rota inesperada ${req.method} ${req.url}`);
  };
  return { calls, transport };
}

const cfg = { token: "tok-test", baseUrl: "https://mapro.test" };
const quoteCalls = (f: ReturnType<typeof fake>) => f.calls.filter((c) => c.path.startsWith("/v1/quote")).length;
const ctx = { travelers: [{ name: "Maria da Silva", type: "ADULT" as const }], holder: { name: "Maria da Silva" }, contact: { email: "maria@cliente.com.br", phone: "(11) 98888-1111", state: "SP" } };
const item = (extra: Record<string, unknown> = {}) => ({ quoteRef: null, productId: H1.id, optionId: "casa", pax: { adults: 4, children: 2 }, serviceDate: STAY.checkIn, serviceEndDate: STAY.checkOut, maxCost: { currency: "USD" as const, amount: "2074.1700" }, ...extra });

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-11-04T12:00:00-03:00"), toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => clearMemoryCache());

describe("MAPRO — preço e textos", () => {
  it("custo = aluguel + taxas + impostos e soma exatamente o total da administradora", () => {
    const lines = quoteLines(QUOTE, 5);
    expect(lines.map((l) => l.label)).toEqual(["Aluguel da casa · 5 noites", "Taxa de limpeza", "Taxa de manutenção", "Roupa de cama e banho", "Taxa de processamento", "Impostos locais (Sales Tax e Tourist Tax)"]);
    expect(lines.find((l) => l.label === "Taxa de processamento")!.unitCost).toBe("182.04"); // duas taxas de processamento juntas
    expect(lines.reduce((s, l) => s + Number(l.unitCost) * l.quantity, 0).toFixed(2)).toBe("2074.17");
  });

  it("caução aparece com nome claro; total divergente vira uma linha com o total do fornecedor", () => {
    expect(feeLabel("Security deposit castles")).toBe("Caução (reembolsável pela administradora)");
    const odd = quoteLines({ ...QUOTE, summary: { ...QUOTE.summary, discount_total: "50.00", grand_total: "2024.17" } }, 5);
    expect(odd).toEqual([{ type: "STAY", label: "Estadia completa · 5 noites (aluguel, taxas e impostos)", unitCost: "2024.17", quantity: 1 }]);
  });

  it("“Orlando” inclui Kissimmee e Davenport (região dos parques) e não inclui outra cidade", () => {
    const k = { city: "Kissimmee", lat: 28.33, lon: -81.58 };
    expect(matchesHouseDestination("Orlando", k)).toBe(true);
    expect(matchesHouseDestination("Disney", { city: "Davenport", lat: 28.2, lon: -81.6 })).toBe(true);
    expect(matchesHouseDestination("Orlando, Flórida, Estados Unidos", k)).toBe(true);
    expect(matchesHouseDestination("Orlando", { city: "Portland", lat: 45.5, lon: -122.6 })).toBe(false);
    expect(matchesHouseDestination("Windsor", { city: "Kissimmee", resort: "Windsor Hills" })).toBe(true);
    expect(matchesHouseDestination("", { city: "Portland" })).toBe(true);
  });

  it("comodidades em português, camas e políticas", () => {
    expect(rankAmenities(["amenity_wireless_internet", "amenity_private_pool", "amenity_xyz"])).toEqual(["Piscina privativa", "Wi-Fi"]);
    expect(bedsText(DETAIL.roomsDetails)).toBe("Suíte master: King · Quarto 2: 2 Beliche");
    expect(cancellationFor("2027-01-10", null)).toEqual({ until: null, text: "Não reembolsável" });
    expect(cancellationFor("2027-01-10", 30)).toEqual({ until: "2026-12-11", text: "Cancelamento grátis até 11/12/2026" });
    expect(cancellationFor("2026-11-20", 30).until).toBeNull(); // prazo já passou
  });

  it("motivo da indisponibilidade pelo calendário", () => {
    const cal = { "2026-11-20": { minStayDays: 2, isAvailable: 1 }, "2026-11-21": { minStayDays: 2, isAvailable: 0 }, "2026-12-01": { minStayDays: 5, isAvailable: 1 }, "2026-12-02": { minStayDays: 5, isAvailable: 1 } };
    expect(unavailableReason(cal, "2026-11-20", "2026-11-22").reason).toBe("A casa já está reservada em 21/11/2026. Escolha outras datas.");
    expect(unavailableReason(cal, "2026-12-01", "2026-12-03").reason).toBe("Estadia mínima de 5 noites para check-in em 01/12/2026.");
  });

  it("credenciais: MAPRO_API_TOKEN (ou MAPRO_API_KEY) e URL padrão", () => {
    expect(maproConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(maproConfig({ MAPRO_API_KEY: " abc " } as unknown as NodeJS.ProcessEnv)).toEqual({ token: "abc", baseUrl: "https://api.mapro.io" });
    expect(maproConfig({ MAPRO_API_TOKEN: "x", MAPRO_API_URL: "https://sandbox.mapro.io/" } as unknown as NodeJS.ProcessEnv)!.baseUrl).toBe("https://sandbox.mapro.io");
  });
});

describe("MAPRO — fluxo do adaptador", () => {
  it("busca: segue o cursor, filtra destino e capacidade, e reaproveita o cache", async () => {
    const f = fake();
    const a = createMaproAdapter(cfg, { transport: f.transport });
    const list = await a.search({ destination: "Orlando", ...STAY, pax: { adults: 6, children: 3 } });
    expect(list.map((x) => x.productId)).toEqual([H1.id]); // H2 acomoda 8 (< 9 hóspedes); H3 é Portland
    expect(list[0]).toMatchObject({ title: "Casa H01 101", subtitle: "Casa · 7 quartos · 3½ banheiros · até 16 hóspedes", location: "Windsor Hills · Kissimmee, FL", currency: "USD", tags: ["Piscina privativa", "Sala de jogos"] });
    expect(list[0].house).toEqual({ bedrooms: 7, bathrooms: 3.5, maxGuests: 16, privatePool: true });
    expect(f.calls.map((c) => c.path)).toEqual([`/v1/quote?checkin=2027-01-10&checkout=2027-01-15`, `/v1/quote?checkin=2027-01-10&checkout=2027-01-15&cursor=c2`]);
    expect(f.calls[0].auth).toBe("Bearer tok-test");
    await a.search({ destination: "Kissimmee", ...STAY, pax: { adults: 2 } });
    expect(quoteCalls(f)).toBe(2); // mesmo período: cache
  });

  it("detalhe usa a cotação da busca (sem nova chamada) e mostra conteúdo em português", async () => {
    const f = fake();
    const a = createMaproAdapter(cfg, { transport: f.transport });
    await a.search({ destination: "Orlando", ...STAY, pax: { adults: 2 } });
    const d = await a.getProduct(H1.id, { ...STAY, pax: { adults: 2 } });
    expect(quoteCalls(f)).toBe(2);
    expect(d!.gallery).toEqual(["https://img.test/a-1220.jpg", "https://img.test/b-1220.jpg"]);
    expect(d!.description).toContain("Quartos e camas: Suíte master: King · Quarto 2: 2 Beliche.");
    expect(d!.description).toContain("Sobre o condomínio Windsor Hills: Gated resort with water park.");
    expect(d!.info).toContainEqual({ label: "Área", value: "279 m²" });
    expect(d!.options[0]).toMatchObject({ available: true, freeCancellationUntil: null, attributes: [{ label: "Cancelamento", value: "Não reembolsável" }] });
    expect(d!.options[0].notes).toContain("Check-in a partir das 16h · check-out até 10h");
  });

  it("casa ocupada nas datas: a página mostra o motivo (calendário)", async () => {
    const f = fake({ busy: true });
    const a = createMaproAdapter(cfg, { transport: f.transport });
    const d = await a.getProduct(H1.id, { checkIn: "2026-11-20", checkOut: "2026-11-23", pax: { adults: 2 } });
    expect(d!.options[0].available).toBe(false);
    expect(d!.options[0].notes).toEqual(["A casa já está reservada em 21/11/2026. Escolha outras datas."]);
  });

  it("cotação: consulta nova; se a busca por property_id falhar (500), usa o apelido da casa", async () => {
    const f = fake({ propertyIdBroken: true });
    const a = createMaproAdapter(cfg, { transport: f.transport, freeCancelDays: 30 });
    const q = await a.quote({ productId: H1.id, ...STAY, pax: { adults: 4, children: 2 } });
    expect(f.calls.filter((c) => c.path.startsWith("/v1/quote")).map((c) => c.path)).toEqual([
      `/v1/quote?checkin=2027-01-10&checkout=2027-01-15&property_id=${H1.id}`,
      `/v1/quote?checkin=2027-01-10&checkout=2027-01-15&query=H01+101`,
    ]);
    expect(q.lines.reduce((s, l) => s + Number(l.unitCost), 0).toFixed(2)).toBe("2074.17");
    expect(q.details).toMatchObject({ grandTotal: "2074.17", cancellation: "Cancelamento grátis até 11/12/2026", freeCancellationUntil: "2026-12-11", propertyManager: "Orlando Homes LLC", checkinTime: "16h" });
    await expect(a.quote({ productId: H1.id, ...STAY, pax: { adults: 15, children: 2 } })).rejects.toThrow(/acomoda até 16 hóspedes/);
  });

  it("reserva: nunca duplica (mesma casa, datas e canal já reservadas)", async () => {
    const f = fake({ existing: [RESERVATION] });
    const a = createMaproAdapter(cfg, { transport: f.transport });
    const r = await a.book(item(), ctx);
    expect(r).toMatchObject({ bookingRef: "6529537", status: "CONFIRMED", payload: { reservationUlid: RESERVATION.reservationId } });
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("procura a reserva em TODAS as páginas (administradora com muitas reservas no período)", async () => {
    const other = (n: number) => ({ ...RESERVATION, propertyId: `01OTHER${String(n).padStart(19, "0")}`, reservationId: `01RES${String(n).padStart(21, "0")}`, referenceCode: String(n) });
    const calls: string[] = [];
    const t: Transport = async (req) => {
      const u = new URL(req.url);
      calls.push(`${u.pathname}${u.search}`);
      if (u.pathname === "/v1/whoami") return { status: 200, body: JSON.stringify({ status: 1, integration: "Website", customer_id: "C1" }) };
      const page = u.searchParams.get("cursor");
      const body =
        page === "p3"
          ? { reservations: [other(201), RESERVATION], pagination: { hasNextPage: false, nextCursor: null } }
          : page === "p2"
            ? { reservations: [other(101)], pagination: { hasNextPage: true, nextCursor: "p3", links: { next: "/v1/reservations?from=2027-01-10&to=2027-01-15&cursor=p3&limit=100" } } }
            : { reservations: [other(1), other(2)], pagination: { hasNextPage: true, nextCursor: "p2" } };
      return { status: 200, body: JSON.stringify(body) };
    };
    const a = createMaproAdapter(cfg, { transport: t });
    expect((await a.findBooking!(item()))?.bookingRef).toBe("6529537");
    expect(calls.filter((c) => c.startsWith("/v1/reservations"))).toEqual([
      "/v1/reservations?from=2027-01-10&to=2027-01-15&limit=100",
      "/v1/reservations?from=2027-01-10&to=2027-01-15&limit=100&cursor=p2",
      "/v1/reservations?from=2027-01-10&to=2027-01-15&cursor=p3&limit=100",
    ]);
  });

  it("paginação: segue o link da API; cursor que não avança não repete casas", async () => {
    expect(nextPagePath("/v1/quote", { checkin: "a" }, { hasNextPage: true, nextCursor: "c", link: "https://api.mapro.io/v1/quote?checkin=a&cursor=c" })).toBe("/v1/quote?checkin=a&cursor=c");
    expect(nextPagePath("/v1/quote", { checkin: "a" }, { hasNextPage: true, nextCursor: "c" })).toBe("/v1/quote?checkin=a&cursor=c");
    expect(nextPagePath("/v1/quote", { checkin: "a" }, { hasNextPage: false, nextCursor: "c" })).toBeNull();
    let n = 0;
    const loop: Transport = async () => {
      n++;
      return { status: 200, body: JSON.stringify({ status: 1, quote: [H1, H2], paginanation: { hasNextPage: true, nextCursor: "same" } }) };
    };
    const a = createMaproAdapter(cfg, { transport: loop });
    const list = await a.search({ ...STAY, pax: { adults: 2 } });
    expect(list.map((x) => x.productId)).toEqual([H1.id, H2.id]);
    expect(n).toBe(2); // 2ª página só repetiu → para
  });

  it("reserva de outro canal nas mesmas datas não é confundida com a nossa", async () => {
    const f = fake({ existing: [{ ...RESERVATION, channel: { name: "VRBO - Homeaway" } }] });
    const a = createMaproAdapter(cfg, { transport: f.transport });
    expect(await a.findBooking!(item())).toBeNull();
  });

  it("não reserva se a administradora aumentou o preço", async () => {
    const f = fake({ bump: "2100.00" });
    const a = createMaproAdapter(cfg, { transport: f.transport });
    await expect(a.book(item(), ctx)).rejects.toThrow(/aumentou o preço \(USD 2100.00 > vendido 2074.17\)/);
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("reserva: envia o hóspede responsável e devolve localizador + dados de acesso", async () => {
    const f = fake();
    const a = createMaproAdapter(cfg, { transport: f.transport });
    const r = await a.book(item(), ctx);
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/v1/reservations");
    expect(post.body).toEqual({
      property_id: H1.id,
      checkin: "2027-01-10",
      checkout: "2027-01-15",
      coupon: "",
      guest: { first_name: "Maria da", last_name: "Silva", email: "maria@cliente.com.br", phone: "+5511988881111", state_code: "SP" },
    });
    expect(r).toMatchObject({ bookingRef: "6529537", status: "CONFIRMED", payload: { reservationUlid: RESERVATION.reservationId, amountTotal: "2070.00", quotedTotal: "2074.17" } });
    const v = await a.voucher!(r.bookingRef, r.payload);
    expect(v).toEqual({ bookedAndPayableBy: "Orlando Homes LLC", access: { doorCode: "4821", gateCode: null, wifiName: "Castle", wifiPassword: "magic123" } });
  });

  it("sem resposta na criação: procura a reserva antes de dar erro", async () => {
    const f = fake({ createTimeout: true });
    const a = createMaproAdapter(cfg, { transport: f.transport });
    const r = await a.book(item(), ctx);
    expect(r.bookingRef).toBe("6529537");
  });

  it("recusa da MAPRO vira mensagem clara; status e cancelamento usam o ULID gravado", async () => {
    const f = fake({ createStatus: 400 });
    const a = createMaproAdapter(cfg, { transport: f.transport });
    await expect(a.book(item(), ctx)).rejects.toThrow("A MAPRO recusou a reserva: Property not available for the selected dates.");
    const g = fake();
    const b = createMaproAdapter(cfg, { transport: g.transport });
    const stored = { reservationUlid: RESERVATION.reservationId };
    expect((await b.bookingStatus!("6529537", stored)).status).toBe("CONFIRMED");
    await expect(b.cancelBooking!("6529537", { simulate: true, stored })).rejects.toThrow(/não simula/);
    const c = await b.cancelBooking!("6529537", { simulate: false, stored });
    expect(c).toMatchObject({ status: "CANCELLED", reference: "6529537" });
    expect(g.calls.at(-1)).toMatchObject({ method: "DELETE", path: `/v1/reservations/${RESERVATION.reservationId}` });
  });

  it("em produção, o token da conta DEMO (casas fictícias) não vende nada", async () => {
    const demo: Transport = async (req) =>
      new URL(req.url).pathname === "/v1/whoami" ? { status: 200, body: JSON.stringify({ status: 1, integration: "Website", customer_id: "01DKZ03C0Z6WBTWQESG7AZY6V1", customer_name: "MAPRO LLC" }) } : { status: 500, body: "{}" };
    const a = createMaproAdapter(cfg, { transport: demo, blockDemo: true });
    await expect(a.search({ ...STAY, pax: { adults: 2 } })).rejects.toThrow(/conta DEMO/);
    await expect(a.book(item(), ctx)).rejects.toThrow(/conta DEMO/);
  });

  it("token sem administradora vinculada: erro técnico claro (para o painel)", async () => {
    const t: Transport = async () => ({ status: 401, body: JSON.stringify({ error: "invalid-auth", message: "invalid authentication token: not assigned to any account abc" }) });
    const a = createMaproAdapter(cfg, { transport: t });
    const e = await a.search({ ...STAY, pax: { adults: 2 } }).catch((x) => x);
    expect(e).toBeInstanceOf(SupplierIntegrationError);
    expect(e.message).toMatch(/token ainda não vinculado a nenhuma administradora/);
    expect(e.message).not.toContain("abc");
  });
});
