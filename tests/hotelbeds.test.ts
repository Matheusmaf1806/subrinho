/**
 * Hotelbeds — regras de combinação de tarifas, fluxo completo do adaptador (transporte falso) e
 * mTLS de verdade contra um servidor HTTPS local que exige certificado de cliente.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOptions, createHotelbedsAdapter, occupancyGroups, payAtHotel, type HbHotel } from "@/server/suppliers/hotelbeds/adapter";
import { HotelbedsClient, hotelbedsConfig, inspectCertificate, normalizePem, signature, type HotelbedsConfig, type Transport } from "@/server/suppliers/hotelbeds/client";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";
import { SupplierIntegrationError } from "@/server/suppliers/types";

const STAY = { checkIn: "2027-01-03", checkOut: "2027-01-06" };

function rate(p: Partial<Record<string, unknown>> & { key: string; net: string; adults: number; children?: number; ages?: string; rooms?: number }) {
  return {
    rateKey: p.key,
    rateClass: (p.rateClass as string) ?? "NOR",
    rateType: (p.rateType as "BOOKABLE" | "RECHECK") ?? "BOOKABLE",
    net: p.net,
    paymentType: (p.paymentType as string) ?? "AT_WEB",
    packaging: (p.packaging as boolean) ?? false,
    boardCode: (p.boardCode as string) ?? "BB",
    boardName: "BED AND BREAKFAST",
    rooms: p.rooms ?? 1,
    adults: p.adults,
    children: p.children ?? 0,
    childrenAges: p.ages,
    cancellationPolicies: (p.cancellationPolicies as { amount: string; from: string }[]) ?? [{ amount: "50.00", from: "2026-12-30T23:59:00+01:00" }],
    taxes: p.taxes as never,
    rateCommentsId: p.rateCommentsId as string | undefined,
    sellingRate: p.sellingRate as string | undefined,
    hotelMandatory: p.hotelMandatory as boolean | undefined,
  };
}

/** Hotel com 2 ocupações (quarto 1: 2 adultos + criança de 7; quarto 2: 1 adulto). */
const HOTEL: HbHotel = {
  code: 3424,
  name: "AS AMERICAS",
  categoryCode: "4EST",
  zoneName: "Lake Buena Vista",
  currency: "USD",
  rooms: [
    {
      code: "DBL.ST",
      name: "DOUBLE STANDARD",
      rates: [
        rate({ key: "k-dbl-a", net: "300.00", adults: 2, children: 1, ages: "7", rateType: "RECHECK", taxes: { allIncluded: false, taxes: [{ included: false, amount: "45.50", currency: "USD", type: "FEE", subType: "Resort Fee" }] } }),
        rate({ key: "k-dbl-b", net: "180.00", adults: 1, rateCommentsId: "102|555|0", sellingRate: "210.00", hotelMandatory: true }),
        rate({ key: "k-dbl-b2", net: "175.00", adults: 1, paymentType: "AT_HOTEL" }), // não vendemos: paga no hotel
        rate({ key: "k-dbl-b3", net: "170.00", adults: 1, packaging: true }), // só em pacote
        rate({ key: "k-dbl-nrf-a", net: "270.00", adults: 2, children: 1, ages: "7", rateClass: "NRF" }),
        rate({ key: "k-dbl-nrf-b", net: "160.00", adults: 1, rateClass: "NRF" }),
      ],
    },
    {
      code: "STE.ST",
      name: "SUITE",
      rates: [rate({ key: "k-ste-a", net: "500.00", adults: 2, children: 1, ages: "7", rateType: "RECHECK" })], // sem tarifa p/ o quarto 2 → não vira opção
    },
  ],
};
const PAX = { adults: 3, children: 1, childrenAges: [7], rooms: 2 };

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-11-04T12:00:00-03:00"), toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => clearMemoryCache());

describe("Hotelbeds — opções", () => {
  it("combina uma tarifa por ocupação; descarta pagamento no hotel e tarifas de pacote", () => {
    const groups = occupancyGroups(PAX);
    expect(groups).toEqual([
      { adults: 2, childAges: [7], count: 1, roomIndexes: [0] },
      { adults: 1, childAges: [], count: 1, roomIndexes: [1] },
    ]);
    const opts = buildOptions(HOTEL, groups);
    expect(opts.map((o) => [o.roomName, o.boardCode, o.refundable, o.total])).toEqual([
      ["Double Standard", "BB", false, "430.00"],
      ["Double Standard", "BB", true, "480.00"],
    ]);
    expect(opts[1].rates.map((r) => r.rateKey)).toEqual(["k-dbl-a", "k-dbl-b"]);
    expect(payAtHotel(opts[1].rates)).toEqual([{ label: "Resort Fee", amount: "45.50", currency: "USD" }]);
  });

  it("quartos iguais viram um grupo (rooms: 2)", () => {
    expect(occupancyGroups({ adults: 4, children: 0, rooms: 2 })).toEqual([{ adults: 2, childAges: [], count: 2, roomIndexes: [0, 1] }]);
  });
});

describe("Hotelbeds — credenciais", () => {
  it("aceita os nomes de variável HB_HOTEIS_* e os antigos, e escolhe o ambiente", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----";
    const env = { HB_HOTEIS_CLIENT_CRT: pem, HB_HOTEIS_CLIENT_KEY: pem, HB_HOTEIS_CA_CHAIN: pem, API_KEY_HH: "k", SECRET_KEY_HH: "s", HOTELBEDS_ENVIRONMENT: "production" };
    const c = hotelbedsConfig(env as unknown as NodeJS.ProcessEnv)!;
    expect(c.bookingUrl).toBe("https://api-mtls.hotelbeds.com/hotel-api/1.0");
    expect(c.contentUrl).toBe("https://api.hotelbeds.com/hotel-content-api/1.0");
    // credenciais de produção: o padrão é produção; teste só quando pedido
    expect(hotelbedsConfig({ ...env, HOTELBEDS_ENVIRONMENT: "" } as unknown as NodeJS.ProcessEnv)!.bookingUrl).toBe("https://api-mtls.hotelbeds.com/hotel-api/1.0");
    expect(hotelbedsConfig({ ...env, HOTELBEDS_ENVIRONMENT: "test" } as unknown as NodeJS.ProcessEnv)!.bookingUrl).toBe("https://api-mtls.test.hotelbeds.com/hotel-api/1.0");
    expect(c.sourceMarket).toBe("BR");
    expect(hotelbedsConfig({ ...env, API_KEY_HH: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("normaliza o PEM colado com \\n literais, numa linha só ou em base64", () => {
    const body = "MIIB".padEnd(130, "A");
    const pem = `-----BEGIN CERTIFICATE-----\n${body.slice(0, 64)}\n${body.slice(64, 128)}\n${body.slice(128)}\n-----END CERTIFICATE-----\n`;
    expect(normalizePem(pem.replace(/\n/g, "\\n"))).toBe(pem);
    expect(normalizePem(pem.replace(/\n/g, " "))).toBe(pem);
    expect(normalizePem(Buffer.from(pem).toString("base64"))).toBe(pem);
  });

  it("assinatura X-Signature = SHA-256(apiKey + secret + segundos)", () => {
    const now = 1_700_000_000_123;
    expect(signature("key", "secret", now)).toBe(createHash("sha256").update("keysecret1700000000").digest("hex"));
  });
});

describe("Hotelbeds — fluxo do adaptador", () => {
  const cfg: HotelbedsConfig = { apiKey: "k", secret: "s", cert: "", key: "", caChain: "", environment: "test", bookingUrl: "https://hb.test/hotel-api/1.0", contentUrl: "https://hb.test/hotel-content-api/1.0", language: "POR", sourceMarket: "BR" };

  function fake(opts: { existing?: boolean; bump?: number; bookingStatus?: number; checkRateStatus?: number } = {}) {
    const calls: { method: string; url: string; body?: unknown; mtls: boolean; headers: Record<string, string> }[] = [];
    const transport: Transport = async (req) => {
      const body = req.body ? JSON.parse(req.body) : undefined;
      calls.push({ method: req.method, url: req.url, body, mtls: req.mtls, headers: req.headers });
      const u = new URL(req.url);
      const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
      if (u.pathname.endsWith("/hotels") && req.method === "POST") {
        const h = structuredClone(HOTEL);
        if (opts.bump) for (const r of h.rooms!) for (const x of r.rates!) x.net = (Number(x.net) + opts.bump).toFixed(2);
        return json({ hotels: { hotels: [h], total: 1 } });
      }
      if (u.pathname.endsWith("/checkrates") && opts.checkRateStatus) return json({ error: { code: "PRODUCT_ERROR", message: "Price has changed" } }, opts.checkRateStatus);
      if (u.pathname.endsWith("/checkrates")) {
        const keys = (body as { rooms: { rateKey: string }[] }).rooms.map((r) => r.rateKey);
        const rates = HOTEL.rooms!.flatMap((r) => r.rates!).filter((r) => keys.includes(r.rateKey));
        return json({ hotel: { ...HOTEL, rooms: [{ code: "DBL.ST", name: "DOUBLE STANDARD", rates: rates.map((r) => ({ ...r, rateKey: `${r.rateKey}-checked`, rateType: "BOOKABLE", rateComments: "Check-in hour 15:00. Resort fee payable on arrival." })) }], totalNet: rates.reduce((s, r) => s + Number(r.net), 0).toFixed(2), paymentDataRequired: false } });
      }
      if (u.pathname.endsWith("/types/ratecommentdetails")) return json({ rateComments: [{ description: "Car park NO. Minimum check-in age 21." }] });
      if (u.pathname.endsWith("/bookings") && req.method === "GET") {
        return json({ bookings: { bookings: opts.existing ? [{ reference: "102-555", clientReference: "SUB1001-1", status: "CONFIRMED", currency: "USD", totalNet: 480 }] : [] } });
      }
      if (u.pathname.endsWith("/bookings") && req.method === "POST" && opts.bookingStatus) return json({ error: { code: "PRODUCT_ERROR", message: "Insufficient allotment" } }, opts.bookingStatus);
      if (u.pathname.endsWith("/bookings") && req.method === "POST") {
        return json({ booking: { reference: "102-999", clientReference: (body as { clientReference: string }).clientReference, status: "CONFIRMED", totalNet: 480, currency: "USD", hotel: { ...HOTEL, supplier: { name: "HOTELBEDS USA", vatNumber: "VAT-1" } } } });
      }
      if (req.method === "DELETE" && u.pathname.includes("/bookings/")) {
        const simulate = u.searchParams.get("cancellationFlag") === "SIMULATION";
        return json({ booking: { reference: "102-999", cancellationReference: simulate ? undefined : "CXL-1", status: simulate ? "CONFIRMED" : "CANCELLED", currency: "USD", hotel: { ...HOTEL, cancellationAmount: 50 } } });
      }
      if (u.pathname.includes("/details"))
        // formato real do detalhe: tipo da foto em type.code; facilities com grupos
        return json({
          hotel: {
            name: { content: "As Americas" },
            description: { content: "<p>Hotel ótimo</p>" },
            images: [
              { path: "00/003424/003424a_hb_k_049.jpg", type: { code: "CON" }, visualOrder: 2 },
              { path: "00/003424/003424a_hb_a_001.jpg", type: { code: "GEN" }, visualOrder: 9 },
            ],
            facilities: [
              { facilityGroupCode: 10, description: { content: "Ano de construção" }, number: 1987 },
              { facilityGroupCode: 30, description: { content: "Visa" }, indLogic: true },
              { facilityGroupCode: 70, description: { content: "Hora de check-in" } },
              { facilityGroupCode: 73, description: { content: "Piscina exterior aquecida" }, number: 2 },
              { facilityGroupCode: 71, description: { content: "Restaurante" }, indLogic: true },
              { facilityGroupCode: 70, description: { content: "Wi-fi" }, indLogic: false },
            ],
            address: { content: "RUA X, 1" },
            city: { content: "ORLANDO" },
          },
        });
      if (u.pathname.endsWith("/hotels")) return json({ hotels: [{ code: 3424, images: [{ path: "00/003424/003424a_hb_a_001.jpg", imageTypeCode: "GEN", visualOrder: 1 }] }] });
      throw new Error(`rota inesperada ${req.method} ${req.url}`);
    };
    return { calls, transport };
  }

  const travelers = [
    { name: "Maria da Silva", type: "ADULT" as const },
    { name: "João Souza", type: "ADULT" as const },
    { name: "Ana Lima", type: "ADULT" as const },
    { name: "Pedro Silva", type: "CHILD" as const, age: 7 },
  ];
  const availCalls = (f: ReturnType<typeof fake>) => f.calls.filter((c) => c.method === "POST" && c.url.endsWith("/hotel-api/1.0/hotels")).length;

  it("fluxo certificado: 1 disponibilidade → CheckRate só da tarifa RECHECK → reserva com as tarifas cotadas", async () => {
    const f = fake();
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    const detail = await a.getProduct("3424", { destination: "Orlando", ...STAY, pax: PAX });
    expect(detail!.gallery![0]).toBe("https://photos.hotelbeds.com/giata/xl/00/003424/003424a_hb_a_001.jpg"); // foto geral primeiro
    expect(detail!.highlights).toEqual(["Piscina exterior aquecida", "Restaurante"]);
    const opt = detail!.options.find((o) => o.attributes?.some((x) => x.value.startsWith("Cancelamento grátis")))!;
    expect(opt.notes).toContain("Pago direto no hotel: taxa de resort USD 45,50");
    expect(opt.notes!.some((n) => n.startsWith("A partir de 30/12/2026 (horário do hotel), multa de cancelamento de USD 100,00"))).toBe(true);
    // quarto 1 net 300 (sem exigência) + quarto 2 sellingRate obrigatório 210 → mínimo 510
    expect(opt.minSellPrice).toEqual({ currency: "USD", amount: "510.00" });

    const avail = f.calls.find((c) => c.method === "POST" && c.url.endsWith("/hotels"))!;
    expect(avail.mtls).toBe(true);
    expect(avail.body).toMatchObject({ stay: STAY, hotels: { hotel: [3424] }, sourceMarket: "BR", occupancies: [{ rooms: 1, adults: 2, children: 1, paxes: [{ type: "CH", age: 7 }] }, { rooms: 1, adults: 1, children: 0 }] });
    expect(f.calls.find((c) => c.url.includes("/details"))!.mtls).toBe(false); // Content API sem certificado

    // cotação ao adicionar ao carrinho e de novo no checkout: NENHUMA disponibilidade nova
    const q = await a.quote({ productId: "3424", optionId: opt.optionId, ...STAY, pax: PAX });
    await a.quote({ productId: "3424", optionId: opt.optionId, ...STAY, pax: PAX });
    expect(availCalls(f)).toBe(1);
    const checks = f.calls.filter((c) => c.url.endsWith("/checkrates"));
    expect(checks).toHaveLength(1); // só a tarifa RECHECK, uma vez (reaproveitada no checkout)
    expect(checks[0].body).toEqual({ rooms: [{ rateKey: "k-dbl-a" }], language: "ENG" });
    expect(q.lines[0].unitCost).toBe("480.00");
    expect(q.details).toMatchObject({ rateKeys: ["k-dbl-a-checked", "k-dbl-b"], rateTypes: ["BOOKABLE", "BOOKABLE"], nonRefundable: false, paymentDataRequired: false, minSellPrice: { currency: "USD", amount: "510.00" } });
    expect(String(q.details.remarks)).toContain("Resort fee payable on arrival"); // CheckRate
    expect(String(q.details.remarks)).toContain("Minimum check-in age 21"); // Content API (tarifa BOOKABLE)

    const r = await a.book(
      { quoteRef: null, productId: "3424", optionId: opt.optionId, pax: PAX, serviceDate: STAY.checkIn, serviceEndDate: STAY.checkOut, reference: "SUB1001-1", maxCost: { currency: "USD", amount: "480.0000" }, details: q.details },
      { travelers, holder: { name: "Maria da Silva" } },
    );
    expect(r).toMatchObject({ bookingRef: "102-999", status: "CONFIRMED" });
    expect(r.payload).toMatchObject({ payableThrough: "HOTELBEDS USA", supplierVatNumber: "VAT-1" });
    expect(availCalls(f)).toBe(1); // a reserva também não repete disponibilidade
    expect(f.calls.filter((c) => c.url.endsWith("/checkrates"))).toHaveLength(1);
    const post = f.calls.find((c) => c.method === "POST" && c.url.endsWith("/bookings"))!;
    expect(post.body).toEqual({
      holder: { name: "Maria da", surname: "Silva" },
      rooms: [
        {
          rateKey: "k-dbl-a-checked",
          paxes: [
            { roomId: 1, type: "AD", name: "Maria da", surname: "Silva" },
            { roomId: 1, type: "AD", name: "Joao", surname: "Souza" },
            { roomId: 1, type: "CH", age: 7, name: "Pedro", surname: "Silva" },
          ],
        },
        { rateKey: "k-dbl-b", paxes: [{ roomId: 1, type: "AD", name: "Ana", surname: "Lima" }] },
      ],
      clientReference: "SUB1001-1",
      language: "ENG",
    });
    const list = f.calls.find((c) => c.method === "GET" && c.url.includes("/bookings?"))!;
    expect(list.url).toContain("clientReference=SUB1001-1");
    expect(f.calls.indexOf(list)).toBeLessThan(f.calls.indexOf(post));
  });

  it("detalhe reaproveita a disponibilidade da busca do destino (sem nova chamada)", async () => {
    const f = fake();
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    // simula a busca do destino já em cache
    const { cacheSet } = await import("@/server/suppliers/hotels/cache");
    const { paxKey } = await import("@/server/suppliers/hotels/occupancy");
    await cacheSet(`hb:hotel:3424:${STAY.checkIn}:${STAY.checkOut}:${paxKey(PAX)}`, { hotel: { code: 3424, name: "AS AMERICAS", currency: "USD" }, options: buildOptions(HOTEL, occupancyGroups(PAX)) }, 60);
    const detail = await a.getProduct("3424", { ...STAY, pax: PAX });
    expect(detail!.options.length).toBeGreaterThan(0);
    expect(availCalls(f)).toBe(0);
  });

  it("quarto que esgota no CheckRate sai da página do hotel — sem nova disponibilidade", async () => {
    const f = fake({ checkRateStatus: 500 });
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    const detail = await a.getProduct("3424", { ...STAY, pax: PAX });
    const opt = detail!.options.find((o) => o.attributes?.some((x) => x.value.startsWith("Cancelamento grátis")))!;
    await expect(a.quote({ productId: "3424", optionId: opt.optionId, ...STAY, pax: PAX })).rejects.toThrow(/esgotar/);
    const again = await a.getProduct("3424", { ...STAY, pax: PAX });
    expect(again!.options.map((o) => o.optionId)).not.toContain(opt.optionId);
    expect(again!.options.length).toBe(detail!.options.length - 1);
    expect(availCalls(f)).toBe(1);
  });

  it("não duplica: reserva com a mesma referência já existe", async () => {
    const f = fake({ existing: true });
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    const opt = buildOptions(HOTEL, occupancyGroups(PAX)).find((o) => o.refundable)!;
    const r = await a.book(
      { quoteRef: null, productId: "3424", optionId: opt.optionId, pax: PAX, serviceDate: STAY.checkIn, serviceEndDate: STAY.checkOut, reference: "SUB1001-1", details: { rateKeys: ["k-dbl-a", "k-dbl-b"] } },
      { travelers },
    );
    expect(r.bookingRef).toBe("102-555");
    expect(f.calls.some((c) => c.method === "POST" && c.url.endsWith("/bookings"))).toBe(false);
  });

  it("tarifa recusada (500): mensagem clara e nova tentativa refaz a consulta — sem passar do custo vendido", async () => {
    const f = fake({ bookingStatus: 500 });
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    const opt = buildOptions(HOTEL, occupancyGroups(PAX)).find((o) => o.refundable)!;
    const item = { quoteRef: null, productId: "3424", optionId: opt.optionId, pax: PAX, serviceDate: STAY.checkIn, serviceEndDate: STAY.checkOut, reference: "SUB1001-1", maxCost: { currency: "USD" as const, amount: "480.0000" }, details: { rateKeys: ["k-dbl-a", "k-dbl-b"] } };
    await expect(a.book(item, { travelers })).rejects.toThrow(/Tentar de novo/);
    expect(availCalls(f)).toBe(0);
    // nova tentativa com o preço do fornecedor mais alto → não reserva
    const g = fake({ bump: 5 });
    const b = createHotelbedsAdapter(cfg, { transport: g.transport });
    await expect(b.book(item, { travelers, retry: true })).rejects.toThrow(/aumentou o preço/);
    expect(availCalls(g)).toBe(1);
    expect(g.calls.some((c) => c.method === "POST" && c.url.endsWith("/bookings"))).toBe(false);
  });

  it("cancelamento: simula a multa (SIMULATION) e depois cancela (CANCELLATION)", async () => {
    const f = fake();
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    expect(a.cancelSimulation).toBe(true);
    const sim = await a.cancelBooking!("102-999", { simulate: true });
    expect(sim).toMatchObject({ status: "SIMULATED", penalty: { amount: "50.00", currency: "USD" } });
    const done = await a.cancelBooking!("102-999", { simulate: false });
    expect(done).toMatchObject({ status: "CANCELLED", reference: "CXL-1" });
    const dels = f.calls.filter((c) => c.method === "DELETE");
    expect(dels.map((c) => new URL(c.url).searchParams.get("cancellationFlag"))).toEqual(["SIMULATION", "CANCELLATION"]);
    expect(dels.every((c) => c.mtls)).toBe(true);
  });

  it("tarifa que exige cartão no fornecedor não é reservada automaticamente", async () => {
    const f = fake();
    const a = createHotelbedsAdapter(cfg, { transport: f.transport });
    const opt = buildOptions(HOTEL, occupancyGroups(PAX)).find((o) => o.refundable)!;
    await expect(
      a.book({ quoteRef: null, productId: "3424", optionId: opt.optionId, pax: PAX, serviceDate: STAY.checkIn, serviceEndDate: STAY.checkOut, reference: "SUB1001-1", details: { rateKeys: ["k-dbl-a", "k-dbl-b"], paymentDataRequired: true } }, { travelers }),
    ).rejects.toThrow(/extranet/);
  });

  it("erro de credencial vira mensagem técnica para o painel (não aparece para o cliente)", async () => {
    const client = new HotelbedsClient(cfg, async () => ({ status: 403, body: JSON.stringify({ error: { code: "ERR", message: "Invalid signature" } }) }));
    const e = (await client.booking("POST", "/hotels", {}).catch((x: unknown) => x)) as Error;
    expect(e).toBeInstanceOf(SupplierIntegrationError);
    expect(e.message).toContain("Invalid signature");
  });
});

// ───────────── mTLS de verdade (certificados gerados na hora com openssl) ─────────────

let hasOpenssl = true;
try {
  execFileSync("openssl", ["version"], { stdio: "ignore" });
} catch {
  hasOpenssl = false;
}

describe.skipIf(!hasOpenssl)("Hotelbeds — mTLS", () => {
  let dir: string;
  let server: https.Server;
  let port: number;
  const seen: { authorized: boolean; cn?: string; apiKey?: string; sig?: string }[] = [];
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

  beforeAll(async () => {
    vi.useRealTimers();
    dir = mkdtempSync(path.join(tmpdir(), "hb-mtls-"));
    const run = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "ignore" });
    writeFileSync(path.join(dir, "san.ext"), "subjectAltName=DNS:localhost,IP:127.0.0.1\n");
    run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-days", "2", "-subj", "/CN=HB Test CA");
    run("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost");
    run("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "2", "-extfile", "san.ext");
    run("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "client.key", "-out", "client.csr", "-subj", "/CN=subrinho-client");
    run("x509", "-req", "-in", "client.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "client.crt", "-days", "2");
    // certificado de outra CA (não autorizado)
    run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "rogue.key", "-out", "rogue.crt", "-days", "2", "-subj", "/CN=rogue");
    server = https.createServer({ key: read("server.key"), cert: read("server.crt"), ca: read("ca.crt"), requestCert: true, rejectUnauthorized: true }, (req, res) => {
      const sock = req.socket as import("node:tls").TLSSocket;
      seen.push({ authorized: sock.authorized, cn: String(sock.getPeerCertificate()?.subject?.CN ?? ""), apiKey: String(req.headers["api-key"]), sig: String(req.headers["x-signature"]) });
      const gz = zlib.gzipSync(JSON.stringify({ hotels: { hotels: [], total: 0 } }));
      res.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip" });
      res.end(gz);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => {
    server?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const cfgWith = (cert: string, key: string): HotelbedsConfig => ({
    apiKey: "my-key",
    secret: "my-secret",
    cert: normalizePem(cert),
    key: normalizePem(key),
    // a cadeia informada também valida o servidor (aqui, o servidor de teste é assinado pela mesma CA)
    caChain: normalizePem(read("ca.crt")),
    environment: "test",
    bookingUrl: `https://localhost:${port}/hotel-api/1.0`,
    contentUrl: `https://localhost:${port}/hotel-content-api/1.0`,
    language: "POR",
    sourceMarket: "BR",
  });

  it("apresenta o certificado do cliente, assina e descompacta gzip", async () => {
    const cfg = cfgWith(read("client.crt"), read("client.key"));
    expect(inspectCertificate(cfg)).toMatchObject({ ok: true, keyMatches: true });
    const client = new HotelbedsClient(cfg);
    const r = await client.booking<{ hotels: { total: number } }>("POST", "/hotels", { stay: STAY });
    expect(r.hotels.total).toBe(0);
    const last = seen[seen.length - 1];
    expect(last).toMatchObject({ authorized: true, cn: "subrinho-client", apiKey: "my-key" });
    expect(last.sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("certificado não autorizado é recusado no handshake (erro claro de mTLS)", async () => {
    const client = new HotelbedsClient(cfgWith(read("rogue.crt"), read("rogue.key")));
    const e = (await client.booking("POST", "/hotels", {}).catch((x: unknown) => x)) as Error;
    expect(e).toBeInstanceOf(SupplierIntegrationError);
    expect(e.message).toMatch(/mTLS|conexão/);
  });

  it("chave que não é do certificado é detectada no diagnóstico", () => {
    expect(inspectCertificate({ cert: read("client.crt"), key: read("rogue.key") })).toMatchObject({ ok: false, keyMatches: false });
  });
});
