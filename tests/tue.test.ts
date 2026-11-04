/**
 * Tu Experienza (Tue Distributor API v2.0) — regras de preço, destino e o fluxo completo do adaptador
 * com transporte falso no formato da especificação (OAuth2 → produtos → horários → reserva → pedido).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cancellationOf, costBasisOf, createTueAdapter, matchesTicketDestination, seasonFor, slotTime, ticketCodes, typeFor, unitCost, type TueProduct, type TueType } from "@/server/suppliers/tue/adapter";
import { TueApiError, tueConfig, type Transport } from "@/server/suppliers/tue/client";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";

const ADULT: TueType = { product_type: "ADULT", product_type_id: "T-AD", product_type_label: "Adult", product_type_age_from: 18, product_type_age_to: 64, product_type_pricing: { product_type_list_price: "20.50", product_type_sales_price: "18.50", product_type_resale_price: "16.40" } };
const CHILD: TueType = { product_type: "CHILD", product_type_id: "T-CH", product_type_age_from: 4, product_type_age_to: 17, product_type_quantity_max: 6, product_type_pricing: { product_type_list_price: "10.00", product_type_sales_price: "9.00", product_type_resale_price: "7.20" } };

const COLOSSEUM: TueProduct = {
  product_id: "P-COL",
  product_class: "STANDARD",
  product_catalogue_status: "ACTIVE",
  product_admission_type: "TIME_POINT",
  product_availability: true,
  product_capacity: true,
  product_traveldate_required: false,
  product_booking_quantity_max: 10,
  product_cancellation_allowed: true,
  product_cancellation_policies: [{ cancellation_description: "Cancel 24 hours in advance.", cancellation_type: "TRAVEL_DATE", cancellation_fee_threshold: 1440, cancellation_fee_percentage: 100 }],
  product_payment_detail: { product_payment_currency: { currency_code: "EUR" } },
  product_content: {
    product_title: "Coliseu: entrada com horário marcado",
    product_short_description: "Entrada sem fila no Coliseu",
    product_long_description: "Visite o Coliseu.",
    product_entry_notes: "Chegue 15 minutos antes.",
    product_includes: [{ include_description: "Entrada" }],
    product_images: [{ image_type: "BANNER", image_url: "https://img.test/b.jpg" }, { image_type: "MAIN", image_url: "https://img.test/m.jpg" }],
  },
  product_locations: [{ location_name: "Colosseo", location_type: "VENUE", location_address: { city: "Rome", country: "Italy", country_code: "IT" } }],
  product_type_seasons: [
    { product_type_season_start_date: "2026-01-01T00:00:00+01:00", product_type_season_end_date: "2026-12-31T23:59:59+01:00", product_type_season_details: [ADULT, CHILD] },
    {
      product_type_season_start_date: "2027-01-01T00:00:00+01:00",
      product_type_season_details: [{ ...ADULT, product_type_id: "T-AD-27", product_type_pricing: { product_type_list_price: "24.00", product_type_sales_price: "22.00", product_type_resale_price: "19.80" } }, { ...CHILD, product_type_id: "T-CH-27" }],
    },
  ],
};
const COMBI: TueProduct = { ...COLOSSEUM, product_id: "P-COMBI", product_class: "COMBI" };
const PICKUP: TueProduct = { ...COLOSSEUM, product_id: "P-PICK", product_pickup_point: "MANDATORY" };
const PARIS: TueProduct = { ...COLOSSEUM, product_id: "P-LOUVRE", product_content: { ...COLOSSEUM.product_content, product_title: "Louvre" }, product_locations: [{ location_type: "VENUE", location_address: { city: "Paris", country: "France" } }] };

const DAY = "2026-12-18";
const SLOTS = [
  { availability_id: "S-0930", availability_active: true, availability_from_date_time: `${DAY}T09:30:00+01:00`, availability_to_date_time: `${DAY}T10:30:00+01:00`, availability_spots: { availability_spots_open: 3 } },
  {
    availability_id: "S-1100",
    availability_active: true,
    availability_from_date_time: `${DAY}T11:00:00+01:00`,
    availability_spots: { availability_spots_open: 40 },
    availability_pricing: [
      { availability_pricing_variation_amount: "2.00", availability_pricing_variation_price_type: "RESALE_PRICE" as const, availability_pricing_variation_product_type_id: "T-AD" },
      { availability_pricing_variation_amount: "2.50", availability_pricing_variation_price_type: "SALES_PRICE" as const, availability_pricing_variation_product_type_id: "T-AD" },
    ],
  },
  { availability_id: "S-CLOSED", availability_active: false, availability_from_date_time: `${DAY}T15:00:00+01:00` },
];

const ORDER = {
  order_reference: "ORDRREF123456",
  order_external_reference: "SUB47-1",
  order_voucher_url: "https://emails.tue.test/v/1",
  order_pricing: { price_total: "45.20" },
  order_bookings: [
    {
      booking_reference: "BK-1",
      booking_status: "BOOKING_CONFIRMED",
      booking_voucher_released: true,
      product_currency_code: "EUR",
      product_availability_from_date_time: `${DAY}T11:00:00+01:00`,
      product_code_settings: { product_code_format: "QR_CODE" },
      product_type_details: [
        { product_type: "ADULT", product_type_label: "Adult", product_type_code: "1539762088951995" },
        { product_type: "ADULT", product_type_label: "Adult", product_type_code: "1539762088951996" },
        { product_type: "CHILD", product_type_label: "Child", product_type_code: "1539762088951997" },
      ],
    },
  ],
};

type Opts = { existing?: boolean; checkoutRequired?: boolean; serverTotal?: string; orderTimeout?: boolean; token401Once?: boolean; basicRefused?: boolean; bodyRefused?: boolean };

function fake(o: Opts = {}) {
  const calls: { method: string; path: string; body?: unknown; headers: Record<string, string> }[] = [];
  let tokens = 0;
  let rejected = !o.token401Once;
  let created = false;
  const transport: Transport = async (req) => {
    const u = new URL(req.url);
    const path = u.pathname.replace(/^\/v2\.0/, "");
    const body = req.body ? JSON.parse(req.body) : undefined;
    calls.push({ method: req.method, path: `${path}${u.search}`, body, headers: req.headers });
    const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
    if (path === "/oauth2/token") {
      const viaBody = !req.headers.Authorization;
      if ((viaBody && o.bodyRefused) || (!viaBody && o.basicRefused))
        return json({ error: "UNAUTHORIZED", error_description: "Authentication is required and has failed or has not yet been provided.", errors: ["Username or password is wrong"] }, 401);
      tokens++;
      return json({ access_token: `tok${tokens}`, token_type: "Bearer", expires_in: 3600 });
    }
    if (!rejected && req.headers.Authorization === "Bearer tok1") {
      rejected = true;
      return json({ error: "invalid_token", error_description: "expired" }, 401);
    }
    if (path === "/products") {
      const page = Number(u.searchParams.get("page") ?? "1");
      return json({ api_version: "2.0.0", data: { kind: "product", page_index: page, total_pages: 2, items: page === 1 ? [COLOSSEUM, COMBI] : [PICKUP, PARIS] } });
    }
    if (path === "/products/destinations") return json({ data: { items: [] } });
    if (path === "/products/P-COL") return json({ data: { kind: "product", product: COLOSSEUM } });
    if (path === "/availability") return json({ data: { kind: "availability", total_items: SLOTS.length, items: SLOTS } });
    if (path === "/orders" && req.method === "GET") return json({ data: { items: o.existing || created ? [ORDER] : [] } });
    if (path === "/reservations" && req.method === "POST")
      return json(
        {
          data: {
            kind: "reservation",
            reservation: {
              reservation_reference: "RES-1",
              reservation_valid_until: `${DAY}T00:00:00+01:00`,
              reservation_pricing: { price_total: o.serverTotal ?? "46.00" },
              ...(o.checkoutRequired ? { reservation_checkout_fields: [{ checkout_field_id: "F1", checkout_field_restriction: "REQUIRED", checkout_field_type: "PASSPORT_NUMBER" }] } : {}),
            },
          },
        },
        201,
      );
    if (path === "/reservations/RES-1" && req.method === "DELETE") return json({ data: {} });
    if (path === "/orders" && req.method === "POST") {
      created = true;
      if (o.orderTimeout) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      return json({ data: { kind: "order", order: ORDER } }, 201);
    }
    if (path === "/orders/ORDRREF123456" && req.method === "GET") return json({ data: { kind: "order", order: ORDER } });
    if (path === "/orders/ORDRREF123456" && req.method === "DELETE") return json({ data: { order: { ...ORDER, order_bookings: ORDER.order_bookings.map((b) => ({ ...b, booking_status: "BOOKING_CANCELLED" })) } } });
    throw new Error(`rota inesperada ${req.method} ${req.url}`);
  };
  return { calls, transport, tokens: () => tokens };
}

const cfg = { distributorId: "501", username: "user@agencia", password: "s3nh@", environment: "test" as const, baseUrl: "https://distributor-test.tuexperiencia.com/v2.0", language: "pt" };
const ctx = { travelers: [{ name: "Maria da Silva", type: "ADULT" as const }], holder: { name: "Maria da Silva" }, contact: { email: "maria@cliente.com.br", phone: "(11) 98888-1111" } };
const item = (extra: Record<string, unknown> = {}) => ({
  quoteRef: null,
  productId: "P-COL",
  optionId: "S-1100",
  pax: { adults: 2, children: 1 },
  serviceDate: DAY,
  reference: "SUB47-1",
  maxCost: { currency: "EUR" as const, amount: "44.0000" },
  ...extra,
});

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-11-04T12:00:00-03:00"), toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => clearMemoryCache());

describe("Tu Experienza — preço, temporada e destino", () => {
  it("temporada da data; tarifa adulta/infantil; sênior paga como adulto; PERSON vale como adulto", () => {
    expect(typeFor(seasonFor(COLOSSEUM, DAY), "ADULT")?.product_type_id).toBe("T-AD");
    expect(typeFor(seasonFor(COLOSSEUM, "2027-03-10"), "ADULT")?.product_type_id).toBe("T-AD-27");
    expect(typeFor(seasonFor(COLOSSEUM, DAY), "SENIOR")?.product_type_id).toBe("T-AD");
    expect(typeFor({ product_type_season_details: [{ ...ADULT, product_type: "PERSON", product_type_id: "T-P" }] }, "ADULT")?.product_type_id).toBe("T-P");
    expect(seasonFor(COLOSSEUM, "2025-06-01")).toBeNull();
  });

  it("custo = preço de revenda (+ variação de revenda do horário); sem revenda informada, preço de venda", () => {
    expect(costBasisOf([ADULT, CHILD])).toBe("resale");
    expect(unitCost(ADULT, "resale", SLOTS[1])).toBe("18.40");
    expect(unitCost(ADULT, "sales", SLOTS[1])).toBe("21.00");
    expect(unitCost(CHILD, "resale", SLOTS[1])).toBe("7.20"); // variação é só do adulto
    const noResale = { ...ADULT, product_type_pricing: { product_type_sales_price: "18.50" } };
    expect(costBasisOf([noResale])).toBe("sales");
  });

  it("cancelamento, horário e destino em português", () => {
    expect(cancellationOf({ product_cancellation_allowed: false }, DAY)).toEqual({ text: "Não reembolsável", until: null });
    expect(cancellationOf({ product_cancellation_allowed: true, product_cancellation_policies: [] }, DAY)).toEqual({ text: "Cancelamento grátis até 17/12/2026", until: "2026-12-17" });
    expect(cancellationOf(COLOSSEUM, DAY).text).toBe("Cancelamento com multa: Cancel 24 hours in advance.");
    expect(slotTime(`${DAY}T09:30:00+01:00`)).toBe("09:30");
    expect(matchesTicketDestination("Roma", "Coliseu Rome Italy")).toBe(true);
    expect(matchesTicketDestination("Florença", "Uffizi Firenze")).toBe(true);
    expect(matchesTicketDestination("Roma", "Louvre Paris France")).toBe(false);
  });

  it("variáveis da Vercel: TUEXPERIENCIA_*; produção por padrão", () => {
    const c = tueConfig({ TUEXPERIENCIA_DISTRIBUTOR_ID: "501", TUEXPERIENCIA_USERNAME: "u", TUEXPERIENCIA_PASSWORD: "p" } as unknown as NodeJS.ProcessEnv)!;
    expect(c).toMatchObject({ environment: "live", baseUrl: "https://distributor-live.tuexperiencia.com/v2.0" });
    expect(tueConfig({ TUEXPERIENCIA_DISTRIBUTOR_ID: "501", TUEXPERIENCIA_USERNAME: "u", TUEXPERIENCIA_PASSWORD: "p", TUEXPERIENCIA_ENVIRONMENT: "test" } as unknown as NodeJS.ProcessEnv)!.baseUrl).toBe("https://distributor-test.tuexperiencia.com/v2.0");
    expect(tueConfig({ TUEXPERIENCIA_USERNAME: "u" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("Tu Experienza — fluxo do adaptador", () => {
  it("token OAuth2 (Basic usuário:senha) reaproveitado; 401 → novo token uma vez", async () => {
    const f = fake({ token401Once: true });
    const a = createTueAdapter(cfg, { transport: f.transport });
    await a.search({ destination: "Roma", date: DAY, pax: { adults: 1, children: 0 } });
    const tok = f.calls.find((c) => c.path === "/oauth2/token")!;
    // usuário e senha literais: a Tue não decodifica o Basic (um "@" virando %40 é recusado)
    expect(tok.headers.Authorization).toBe(`Basic ${Buffer.from("user@agencia:s3nh@").toString("base64")}`);
    expect(tok.body).toEqual({ grant_type: "client_credentials" });
    expect(f.tokens()).toBe(2); // o primeiro foi recusado (401) e renovado
  });

  it("Basic recusado → usuário e senha no corpo (alternativa da API)", async () => {
    const f = fake({ basicRefused: true });
    const a = createTueAdapter(cfg, { transport: f.transport });
    await a.search({ destination: "Roma", date: DAY, pax: { adults: 1, children: 0 } });
    const toks = f.calls.filter((c) => c.path === "/oauth2/token");
    expect(toks).toHaveLength(2);
    expect(toks[1].headers.Authorization).toBeUndefined();
    expect(toks[1].body).toEqual({ username: "user@agencia", password: "s3nh@" });
    expect(f.calls.find((c) => c.path.startsWith("/products?"))!.headers.Authorization).toBe("Bearer tok1");
  });

  it("credenciais recusadas: erro claro e sem repetir o login a cada busca", async () => {
    const f = fake({ basicRefused: true, bodyRefused: true });
    const a = createTueAdapter(cfg, { transport: f.transport });
    const err = await a.search({ destination: "Roma", date: DAY, pax: { adults: 1, children: 0 } }).catch((e) => e);
    expect(err).toBeInstanceOf(TueApiError);
    expect(err.message).toContain("Username or password is wrong");
    expect(err.message).toContain("TUEXPERIENCIA_USERNAME");
    const before = f.calls.length;
    await a.search({ destination: "Paris", date: DAY, pax: { adults: 1, children: 0 } }).catch(() => null);
    expect(f.calls.length).toBe(before); // pausa de alguns minutos antes de tentar de novo
  });

  it("busca: todas as páginas, só o que dá para vender, destino em português e preço de revenda da temporada", async () => {
    const f = fake();
    const a = createTueAdapter(cfg, { transport: f.transport });
    const list = await a.search({ destination: "Roma", date: DAY, pax: { adults: 1, children: 0 } });
    expect(list.map((x) => x.productId)).toEqual(["P-COL"]); // COMBI e ponto de encontro obrigatório ficam de fora; Paris não é Roma
    expect(list[0]).toMatchObject({ title: "Coliseu: entrada com horário marcado", destination: "Rome", currency: "EUR", imageUrl: "https://img.test/m.jpg", lines: [{ type: "ADULT", unitCost: "16.40", quantity: 1 }] });
    expect(f.calls.filter((c) => c.path.startsWith("/products?")).map((c) => new URL(`https://x${c.path}`).searchParams.get("page"))).toEqual(["1", "2"]);
    await a.search({ destination: "Paris", date: DAY, pax: { adults: 1, children: 0 } });
    expect(f.calls.filter((c) => c.path.startsWith("/products?")).length).toBe(2); // catálogo em cache
  });

  it("detalhe: um horário por opção, preço infantil sem nova consulta e aviso de últimas vagas", async () => {
    const f = fake();
    const a = createTueAdapter(cfg, { transport: f.transport });
    const d = await a.getProduct("P-COL", { date: DAY, pax: { adults: 2 } });
    expect(d!.options.map((o) => [o.optionId, o.title, o.available])).toEqual([
      ["S-0930", "09:30", true],
      ["S-1100", "11:00", true],
    ]);
    expect(d!.options[0].notes).toEqual(["Últimas 3 vagas neste horário"]);
    expect(d!.options[1].lines[0].unitCost).toBe("18.40");
    expect(d!.options[1].childLines?.[0]).toMatchObject({ type: "CHILD", unitCost: "7.20" });
    expect(d!.paxRules).toEqual([
      { type: "ADULT", label: "Adulto (18 a 64 anos)", min: 0, max: 10 },
      { type: "CHILD", label: "Criança (4 a 17 anos)", min: 0, max: 6, hint: undefined },
    ]);
    expect(d!.description).toContain("Inclui: Entrada.");
    expect(d!.description).toContain("Antes de ir: Chegue 15 minutos antes.");
  });

  it("cotação: revalida o horário e as vagas; linhas por tipo de ingresso", async () => {
    const f = fake();
    const a = createTueAdapter(cfg, { transport: f.transport });
    const q = await a.quote({ productId: "P-COL", optionId: "S-1100", date: DAY, pax: { adults: 2, children: 1 } });
    expect(q.lines).toEqual([
      { type: "ADULT", label: "Adulto (18 a 64 anos)", unitCost: "18.40", quantity: 2 },
      { type: "CHILD", label: "Criança (4 a 17 anos)", unitCost: "7.20", quantity: 1 },
    ]);
    expect(q).toMatchObject({ currency: "EUR", serviceDate: DAY, subtitle: "18/12/2026 · 11:00", details: { availabilityId: "S-1100", costBasis: "resale", expectedSalesTotal: "51.00" } });
    await expect(a.quote({ productId: "P-COL", optionId: "S-0930", date: DAY, pax: { adults: 4, children: 0 } })).rejects.toThrow("Restam só 3 vagas neste horário");
    await expect(a.quote({ productId: "P-COL", optionId: "S-CLOSED", date: DAY, pax: { adults: 1, children: 0 } })).rejects.toThrow(/não está mais disponível/);
    await expect(a.quote({ productId: "P-COL", optionId: "S-1100", date: "2026-10-01", pax: { adults: 1, children: 0 } })).rejects.toThrow(/já passou/);
  });

  it("reserva: bloqueio com o preço do servidor, confirmação com a nossa referência e códigos de entrada", async () => {
    const f = fake();
    const a = createTueAdapter(cfg, { transport: f.transport });
    const r = await a.book(item(), ctx);
    const res = f.calls.find((c) => c.method === "POST" && c.path === "/reservations")!;
    expect(res.body).toEqual({
      data: {
        reservation: {
          reservation_distributor_id: "501",
          reservation_external_reference: "SUB47-1",
          reservation_details: [
            {
              booking_external_reference: "SUB47-1",
              product_id: "P-COL",
              product_availability_id: "S-1100",
              product_type_details: [
                { product_type: "ADULT", product_type_id: "T-AD", product_type_count: 2 },
                { product_type: "CHILD", product_type_id: "T-CH", product_type_count: 1 },
              ],
            },
          ],
          reservation_contacts: [{ contact_type: "BOOKER", contact_name_first: "Maria da", contact_name_last: "Silva", contact_email: "maria@cliente.com.br", contact_phone: "+5511988881111" }],
        },
      },
    });
    const ord = f.calls.find((c) => c.method === "POST" && c.path === "/orders")!;
    expect(ord.body).toEqual({
      data: {
        order: {
          order_distributor_id: "501",
          order_external_reference: "SUB47-1",
          order_language: "pt",
          order_options: { email_options: { email_types: { send_tickets: false } } },
          order_bookings: [{ booking_option_type: "CONFIRM_RESERVATION", reservation_reference: "RES-1" }],
        },
      },
    });
    expect(ord.headers["Idempotency-Key"]).toBe("subrinho-ord-SUB47-1");
    expect(r).toMatchObject({ bookingRef: "ORDRREF123456", status: "CONFIRMED", payload: { quotedCost: "44.00", costBasis: "resale", bookedPrice: "46.00", codeFormat: "QR_CODE" } });
    expect(r.payload.codes).toEqual(ticketCodes(ORDER));
    expect((r.payload.codes as unknown[]).length).toBe(3);
    // procura pela nossa referência ANTES de reservar
    expect(f.calls.findIndex((c) => c.method === "GET" && c.path.startsWith("/orders?"))).toBeLessThan(f.calls.findIndex((c) => c.method === "POST" && c.path === "/reservations"));
  });

  it("nunca duplica: pedido com a nossa referência já existe", async () => {
    const f = fake({ existing: true });
    const a = createTueAdapter(cfg, { transport: f.transport });
    expect((await a.book(item(), ctx)).bookingRef).toBe("ORDRREF123456");
    expect(f.calls.some((c) => c.method === "POST" && c.path !== "/oauth2/token")).toBe(false);
  });

  it("não reserva: acima do custo vendido, dados extras obrigatórios ou preço do servidor maior", async () => {
    const f = fake();
    const a = createTueAdapter(cfg, { transport: f.transport });
    await expect(a.book(item({ maxCost: { currency: "EUR", amount: "40.0000" } }), ctx)).rejects.toThrow(/aumentou o preço \(EUR 44.00 > vendido 40.00\)/);
    expect(f.calls.some((c) => c.path === "/reservations")).toBe(false);

    const g = fake({ checkoutRequired: true });
    await expect(createTueAdapter(cfg, { transport: g.transport }).book(item(), ctx)).rejects.toThrow(/exige dados extras \(PASSPORT_NUMBER\)/);
    expect(g.calls.some((c) => c.method === "DELETE" && c.path.startsWith("/reservations/RES-1"))).toBe(true);
    expect(g.calls.some((c) => c.method === "POST" && c.path === "/orders")).toBe(false);

    const h = fake({ serverTotal: "60.00" });
    await expect(createTueAdapter(cfg, { transport: h.transport }).book(item(), ctx)).rejects.toThrow(/preço do fornecedor mudou \(EUR 60.00\)/);
    expect(h.calls.some((c) => c.method === "DELETE" && c.path.startsWith("/reservations/RES-1"))).toBe(true);
  });

  it("sem resposta na confirmação: procura o pedido pela referência antes de falhar", async () => {
    const f = fake({ orderTimeout: true });
    const a = createTueAdapter(cfg, { transport: f.transport });
    expect((await a.book(item(), ctx)).bookingRef).toBe("ORDRREF123456");
  });

  it("status, voucher (códigos) e cancelamento", async () => {
    const f = fake();
    const a = createTueAdapter(cfg, { transport: f.transport });
    expect((await a.bookingStatus!("ORDRREF123456")).status).toBe("CONFIRMED");
    expect(await a.voucher!("ORDRREF123456")).toMatchObject({ tickets: { codeFormat: "QR_CODE", codes: [{ code: "1539762088951995" }, { code: "1539762088951996" }, { code: "1539762088951997" }] } });
    await expect(a.cancelBooking!("ORDRREF123456", { simulate: true })).rejects.toThrow(/não simula/);
    const c = await a.cancelBooking!("ORDRREF123456", { simulate: false });
    expect(c.status).toBe("CANCELLED");
    expect(f.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/orders/ORDRREF123456?cancellation_reason=Cancelado+pela+ag%C3%AAncia" });
  });
});
