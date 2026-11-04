/**
 * GGT | Best Buy (GoGlobal) — adaptador contra respostas REAIS gravadas da API (tests/fixtures/ggt),
 * com um fetch falso que imita o SOAP. Nenhuma chamada sai para a rede.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGgtAdapter, parseDestinationsCsv } from "@/server/suppliers/ggt/adapter";
import type { GgtConfig } from "@/server/suppliers/ggt/client";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";
import { SupplierError } from "@/server/suppliers/types";

const fx = (f: string) => readFileSync(`tests/fixtures/ggt/${f}`, "utf8");
const SEARCH = JSON.parse(fx("search-orlando.json"));
const VALUATION = fx("valuation.xml");
const INFO = fx("hotel-info.xml");

const cfg: GgtConfig = {
  url: "https://ggt.test/xmlwebservice.asmx",
  agencyId: "000000",
  user: "XML-TEST",
  password: "s3nh@<&>",
  environment: "test",
  staticUrl: "https://static.test",
  nationality: "BR",
  language: "pt",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const soap = (result: string) =>
  new Response(`<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><MakeRequestResponse xmlns="http://www.tourismcloudservice.com/"><MakeRequestResult>${esc(result)}</MakeRequestResult></MakeRequestResponse></soap:Body></soap:Envelope>`, {
    status: 200,
    headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
  });
const xmlError = (code: string, msg: string, debug = "") => `<Root><Header><OperationType>Error</OperationType></Header><Main><Error code="${code}"><![CDATA[${msg}]]></Error><DebugError><![CDATA[${debug}]]></DebugError></Main></Root>`;

type Call = { type: number; op: string; inner: string };

function fakeGgt(opts: { valuationFails?: Set<string>; existingBooking?: boolean; insertStatus?: string; priceBump?: number } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const type = Number(body.match(/<requestType>(\d+)<\/requestType>/)?.[1]);
    const inner = body
      .match(/<xmlRequest>([\s\S]*)<\/xmlRequest>/)![1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
    const op = inner.match(/<Operation>(\w+)<\/Operation>/)![1];
    calls.push({ type, op, inner });
    if (type === 11) {
      const ids = [...inner.matchAll(/<HotelId>(\d+)<\/HotelId>/g)].map((m) => Number(m[1]));
      const data = structuredClone(SEARCH);
      if (ids.length) data.Hotels = data.Hotels.filter((h: { HotelCode: number }) => ids.includes(h.HotelCode));
      if (opts.priceBump) for (const h of data.Hotels) for (const o of h.Offers) o.TotalPrice = Math.round((o.TotalPrice + opts.priceBump) * 100) / 100;
      if (!data.Hotels.length) return soap(JSON.stringify({ Header: { OperationType: "Error" }, Main: { Error: { Code: 1, Message: "No Hotels Were Found Matching Searched Criteria!" } } }));
      return soap(JSON.stringify(data));
    }
    if (type === 9) {
      const code = inner.match(/<HotelSearchCode>([^<]+)<\/HotelSearchCode>/)![1];
      if (opts.valuationFails?.has(code)) return soap(xmlError("901", "Error on Valuation Info", `The following may help resolve the issue: Availability information missing for hotel: ${code} - Please make a new availability search.`));
      return soap(VALUATION.replace(/<HotelSearchCode>[^<]+<\/HotelSearchCode>/, `<HotelSearchCode>${code}</HotelSearchCode>`));
    }
    if (type === 61) return soap(INFO);
    if (type === 10) {
      if (!opts.existingBooking) return soap(`<Root><Main><Error code="4"><![CDATA[No bookings were found]]></Error></Main></Root>`);
      return soap(`<Root><Header><OperationType>Response</OperationType></Header><Main><Bookings><Booking><GoBookingCode>99887766</GoBookingCode><GoReference>GO-1</GoReference><ClientBookingCode>SUB1001-1</ClientBookingCode><BookingStatus>C</BookingStatus><TotalPrice>184.88</TotalPrice><Currency>USD</Currency></Booking></Bookings></Main></Root>`);
    }
    if (type === 2) {
      const ref = inner.match(/<AgentReference>([^<]+)<\/AgentReference>/)![1];
      return soap(
        `<Root><Header><Operation>BOOKING_INSERT_RESPONSE</Operation><OperationType>Response</OperationType></Header><Main><GoBookingCode>12345678</GoBookingCode><GoReference>GO-12345678</GoReference><ClientBookingCode>${ref}</ClientBookingCode><BookingStatus>${opts.insertStatus ?? "C"}</BookingStatus><TotalPrice>184.88</TotalPrice><Currency>USD</Currency><HotelId>862326</HotelId><HotelName>OYO HOTEL ORLANDO AIRPORT</HotelName><HotelConfirmation>HC-778</HotelConfirmation><ArrivalDate>2027-01-03</ArrivalDate><CancellationDeadline>2026-12-30</CancellationDeadline><Nights>3</Nights></Main></Root>`,
      );
    }
    if (type === 3) return soap(`<Root><Header><OperationType>Response</OperationType></Header><Main><GoBookingCode>12345678</GoBookingCode><BookingStatus>X</BookingStatus></Main></Root>`);
    if (type === 8)
      return soap(
        `<Root><Header><OperationType>Response</OperationType></Header><Main><GoBookingCode>12345678</GoBookingCode><HotelName><![CDATA[OYO HOTEL ORLANDO AIRPORT]]></HotelName><Address><![CDATA[7100 S Orange Blossom Trl]]></Address><Phone>1-347-7524172</Phone><CheckInDate>03/Jan/27</CheckInDate><RoomBasis>RO</RoomBasis><Nights>3</Nights><VoucherDownloadURL><![CDATA[https://vouchers.example/abc.pdf]]></VoucherDownloadURL><BookedAndPayableBy><![CDATA[GoGlobal Travel]]></BookedAndPayableBy><SupplierReferenceNumber>SR-9</SupplierReferenceNumber><EmergencyPhone>+1 800 000</EmergencyPhone></Main></Root>`,
      );
    if (type === 4) return soap(`<Root><Header><OperationType>Response</OperationType></Header><Main><GoBookingCode>12345678</GoBookingCode><BookingStatus>RQ</BookingStatus><TotalPrice>184.88</TotalPrice><Currency>USD</Currency></Main></Root>`);
    throw new Error(`requestType inesperado ${type}`);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const STAY = { checkIn: "2027-01-03", checkOut: "2027-01-06" };
const PAX = { adults: 2, children: 1, childrenAges: [7], rooms: 1 };

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-11-04T12:00:00-03:00"), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => clearMemoryCache());

describe("GGT | Best Buy — busca", () => {
  it("busca Orlando (todas as áreas do destino popular) e normaliza os hotéis", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    const list = await a.search({ destination: "Orlando", destinationKey: "p:orlando", ...STAY, pax: PAX });
    // uma busca por cidade (a GGT ignora CityCode a partir do segundo)
    const searches = g.calls.filter((c) => c.type === 11);
    expect(searches.length).toBe(6);
    for (const s of searches) expect(s.inner.match(/<CityCode>/g)?.length).toBe(1);
    expect(searches[0].inner).toContain(`<Room Adults="2" RoomCount="1" ChildCount="1"><ChildAge>7</ChildAge></Room>`);
    expect(searches[0].inner).toContain("<Nights>3</Nights>");
    // mesmos hotéis em várias áreas aparecem uma vez só, do mais barato ao mais caro
    expect(list.map((p) => p.productId)).toEqual(["862326", "139832", "18640"]);
    const oyo = list[0];
    expect(oyo).toMatchObject({ supplierCode: "GGT_BEST_BUY", title: "Oyo Hotel Orlando Airport", currency: "USD", destination: "Orlando" });
    expect(oyo.lines).toEqual([{ type: "STAY", label: "Hospedagem · 3 noites · 1 quarto · Somente hospedagem", unitCost: "184.88", quantity: 1 }]);
    expect(oyo.imageUrl).toMatch(/^https:\/\/i\.travelapi\.com\//);
  });

  it("sem destino não consulta a API", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    expect(await a.search({ ...STAY, pax: PAX })).toEqual([]);
    expect(g.calls.length).toBe(0);
  });

  it("usa cache para a mesma busca", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    await a.search({ destinationKey: "p:paris", destination: "Paris", ...STAY, pax: PAX });
    await a.search({ destinationKey: "p:paris", destination: "Paris", ...STAY, pax: PAX });
    expect(g.calls.filter((c) => c.type === 11).length).toBe(1);
  });
});

describe("GGT | Best Buy — hotel", () => {
  it("monta o detalhe com fotos, descrição em português, quartos, cancelamento e taxas pagas no hotel", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    const legacy = await a.getProduct("139832", { destination: "Orlando", ...STAY, pax: PAX });
    expect(legacy!.options.map((o) => o.title)).toEqual(["Mini Suite", "2 Bedrooms Deluxe Suite"]);
    const mini = legacy!.options[0];
    expect(mini.attributes).toContainEqual({ label: "Cancelamento", value: "Cancelamento grátis até 27/12/2026" });
    expect(mini.freeCancellationUntil).toBe("2026-12-27");
    expect(mini.notes).toContain("Pago direto no hotel: taxa de resort USD 50,63");
    const oyo = await a.getProduct("862326", { destination: "Orlando", ...STAY, pax: PAX });
    expect(oyo!.gallery!.length).toBeGreaterThan(5);
    expect(oyo!.description).toContain("Localização:");
    expect(oyo!.description).not.toContain("Property Desc");
    expect(g.calls.find((c) => c.type === 61)!.inner).toContain("<InfoLanguage>pt</InfoLanguage>");
  });
});

describe("GGT | Best Buy — cotação", () => {
  it("busca de novo, faz a valuation e devolve o preço final", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    const detail = await a.getProduct("862326", { destination: "Orlando", ...STAY, pax: PAX });
    const q = await a.quote({ productId: "862326", optionId: detail!.options[0].optionId, ...STAY, pax: PAX });
    expect(q.currency).toBe("USD");
    expect(q.lines[0].unitCost).toBe("184.88");
    expect(q.serviceDate).toBe("2027-01-03");
    expect(q.serviceEndDate).toBe("2027-01-06");
    expect(q.details).toMatchObject({ boardCode: "RO", nights: 3, nonRefundable: false, freeCancellationUntil: "2026-12-29" });
    expect(String(q.details.remarks)).toContain("Check-in hour 15:00-23:00");
    expect(q.quoteRef).toBe("30247648/223137649259291962/100");
  });

  it("se a tarifa esgotou na valuation (erro 901), tenta a próxima igual; sem nenhuma → erro amigável", async () => {
    const g = fakeGgt({ valuationFails: new Set(["30247648/223137649259291962/100"]) });
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    const detail = await a.getProduct("862326", { destination: "Orlando", ...STAY, pax: PAX });
    await expect(a.quote({ productId: "862326", optionId: detail!.options[0].optionId, ...STAY, pax: PAX })).rejects.toThrow(/acabou de esgotar/);
  });

  it("opção que não existe mais", async () => {
    const a = createGgtAdapter(cfg, { fetch: fakeGgt().fetchImpl });
    await expect(a.quote({ productId: "862326", optionId: "inexistente", ...STAY, pax: PAX })).rejects.toBeInstanceOf(SupplierError);
  });
});

describe("GGT | Best Buy — reserva", () => {
  const travelers = [
    { name: "Maria da Silva", type: "ADULT" as const, title: "MRS" as const },
    { name: "João Silva", type: "ADULT" as const, title: "MR" as const },
    { name: "Pedro Silva", type: "CHILD" as const, age: 7 },
  ];

  async function itemFor(a: ReturnType<typeof createGgtAdapter>) {
    const detail = await a.getProduct("862326", { destination: "Orlando", ...STAY, pax: PAX });
    return { quoteRef: null, productId: "862326", optionId: detail!.options[0].optionId, pax: PAX, serviceDate: STAY.checkIn, serviceEndDate: STAY.checkOut, reference: "SUB1001-1", maxCost: { currency: "USD" as const, amount: "184.8800" } };
  }

  it("confere se já existe, cota de novo e reserva com os hóspedes no formato da GGT", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    const r = await a.book(await itemFor(a), { travelers, holder: { name: "Maria da Silva" } });
    expect(r).toMatchObject({ bookingRef: "12345678", status: "CONFIRMED" });
    expect(r.payload).toMatchObject({ goReference: "GO-12345678", hotelConfirmation: "HC-778", agentReference: "SUB1001-1" });
    const order = g.calls.map((c) => c.type);
    expect(order.indexOf(10)).toBeLessThan(order.indexOf(2)); // procura antes de reservar
    expect(order.lastIndexOf(9)).toBeLessThan(order.indexOf(2)); // valuation antes da reserva
    const insert = g.calls.find((c) => c.type === 2)!.inner;
    expect(insert).toContain("<AgentReference>SUB1001-1</AgentReference>");
    expect(insert).toContain("<ArrivalDate>2027-01-03</ArrivalDate><Nights>3</Nights>");
    expect(insert).toContain("<NoAlternativeHotel>1</NoAlternativeHotel>");
    expect(insert).toContain(
      `<RoomType Adults="2"><Room RoomID="1"><PersonName PersonID="1" Title="MRS." FirstName="Maria da" LastName="Silva"/><PersonName PersonID="2" Title="MR." FirstName="Joao" LastName="Silva"/><ExtraBed PersonID="3" FirstName="Pedro" LastName="Silva" ChildAge="7"/></Room></RoomType>`,
    );
    // senha com caracteres especiais vai escapada no XML
    expect(insert).toContain("<Password>s3nh@&lt;&amp;&gt;</Password>");
  });

  it("nunca reserva duas vezes: se a referência já existe, devolve a reserva existente", async () => {
    const g = fakeGgt({ existingBooking: true });
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    const r = await a.book(await itemFor(a), { travelers });
    expect(r.bookingRef).toBe("99887766");
    expect(r.payload.recoveredExisting).toBe(true);
    expect(g.calls.some((c) => c.type === 2)).toBe(false);
  });

  it("não reserva se o fornecedor aumentou o preço", async () => {
    const base = createGgtAdapter(cfg, { fetch: fakeGgt().fetchImpl });
    const item = await itemFor(base);
    const g = fakeGgt({ priceBump: 10 });
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    await expect(a.book(item, { travelers })).rejects.toThrow(/aumentou o preço/);
    expect(g.calls.some((c) => c.type === 2)).toBe(false);
  });

  it("exige nome e sobrenome de todos os hóspedes", async () => {
    const a = createGgtAdapter(cfg, { fetch: fakeGgt().fetchImpl });
    await expect(a.book(await itemFor(a), { travelers: travelers.slice(0, 2) })).rejects.toThrow(/crianças/);
    await expect(a.book(await itemFor(a), { travelers: [{ name: "Maria", type: "ADULT" }, travelers[1], travelers[2]] })).rejects.toThrow(/sobrenome/);
  });

  it("cancela na GGT (BOOKING_CANCEL) e lê o voucher oficial (PDF)", async () => {
    const g = fakeGgt();
    const a = createGgtAdapter(cfg, { fetch: g.fetchImpl });
    expect(a.cancelSimulation).toBe(false);
    expect((await a.cancelBooking!("12345678", { simulate: true })).status).toBe("SIMULATED");
    expect(g.calls.some((c) => c.type === 3)).toBe(false); // simulação não chama a GGT
    expect((await a.cancelBooking!("12345678", { simulate: false })).status).toBe("CANCELLED");
    expect(g.calls.find((c) => c.type === 3)!.inner).toContain("<GoBookingCode>12345678</GoBookingCode>");
    expect(await a.voucher!("12345678")).toMatchObject({ voucherUrl: "https://vouchers.example/abc.pdf", emergencyPhone: "+1 800 000", bookedAndPayableBy: "GoGlobal Travel", phone: "1-347-7524172" });
  });

  it("status RQ = pedido enviado, aguardando confirmação", async () => {
    const a = createGgtAdapter(cfg, { fetch: fakeGgt().fetchImpl });
    expect((await a.bookingStatus!("12345678")).status).toBe("PENDING");
  });
});

describe("GGT | Best Buy — destinos", () => {
  it("lê o CSV oficial de cidades", () => {
    const rows = parseDestinationsCsv(fx("destinations.csv"));
    const orl = rows.find((r) => r.code === "1423")!;
    expect(orl).toMatchObject({ city: "Orlando", region: "FL", countryCode: "US", searchKey: "orlando", countryName: "United States" });
    expect(rows.find((r) => r.code === "161121")!.searchKey).toBe("orlando and disneyworld");
    expect(rows.find((r) => r.code === "1133")).toMatchObject({ city: "London", region: "UK", countryCode: "GB" });
    expect(rows.length).toBe(9);
  });
});
