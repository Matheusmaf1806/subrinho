/**
 * Teste de integração (PostgreSQL real). Rode com:
 *   TEST_DATABASE_URL=postgres://subrinho:subrinho@localhost:5432/subrinho_test npm test
 * Sem TEST_DATABASE_URL o teste é ignorado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BookItem, BookContext, BookingResult } from "@/server/suppliers/types";

// Fornecedor "real" de teste (LIVE_TEST) para a emissão controlada de reservas; os demais seguem o registro.
const liveBook = vi.hoisted(() => ({ calls: [] as { item: unknown; ctx: unknown }[], impl: null as null | ((item: unknown) => Promise<unknown>) }));
// MAPRO de verdade (adaptador real) com respostas no formato da API — sem rede.
const mapro = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[], total: "2074.17", created: false, canceled: false }));
vi.mock("@/server/suppliers/registry", async (orig) => {
  const real = await orig<typeof import("@/server/suppliers/registry")>();
  const { SupplierError } = await import("@/server/suppliers/types");
  const fake = {
    code: "LIVE_TEST",
    name: "Hotel de teste",
    category: "LODGING",
    defaultCurrency: "USD",
    live: true,
    destinations: () => [],
    search: async () => [],
    getProduct: async () => null,
    quote: async () => {
      throw new SupplierError("não usado");
    },
    async book(item: BookItem, ctx: BookContext): Promise<BookingResult> {
      liveBook.calls.push({ item, ctx });
      await new Promise((r) => setTimeout(r, 30));
      if (liveBook.impl) return (await liveBook.impl(item)) as BookingResult;
      return { bookingRef: "LIVE-1", status: "CONFIRMED", payload: { hotelConfirmation: "H-1" } };
    },
  };
  const { createMaproAdapter } = await import("@/server/suppliers/mapro/adapter");
  const HOUSE_ID = "01HOUSEAUDIT0000000000001";
  const ULID = "01KHER11D0PP9MQMBCY7SB2DYG";
  const quote = () => ({
    currency: "USD",
    summary: { subtotal: "1875.04", tax_total: "199.13", discount_total: "0.00", grand_total: mapro.total },
    rent: { base_amount: "858.00" },
    services: [
      { name: "Cleaning", base_amount: "700.00" },
      { name: "Handyman", base_amount: "100.00" },
      { name: "Linen", base_amount: "35.00" },
      { name: "Processing Fee", base_amount: "182.04" },
    ],
  });
  const house = { id: HOUSE_ID, alias: "AUD 1", title: { en: "Audit Villa" }, bedrooms: 5, bathrooms: 4, maxOccupancy: 10, propertyType: "house", checkinTime: "16:00:00", checkoutTime: "10:00:00", address: { city: "Kissimmee", state: "FL", fullAddress: "1 Audit Way, Kissimmee, FL", latitude: 28.3, longitude: -81.6 }, amenities: ["amenity_private_pool"], resort: { title: "Windsor Hills" }, mainPhoto: { preview: "https://img.test/a.jpg" }, photos: [{ preview: "https://img.test/a.jpg" }] };
  const reservation = () => ({ propertyId: HOUSE_ID, reservationId: ULID, status: mapro.canceled ? "Canceled" : "Confirmed", isCanceled: mapro.canceled, referenceCode: "6529537", channel: { name: "Website" }, arrival: "", departure: "", doorCode: "4821", wifiName: "Villa", wifiPassword: "magic", currency: "USD", amountTotal: "2070.00" });
  const maproAdapter = createMaproAdapter(
    { token: "t", baseUrl: "https://mapro.test" },
    {
      freeCancelDays: 30,
      transport: async (req) => {
        const u = new URL(req.url);
        const body = req.body ? JSON.parse(req.body) : undefined;
        mapro.calls.push({ method: req.method, path: `${u.pathname}${u.search}`, body });
        const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
        if (u.pathname === "/v1/whoami") return json({ status: 1, integration: "Website", customer_id: "C1", customer_name: "Orlando Homes LLC" });
        if (u.pathname === "/v1/quote") return json({ status: 1, quote: [{ ...house, quote: quote() }], paginanation: { hasNextPage: false } });
        if (u.pathname === `/v1/properties/${HOUSE_ID}`) return json({ status: 1, property: house });
        if (u.pathname === "/v1/reservations" && req.method === "GET") return json({ status: 1, reservations: [] });
        if (u.pathname === "/v1/reservations" && req.method === "POST") {
          mapro.created = true;
          return json({ status: 1, reservation_id: "6529537", reservation_ulid: ULID });
        }
        if (u.pathname === `/v1/reservations/${ULID}` && req.method === "GET") return json({ status: 1, reservation: reservation() });
        if (u.pathname === `/v1/reservations/${ULID}` && req.method === "DELETE") {
          mapro.canceled = true;
          return json({ status: 1, msg: "Reservation #6529537 canceled!", reservation_id: "6529537", reservation_ulid: ULID });
        }
        return json({ error: "not-found", message: `rota inesperada ${req.method} ${u.pathname}` }, 404);
      },
    },
  );
  return {
    ...real,
    getAdapter: (code: string) => (code === "LIVE_TEST" ? fake : code === "MAPRO" ? maproAdapter : real.getAdapter(code)),
    isLiveSupplier: (code: string) => code === "LIVE_TEST" || code === "MAPRO" || real.isLiveSupplier(code),
  };
});
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@/server/db/schema";
import type { DB } from "@/server/db";
import { createAffiliate, createSubrinhoUser } from "@/server/admin/affiliates";
import { upsertMarginRule } from "@/server/admin/margins";
import { createCoupon } from "@/server/admin/coupons";
import { recordFxRate } from "@/server/fx";
import { SUPPLIERS, getAdapter } from "@/server/suppliers/registry";
import { SupplierError, type Quote } from "@/server/suppliers/types";
import { autoIssueOrder, BookingIssueError, cancelItemBooking, issueItemBooking } from "@/server/bookings/service";
import { applyDiscounts, priceItem } from "@/server/pricing/engine";
import { addQuoteToCart, applyCouponToCart, changeItemPax, createCart, loadCartView, setAffiliateMarginOverride, CartError } from "@/server/cart/service";
import { findOrCreateCustomer, markOrderPaid, placeOrder } from "@/server/checkout/service";
import { closeFortnight, affiliateFinancials } from "@/server/payouts/service";
import { fortnightOf } from "@/server/payouts/calendar";
import { getOrderForAffiliate } from "@/server/orders/queries";
import { orderDetailExtras } from "@/server/subrinho/orders";
import { addDays, todayLocal } from "@/lib/tz";
import { PaypalClient, type Transport as PaypalTransport } from "@/server/payments/paypal";
import { capturePaypalCheckout, createPaypalCheckout, handlePaypalWebhook, syncPaypalOrder } from "@/server/payments/paypal-checkout";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("fluxo completo (integração)", () => {
  let pool: pg.Pool;
  let db: DB;
  let affiliateId: string;
  let adminUser: { id: string; affiliateId: string; role: string };
  let staffId: string;

  /** Item com preço fixo idêntico ao exemplo da especificação: US$ 100 × 5. */
  const specQuote = (): Quote => ({
    supplierCode: "NADIO",
    category: "TICKETS",
    productId: "disney-mk",
    optionId: "disney-1d",
    title: "Item do exemplo",
    subtitle: null,
    location: null,
    imageUrl: null,
    serviceDate: addDays(todayLocal(), 30),
    serviceEndDate: null,
    expiresAt: new Date(Date.now() + 30 * 86400_000),
    currency: "USD",
    lines: [{ type: "ADULT", label: "Adulto", unitCost: "100.00", quantity: 5 }],
    pax: { adults: 5, children: 0 },
    paxRules: [],
    details: {},
    quoteRef: "TEST",
  });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    db = drizzle(pool, { schema }) as unknown as DB;
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "./drizzle" });

    await db.insert(schema.suppliers).values(SUPPLIERS.map(({ ref: _ref, ...s }) => s));
    await recordFxRate(db, { currency: "USD", rate: "4.93", source: "test" });
    await recordFxRate(db, { currency: "EUR", rate: "5.40", source: "test" });
    const staff = await createSubrinhoUser(db, { name: "Staff", email: "staff@test.com", password: "12345678", role: "OWNER" });
    staffId = staff.id;
    await upsertMarginRule(db, { owner: "SUBRINHO", scope: "DEFAULT", marginPct: "4.5" }, staff.id);
    const aff = await createAffiliate(db, { name: "Agência Teste", slug: "agencia-teste" }, { name: "Admin", email: "admin@agencia.com", password: "12345678" });
    affiliateId = aff.id;
    const [u] = await db.select().from(schema.affiliateUsers).where(eq(schema.affiliateUsers.affiliateId, aff.id));
    adminUser = u;
    await upsertMarginRule(db, { owner: "AFFILIATE", affiliateId, scope: "DEFAULT", marginPct: "3.7" }, u.id);
    await createCoupon(db, "AFFILIATE", { code: "CEM", discountType: "CONDITIONAL", amountOff: "100", stepAmount: "1000" }, { type: "AFFILIATE", id: u.id, affiliateId });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("carrinho reproduz a conta da especificação", async () => {
    const cart = await createCart(db, affiliateId, { type: "ANONYMOUS" });
    await addQuoteToCart(db, cart, specQuote());
    const view = (await loadCartView(db, cart.token, affiliateId))!;
    expect(view.priced.totals.costBrl.toFixed(2)).toBe("2465.00");
    expect(view.priced.totals.netSubrinho.toFixed(2)).toBe("2581.15");
    expect(view.priced.totals.pix.toFixed(2)).toBe("2680.32");
    expect(view.priced.totals.installment.toFixed(2)).toBe("2967.58");
  });

  it("margem no checkout não aceita valor negativo e vale só para o carrinho", async () => {
    const cart = await createCart(db, affiliateId, { type: "ANONYMOUS" });
    const item = await addQuoteToCart(db, cart, specQuote());
    await expect(setAffiliateMarginOverride(db, cart, item.id, "-1", adminUser)).rejects.toBeInstanceOf(CartError);
    await setAffiliateMarginOverride(db, cart, item.id, "10", adminUser);
    const view = (await loadCartView(db, cart.token, affiliateId))!;
    expect(view.priced.totals.pix.toFixed(2)).toBe("2867.94");
    const other = await createCart(db, affiliateId, { type: "ANONYMOUS" });
    await addQuoteToCart(db, other, specQuote());
    expect((await loadCartView(db, other.token, affiliateId))!.priced.totals.pix.toFixed(2)).toBe("2680.32");
  });

  it("item com data passada é removido e os outros ficam", async () => {
    const cart = await createCart(db, affiliateId, { type: "ANONYMOUS" });
    await addQuoteToCart(db, cart, specQuote());
    const old = await addQuoteToCart(db, cart, { ...specQuote(), title: "Vencido", expiresAt: new Date(Date.now() + 1000) });
    await db.update(schema.cartItems).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.cartItems.id, old.id));
    const view = (await loadCartView(db, cart.token, affiliateId))!;
    expect(view.items).toHaveLength(1);
    expect(view.removedNotices.map((i) => i.title)).toEqual(["Vencido"]);
    expect(view.cart.status).toBe("OPEN");
  });

  it("alterar quantidade busca o preço do fornecedor", async () => {
    const cart = await createCart(db, affiliateId, { type: "ANONYMOUS" });
    const { getAdapter } = await import("@/server/suppliers/registry");
    const q = await getAdapter("NADIO").quote({ productId: "disney-mk", optionId: "disney-1d", date: addDays(todayLocal(), 40), pax: { adults: 2, children: 0 } });
    const item = await addQuoteToCart(db, cart, q);
    const updated = await changeItemPax(db, cart, item.id, { adults: 2, children: 1 });
    expect(updated.lines.map((l) => l.type)).toEqual(["ADULT", "CHILD"]);
  });

  it("pedido pago → repasse agendado → afiliado não vê custo/margem Subrinho", async () => {
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Cliente", email: "c@c.com", document: "52998224725", password: "12345678" });
    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    await addQuoteToCart(db, cart, specQuote());
    await applyCouponToCart(db, cart, "cem"); // R$100 a cada R$1.000 → 2 × 100 = 200, limitado à margem do afiliado (99,17)
    const paidAt = new Date("2026-11-10T15:00:00-03:00");
    const { order } = await placeOrder(db, {
      cart,
      customer,
      payer: { name: "Outra Pessoa", document: "11222333000181", email: "p@p.com" },
      travelers: [{ name: "Cliente" }],
      paymentMethod: "PIX",
      installments: 1,
      revalidate: false,
    });
    const paid = await markOrderPaid(db, order.id, { paidAt });
    expect(paid.status).toBe("PAID");
    expect(paid.totalAffiliateDiscount).toBe("99.17");
    expect(paid.affiliateCommission).toBe("0.00");
    expect(paid.totalPix).toBe("2581.15");
    expect(paid.payoutDate).toBe("2026-11-23");

    const view = await getOrderForAffiliate(db, affiliateId, order.id);
    const json = JSON.stringify(view);
    for (const forbidden of ["costBrl", "costForeign", "fxRate", "netSubrinho", "subrinhoMargin", "subrinhoRevenue", "supplierPayload", "supplierCode"]) {
      expect(json).not.toContain(forbidden);
    }
    expect(view!.payer.name).toBe("Outra Pessoa");
    expect(view!.customer.name).toBe("Cliente");

    const r = await closeFortnight(db, fortnightOf("2026-11-10"), { type: "CRON" });
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0].scheduledDate).toBe("2026-11-23");
    const fin = await affiliateFinancials(db, affiliateId);
    expect(fin.scheduled).toHaveLength(1);
  });

  it("hotel de fornecedor real: pago → aguardando emissão → emissão única, com referência e teto de custo", async () => {
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Hóspede", email: "h@h.com", password: "12345678" });
    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    await addQuoteToCart(db, cart, {
      ...specQuote(),
      supplierCode: "LIVE_TEST",
      category: "LODGING",
      productId: "862326",
      optionId: "opt-1",
      title: "Hotel real",
      serviceDate: addDays(todayLocal(), 60),
      serviceEndDate: addDays(todayLocal(), 63),
      lines: [{ type: "STAY", label: "Hospedagem", unitCost: "184.88", quantity: 1 }],
      pax: { adults: 2, children: 1, childrenAges: [7], rooms: 1 },
    });
    const travelers = [
      { name: "Maria da Silva", type: "ADULT" as const, title: "MRS" as const },
      { name: "João Silva", type: "ADULT" as const },
      { name: "Pedro Silva", type: "CHILD" as const, age: 7 },
    ];
    const { order } = await placeOrder(db, { cart, customer, payer: { name: "Maria da Silva", email: "h@h.com" }, travelers, paymentMethod: "PIX", installments: 1, revalidate: false });
    const [item] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));

    // antes do pagamento: não emite
    await expect(issueItemBooking(item.id, { type: "SUBRINHO", name: "Staff" }, db)).rejects.toBeInstanceOf(BookingIssueError);

    liveBook.calls.length = 0;
    await markOrderPaid(db, order.id, { paidAt: new Date(), ref: "PIX-REAL-1", data: { gateway: "test" } });
    const [awaiting] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, item.id));
    expect(awaiting.supplierStatus).toBe("AWAITING_ISSUE");
    expect(liveBook.calls).toHaveLength(0); // pagamento confirmado NÃO reserva sozinho

    // emissão automática desligada (SUPPLIER_BOOKING=manual): só a equipe emite
    await autoIssueOrder(order.id, db);
    expect(liveBook.calls).toHaveLength(0);

    // duas pessoas clicando ao mesmo tempo → uma reserva só
    const results = await Promise.allSettled([
      issueItemBooking(item.id, { type: "SUBRINHO", name: "Staff A" }, db),
      issueItemBooking(item.id, { type: "SUBRINHO", name: "Staff B" }, db),
    ]);
    expect(liveBook.calls).toHaveLength(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(BookingIssueError);

    const sent = liveBook.calls[0] as { item: BookItem; ctx: BookContext };
    expect(sent.item.reference).toBe(`SUB${order.number}-1`);
    expect(sent.item.maxCost).toEqual({ currency: "USD", amount: "184.8800" });
    expect(sent.item.serviceEndDate).toBe(addDays(todayLocal(), 63));
    expect(sent.ctx.travelers.map((t) => t.type)).toEqual(["ADULT", "ADULT", "CHILD"]);

    const [done] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, item.id));
    expect(done).toMatchObject({ supplierStatus: "CONFIRMED", supplierBookingRef: "LIVE-1" });
    expect(done.supplierPayload).toMatchObject({ reference: `SUB${order.number}-1`, hotelConfirmation: "H-1", issuedBy: expect.any(String) });

    // de novo: já reservado, não chama o fornecedor
    const again = await issueItemBooking(item.id, { type: "SUBRINHO", name: "Staff" }, db);
    expect(again.status).toBe("CONFIRMED");
    expect(liveBook.calls).toHaveLength(1);

    const events = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id));
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["BOOKING_PENDING", "BOOKING_REQUESTED", "BOOKING_CONFIRMED"]));
  });

  it("falha do fornecedor fica registrada e permite tentar de novo", async () => {
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Outro", email: "o@o.com", password: "12345678" });
    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    await addQuoteToCart(db, cart, { ...specQuote(), supplierCode: "LIVE_TEST", category: "LODGING", productId: "1", optionId: "o", serviceDate: addDays(todayLocal(), 30), serviceEndDate: addDays(todayLocal(), 32), lines: [{ type: "STAY", label: "H", unitCost: "100.00", quantity: 1 }], pax: { adults: 1, children: 0, rooms: 1 } });
    const { order } = await placeOrder(db, { cart, customer, payer: { name: "Outro Nome", email: "o@o.com" }, travelers: [{ name: "Outro Nome" }], paymentMethod: "PIX", installments: 1, revalidate: false });
    await markOrderPaid(db, order.id, { paidAt: new Date() });
    const [item] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    liveBook.impl = async () => {
      throw new SupplierError("O fornecedor aumentou o preço: USD 120.00 (vendido por 100.0000)");
    };
    const r1 = await issueItemBooking(item.id, { type: "SUBRINHO", name: "Staff" }, db);
    expect(r1.status).toBe("BOOKING_FAILED");
    expect(r1.message).toContain("aumentou o preço");
    liveBook.impl = null;
    const r2 = await issueItemBooking(item.id, { type: "SUBRINHO", name: "Staff" }, db);
    expect(r2.status).toBe("CONFIRMED");
  });

  /**
   * Auditoria da cobrança de um hotel com preço mínimo de venda: cotação → carrinho → margem
   * alterada pelo ADMIN → cupons das duas camadas → pedido → pagamento → repasse, conferindo cada
   * valor gravado com um recálculo independente.
   */
  it("auditoria casas (MAPRO real): cotação → margem alterada → cupons → checkout → pago → emissão → voucher → cancelamento", async () => {
    await createCoupon(db, "SUBRINHO", { code: "CASA50", discountType: "FIXED", amountOff: "50", categories: ["HOUSES"] }, { type: "SUBRINHO", id: staffId });
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Maria da Silva", email: "maria@casa.com", phone: "(11) 98888-1111", password: "12345678" });
    const checkIn = addDays(todayLocal(), 60);
    const checkOut = addDays(todayLocal(), 65);
    const q = await getAdapter("MAPRO").quote({ productId: "01HOUSEAUDIT0000000000001", checkIn, checkOut, pax: { adults: 4, children: 2 } });
    expect(q.lines.reduce((t, l) => t + Number(l.unitCost) * l.quantity, 0).toFixed(2)).toBe("2074.17");

    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    const item = await addQuoteToCart(db, cart, q);
    await setAffiliateMarginOverride(db, cart, item.id, "8", adminUser);
    await applyCouponToCart(db, cart, "casa50");
    const view = (await loadCartView(db, cart.token, affiliateId))!;
    const quotesBefore = mapro.calls.filter((c) => c.path.startsWith("/v1/quote")).length;
    const { order } = await placeOrder(db, {
      cart,
      customer,
      payer: { name: "Maria da Silva", email: "maria@casa.com" },
      travelers: [{ name: "Maria da Silva" }, { name: "João Silva" }],
      paymentMethod: "PIX",
      installments: 1,
    });
    // o checkout consultou a administradora de novo (preço igual → segue)
    expect(mapro.calls.filter((c) => c.path.startsWith("/v1/quote")).length).toBeGreaterThan(quotesBefore);
    const paid = await markOrderPaid(db, order.id, { paidAt: new Date() });
    const [oi] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));

    // valores gravados = recálculo independente; custo = total da administradora
    expect(oi.costCurrency).toBe("USD");
    expect(Number(oi.costForeign)).toBe(2074.17);
    expect(oi.costBrl).toBe("10225.66"); // 2.074,17 × 4,93
    expect(oi.affiliateMarginPct).toBe("8.0000");
    expect(oi.affiliateMarginSource).toBe("OVERRIDE");
    expect(oi.subrinhoDiscount).toBe("50.00");
    const base = priceItem({ costCurrency: oi.costCurrency, lines: oi.lines, fxRate: oi.fxRate, subrinhoMarginPct: oi.subrinhoMarginPct, affiliateMarginPct: oi.affiliateMarginPct, installmentFeePct: oi.installmentFeePct });
    const f = applyDiscounts(base, { subrinho: oi.subrinhoDiscount, affiliate: oi.affiliateDiscount });
    expect(f.finalPix.toFixed(2)).toBe(oi.finalPix);
    expect(f.subrinhoRevenue.toFixed(2)).toBe(oi.subrinhoRevenue);
    expect(f.affiliateCommission.toFixed(2)).toBe(oi.affiliateCommission);
    expect(view.priced.totals.pix.toFixed(2)).toBe(paid.totalPix); // o carrinho mostrou o que foi cobrado
    expect(paid.amountCharged).toBe(oi.finalPix);
    expect(oi.details).toMatchObject({ cancellation: expect.stringMatching(/^Cancelamento grátis até/), propertyManager: "Orlando Homes LLC", checkinTime: "16h" });

    // pago → aguardando emissão (nada é reservado sozinho)
    expect(oi.supplierStatus).toBe("AWAITING_ISSUE");
    expect(mapro.created).toBe(false);

    // emissão: reserva na administradora com o hóspede responsável e o teto de custo vendido
    const r = await issueItemBooking(oi.id, { type: "SUBRINHO", id: staffId, name: "Staff" }, db);
    expect(r).toMatchObject({ status: "CONFIRMED", bookingRef: "6529537" });
    const post = mapro.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ property_id: "01HOUSEAUDIT0000000000001", checkin: checkIn, checkout: checkOut, coupon: "", guest: { first_name: "Maria da", last_name: "Silva", email: "maria@casa.com", phone: "+5511988881111", state_code: "BR" } });
    const [issued] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, oi.id));
    expect(issued.supplierPayload).toMatchObject({ reservationUlid: "01KHER11D0PP9MQMBCY7SB2DYG", referenceCode: "6529537", voucher: { access: { doorCode: "4821", wifiName: "Villa", wifiPassword: "magic" } } });
    // emitir de novo não reserva outra vez
    await issueItemBooking(oi.id, { type: "SUBRINHO", id: staffId, name: "Staff" }, db);
    expect(mapro.calls.filter((c) => c.method === "POST")).toHaveLength(1);

    // cancelamento pelo painel usa o ULID gravado
    const c = await cancelItemBooking(oi.id, { id: staffId, name: "Staff" }, { simulate: false }, db);
    expect(c.status).toBe("CANCELLED");
    expect(mapro.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/v1/reservations/01KHER11D0PP9MQMBCY7SB2DYG" });
    const events = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id));
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["BOOKING_REQUESTED", "BOOKING_CONFIRMED", "BOOKING_CANCELLED"]));
    // a página do pedido no Painel Subrinho abre depois da emissão/cancelamento e mostra quem fez
    const [fullOrder] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    const extras = await orderDetailExtras(db, fullOrder, items, events as { data: Record<string, unknown> }[]);
    expect(extras.staffNames.get(staffId)).toBe("Staff");
    // eventos antigos (nome no lugar do id) também não quebram a página
    await expect(orderDetailExtras(db, fullOrder, items, [{ data: { by: "Equipe Subrinho" } }])).resolves.toBeTruthy();

    // a agência não vê custo, margem Subrinho nem dados do fornecedor (códigos de acesso ficam no voucher do cliente)
    const aff = JSON.stringify(await getOrderForAffiliate(db, affiliateId, order.id));
    for (const forbidden of ["costBrl", "netSubrinho", "supplierPayload", "doorCode", "reservationUlid"]) expect(aff).not.toContain(forbidden);
  });

  it("pagamento simulado (sem gateway) nunca vira reserva real no fornecedor", async () => {
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Teste Simulado", email: "sim@casa.com", phone: "11955554444", password: "12345678" });
    const q = await getAdapter("MAPRO").quote({ productId: "01HOUSEAUDIT0000000000001", checkIn: addDays(todayLocal(), 80), checkOut: addDays(todayLocal(), 84), pax: { adults: 2, children: 0 } });
    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    await addQuoteToCart(db, cart, q);
    const { order } = await placeOrder(db, { cart, customer, payer: { name: "Teste Simulado", email: "sim@casa.com" }, travelers: [{ name: "Teste Simulado" }], paymentMethod: "PIX", installments: 1 });
    await markOrderPaid(db, order.id, { paidAt: new Date(), data: { simulated: true } });
    const [oi] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    const posts = mapro.calls.filter((c) => c.method === "POST").length;
    await expect(issueItemBooking(oi.id, { type: "SUBRINHO", id: staffId, name: "Staff" }, db)).rejects.toThrow(/Pagamento simulado/);
    await autoIssueOrder(order.id, db);
    expect(mapro.calls.filter((c) => c.method === "POST").length).toBe(posts);
    const { bookingsNeedingAction } = await import("@/server/bookings/service");
    expect((await bookingsNeedingAction(db, 100)).items.some((x) => x.itemId === oi.id)).toBe(false);
    // sem dinheiro real, sem repasse ao afiliado
    const r = await closeFortnight(db, fortnightOf(todayLocal()), { type: "CRON" });
    const [after] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after.payoutId).toBeNull();
    expect(r.summary.totals.orders).toBeGreaterThanOrEqual(0);
  });

  it("casas: administradora subiu o preço depois do pagamento → não reserva e registra o motivo", async () => {
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Carla Souza", email: "carla@casa.com", phone: "11977776666", password: "12345678" });
    mapro.total = "2074.17";
    mapro.calls.length = 0;
    const q = await getAdapter("MAPRO").quote({ productId: "01HOUSEAUDIT0000000000001", checkIn: addDays(todayLocal(), 70), checkOut: addDays(todayLocal(), 74), pax: { adults: 2, children: 0 } });
    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    await addQuoteToCart(db, cart, q);
    const { order } = await placeOrder(db, { cart, customer, payer: { name: "Carla Souza", email: "carla@casa.com" }, travelers: [{ name: "Carla Souza" }], paymentMethod: "PIX", installments: 1 });
    await markOrderPaid(db, order.id, { paidAt: new Date() });
    const [oi] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    mapro.total = "2150.00";
    const r = await issueItemBooking(oi.id, { type: "SUBRINHO", id: staffId, name: "Staff" }, db);
    expect(r.status).toBe("BOOKING_FAILED");
    expect(r.message).toMatch(/aumentou o preço \(USD 2150.00 > vendido 2074.17\)/);
    expect(mapro.calls.some((c) => c.method === "POST")).toBe(false);
    mapro.total = "2074.17";
  });

  it("auditoria: hotel com preço mínimo + override de margem + cupons, do carrinho ao banco", async () => {
    await createCoupon(db, "SUBRINHO", { code: "SUB30", discountType: "FIXED", amountOff: "30", categories: ["LODGING"] }, { type: "SUBRINHO", id: staffId });
    await createCoupon(db, "AFFILIATE", { code: "HOTEL2", discountType: "PERCENT", percentOff: "2" }, { type: "AFFILIATE", id: adminUser.id, affiliateId });
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Auditoria", email: "audit@a.com", password: "12345678" });

    async function buy(overridePct: string) {
      const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
      const item = await addQuoteToCart(db, cart, {
        ...specQuote(),
        supplierCode: "LIVE_TEST",
        category: "LODGING",
        productId: "3424",
        optionId: "o1",
        title: "Hotel com piso",
        serviceDate: addDays(todayLocal(), 50),
        serviceEndDate: addDays(todayLocal(), 53),
        lines: [{ type: "STAY", label: "Hospedagem", unitCost: "400.00", quantity: 1 }],
        pax: { adults: 2, children: 0, rooms: 1 },
        // US$ 460 × 4,93 = R$ 2.267,80 de preço mínimo
        details: { minSellPrice: { currency: "USD", amount: "460.00" }, rateKeys: ["k1"] },
      });
      await setAffiliateMarginOverride(db, cart, item.id, overridePct, adminUser);
      // cupom que não tem o que descontar (sem folga até o piso) é recusado com mensagem clara
      const coupons: Record<string, string> = {};
      for (const code of ["sub30", "hotel2"])
        coupons[code] = await applyCouponToCart(db, cart, code).then(
          () => "ok",
          (e: Error) => e.message,
        );
      const view = (await loadCartView(db, cart.token, affiliateId))!;
      const { order } = await placeOrder(db, { cart, customer, payer: { name: "Auditoria Teste", email: "audit@a.com" }, travelers: [{ name: "Auditoria Teste" }, { name: "Outra Pessoa" }], paymentMethod: "PIX", installments: 1, revalidate: false });
      const paid = await markOrderPaid(db, order.id, { paidAt: new Date("2026-11-20T10:00:00-03:00") });
      const [oi] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
      return { view, paid, oi, coupons };
    }

    const check = (oi: typeof schema.orderItems.$inferSelect) => {
      // recálculo independente a partir do que foi gravado
      const base = priceItem({ costCurrency: oi.costCurrency, lines: oi.lines, fxRate: oi.fxRate, subrinhoMarginPct: oi.subrinhoMarginPct, affiliateMarginPct: oi.affiliateMarginPct, installmentFeePct: oi.installmentFeePct });
      const f = applyDiscounts(base, { subrinho: oi.subrinhoDiscount, affiliate: oi.affiliateDiscount });
      expect(f.costBrl.toFixed(2)).toBe(oi.costBrl);
      expect(f.netSubrinho.toFixed(2)).toBe(oi.netSubrinho);
      expect(f.netAffiliate.toFixed(2)).toBe(oi.netAffiliate);
      expect(f.finalPix.toFixed(2)).toBe(oi.finalPix);
      expect(f.finalInstallment.toFixed(2)).toBe(oi.finalInstallment);
      expect(f.subrinhoRevenue.toFixed(2)).toBe(oi.subrinhoRevenue);
      expect(f.affiliateCommission.toFixed(2)).toBe(oi.affiliateCommission);
      expect(oi.chargedAmount).toBe(oi.finalPix); // Pix
      expect(Number(oi.finalPix)).toBeGreaterThanOrEqual(2267.8); // nunca abaixo do preço mínimo
    };

    // 1) ADMIN sobe a margem para 10%: o piso não prende; cupons limitados à folga até o piso
    const a = await buy("10");
    expect(a.oi.costBrl).toBe("1972.00");
    expect(a.oi.subrinhoMarginPct).toBe("4.5000"); // margem da regra
    expect(a.oi.affiliateMarginPct).toBe("10.0000");
    expect(a.oi.affiliateMarginSource).toBe("OVERRIDE");
    expect(a.oi.netAffiliate).toBe("2294.36");
    expect(a.oi.subrinhoDiscount).toBe("26.56"); // R$ 30 pedidos, folga de R$ 26,56 até o piso
    expect(a.oi.affiliateDiscount).toBe("0.00"); // sem folga para o cupom do afiliado
    expect(a.coupons).toEqual({ sub30: "ok", hotel2: "Este cupom não tem desconto disponível para os itens deste carrinho" });
    expect(a.oi.finalPix).toBe("2267.80");
    check(a.oi);
    expect(a.oi.details).toMatchObject({ priceFloor: { minPixBrl: "2267.80", applied: false } });
    expect(a.paid.totalPix).toBe(a.oi.finalPix);
    expect(a.paid.amountCharged).toBe("2267.80");
    expect(a.paid.payoutDate).toBeTruthy();
    expect(a.view.priced.totals.pix.toFixed(2)).toBe("2267.80"); // o carrinho mostrou o que foi cobrado

    // 2) ADMIN zera a própria margem: a margem Subrinho sobe só o necessário para respeitar o piso
    const b = await buy("0");
    expect(Number(b.oi.subrinhoMarginPct)).toBeGreaterThan(4.5);
    expect(b.oi.affiliateCommission).toBe("0.00");
    expect(b.oi.subrinhoDiscount).toBe("0.00");
    expect(b.coupons.sub30).toBe("Este cupom não tem desconto disponível para os itens deste carrinho");
    expect(b.oi.finalPix).toBe("2267.80");
    expect(b.oi.details).toMatchObject({ priceFloor: { minPixBrl: "2267.80", applied: true, ruleSubrinhoPct: "4.5000" } });
    check(b.oi);

    // 3) a agência não vê custo, margem Subrinho, piso nem dados internos do fornecedor
    const view = await getOrderForAffiliate(db, affiliateId, b.paid.id);
    const json = JSON.stringify(view);
    for (const forbidden of ["costBrl", "fxRate", "netSubrinho", "subrinhoMargin", "priceFloor", "minSellPrice", "rateKeys", "supplierCode", "supplierPayload"]) expect(json).not.toContain(forbidden);
    expect(view!.items[0].commission).toBe("0.00");
  });
  // ───────────── PayPal (gateway real, com PayPal falso — sem rede) ─────────────

  /** PayPal falso: pedidos em memória, captura com tarifa; `amount` força valor capturado diferente. */
  function fakePaypal(o: { amount?: string; declineOnce?: boolean; captureStatus?: string } = {}) {
    const calls: { method: string; path: string; body?: string }[] = [];
    const store = new Map<string, Record<string, any>>();
    let n = 0;
    const transport: PaypalTransport = async (req) => {
      const u = new URL(req.url);
      calls.push({ method: req.method, path: u.pathname, body: req.body });
      const json = (v: unknown, status = 200) => ({ status, body: JSON.stringify(v) });
      if (u.pathname === "/v1/oauth2/token") return json({ access_token: "T", expires_in: 32400 });
      if (u.pathname === "/v2/checkout/orders" && req.method === "POST") {
        const b = JSON.parse(req.body!);
        const id = `PP${++n}`;
        store.set(id, { id, status: "CREATED", purchase_units: [{ ...b.purchase_units[0] }] });
        return json(store.get(id), 201);
      }
      const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
      const ord = m ? store.get(m[1]) : undefined;
      if (!m || !ord) return json({ name: "RESOURCE_NOT_FOUND", details: [{ issue: "INVALID_RESOURCE_ID" }] }, 404);
      if (!m[2]) return json(ord);
      if (o.declineOnce) {
        o.declineOnce = false;
        return json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }] }, 422);
      }
      if (ord.status === "COMPLETED") return json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }, 422);
      const value = o.amount ?? ord.purchase_units[0].amount.value;
      ord.status = "COMPLETED";
      ord.payment_source = { card: { brand: "MASTERCARD", last_digits: "5100" } };
      ord.purchase_units[0].payments = {
        captures: [{ id: `CAP-${m[1]}`, status: o.captureStatus ?? "COMPLETED", amount: { currency_code: "BRL", value }, seller_receivable_breakdown: { paypal_fee: { value: "12.34" }, net_amount: { value: (Number(value) - 12.34).toFixed(2) } } }],
      };
      return json(ord, 201);
    };
    const cfg = { clientId: "cli", clientSecret: "sec", baseUrl: "https://api-m.sandbox.paypal.com", environment: "sandbox" as const, webhookId: null };
    return { calls, store, client: new PaypalClient(cfg, transport), approve: (id: string) => (store.get(id)!.status = "APPROVED") };
  }

  /** Pedido no cartão com o PayPal ligado (credenciais de teste; nenhuma chamada real). */
  async function paypalOrder(email: string) {
    const prev = { ...process.env };
    Object.assign(process.env, { PAYMENT_PROVIDER: "", PAYPAL_CLIENT_ID: "cli", PAYPAL_CLIENT_SECRET: "sec", PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com", PIX_KEY: "" });
    try {
      const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Paula PayPal", email, password: "12345678" });
      const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
      await addQuoteToCart(db, cart, specQuote());
      // sem PIX_KEY o Pix não é oferecido com gateway real
      await expect(placeOrder(db, { cart, customer, payer: { name: "Paula PayPal", email }, travelers: [{ name: "Paula PayPal" }], paymentMethod: "PIX", installments: 1, revalidate: false })).rejects.toThrow(/Pix indisponível/);
      const { order, approved } = await placeOrder(db, { cart, customer, payer: { name: "Paula PayPal", email }, travelers: [{ name: "Paula PayPal" }], paymentMethod: "CARD", installments: 3, revalidate: false });
      return { order, approved, cart, customer };
    } finally {
      for (const k of ["PAYMENT_PROVIDER", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_API_BASE", "PIX_KEY"]) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  }

  it("PayPal: pedido no PayPal com o valor do banco, captura conferida, pago de verdade e idempotente", async () => {
    const { order, approved } = await paypalOrder("paula@paypal.com");
    expect(approved).toBe(false);
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", paymentProvider: "paypal", paymentMethod: "CARD", installments: 10 });
    expect((order.paymentData as { paypal: { status: string } }).paypal.status).toBe("AWAITING_BUYER");

    const pp = fakePaypal({ declineOnce: true });
    const id = await createPaypalCheckout(db, order, { brandName: "Viagens da Ana" }, pp.client);
    const sent = JSON.parse(pp.calls.find((c) => c.path === "/v2/checkout/orders")!.body!);
    expect(sent.purchase_units[0]).toMatchObject({ custom_id: order.id, invoice_id: `SUB${order.number}`, amount: { currency_code: "BRL", value: Number(order.amountCharged).toFixed(2) } });
    expect(JSON.stringify(sent)).not.toMatch(/NADIO|disney/i); // nada do fornecedor no PayPal
    const [o1] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o1.paymentRef).toBe(id);
    // cliente fechou e voltou: reaproveita o mesmo pedido do PayPal
    expect(await createPaypalCheckout(db, o1, { brandName: "Viagens da Ana" }, pp.client)).toBe(id);
    expect(pp.calls.filter((c) => c.path === "/v2/checkout/orders" && c.method === "POST")).toHaveLength(1);

    await expect(capturePaypalCheckout(db, o1, "PP-OUTRO", pp.client)).rejects.toThrow(/não corresponde/);
    expect((await capturePaypalCheckout(db, o1, id, pp.client)).state).toBe("RETRY"); // cartão recusado → escolhe outro na mesma janela
    const r = await capturePaypalCheckout(db, o1, id, pp.client);
    expect(r.state).toBe("PAID");
    const [paid] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(paid).toMatchObject({ status: "PAID", paymentRef: `CAP-${id}` });
    expect(paid.paymentData).toMatchObject({ paypal: { orderId: id, status: "COMPLETED", captureId: `CAP-${id}`, fee: "12.34", method: "Cartão MASTERCARD final 5100" } });
    expect((paid.paymentData as { simulated?: boolean }).simulated).toBeUndefined();
    // de novo (outra aba / webhook): continua pago, sem novo evento PAID
    expect((await capturePaypalCheckout(db, paid, id, pp.client)).state).toBe("PAID");
    expect((await syncPaypalOrder(db, order.id, pp.client))).toBeNull();
    const evs = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id));
    expect(evs.filter((e) => e.type === "PAID")).toHaveLength(1);
    expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["PAYPAL_ORDER_CREATED", "PAYPAL_CAPTURED", "PAID"]));
    // o carrinho virou pedido; o item aguarda emissão normalmente (pagamento real)
    expect(paid.payoutDate).toBeTruthy();
  });

  it("PayPal: valor capturado diferente do pedido → não marca pago e avisa a equipe", async () => {
    const { order } = await paypalOrder("valor@paypal.com");
    const pp = fakePaypal({ amount: "1.00" });
    const id = await createPaypalCheckout(db, order, { brandName: "Loja" }, pp.client);
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    const r = await capturePaypalCheckout(db, o, id, pp.client);
    expect(r.state).toBe("CLOSED");
    const [after] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after.status).toBe("PENDING_PAYMENT");
    const evs = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id));
    expect(evs.find((e) => e.type === "PAYMENT_MISMATCH")?.data).toMatchObject({ reason: expect.stringContaining("BRL 1.00") });
  });

  it("PayPal: aprovado e o cliente fechou a janela → o webhook captura; pedido substituído nunca é capturado", async () => {
    // A: aprovado, sem captura pelo navegador → webhook (só aponta o pedido; o estado vem da API)
    const a = await paypalOrder("janela@paypal.com");
    const pp = fakePaypal();
    const idA = await createPaypalCheckout(db, a.order, { brandName: "Loja" }, pp.client);
    pp.approve(idA);
    const w = await handlePaypalWebhook(db, { id: "WH-1", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: idA } }, pp.client);
    expect(w).toMatchObject({ handled: true, note: "PAID", orderId: a.order.id });
    const [paidA] = await db.select().from(schema.orders).where(eq(schema.orders.id, a.order.id));
    expect(paidA.status).toBe("PAID");

    // evento forjado / desconhecido: nada acontece
    expect((await handlePaypalWebhook(db, { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: "PP-NAO-EXISTE" } } } }, pp.client)).handled).toBe(false);

    // B: cliente abriu o PayPal, voltou ao checkout e gerou outro pedido (B fica cancelado)
    const b = await paypalOrder("troca@paypal.com");
    const idB = await createPaypalCheckout(db, b.order, { brandName: "Loja" }, pp.client);
    await db.update(schema.orders).set({ status: "CANCELLED", cancelledAt: new Date() }).where(eq(schema.orders.id, b.order.id));
    pp.approve(idB);
    expect(await syncPaypalOrder(db, b.order.id, pp.client)).toBeNull();
    expect(pp.calls.some((c) => c.path === `/v2/checkout/orders/${idB}/capture`)).toBe(false);
  });

  it("produto com tarifa zerada no fornecedor não entra no carrinho", async () => {
    const cart = await createCart(db, affiliateId, { type: "ANONYMOUS" });
    await expect(addQuoteToCart(db, cart, { ...specQuote(), lines: [{ type: "ADULT", label: "Adulto", unitCost: "0.00", quantity: 2 }] })).rejects.toThrow(/sem preço/);
    await expect(addQuoteToCart(db, cart, { ...specQuote(), lines: [] })).rejects.toThrow(/sem preço/);
  });

  it("cartão do ambiente de testes (sem gateway) é sempre pagamento simulado", async () => {
    const { customer } = await findOrCreateCustomer(db, affiliateId, { name: "Teste Cartão", email: "cartao@mock.com", password: "12345678" });
    const cart = await createCart(db, affiliateId, { type: "CUSTOMER", id: customer.id });
    await addQuoteToCart(db, cart, specQuote());
    const res = await placeOrder(db, {
      cart,
      customer,
      payer: { name: "Teste Cartão", email: "cartao@mock.com" },
      travelers: [{ name: "Teste Cartão" }],
      paymentMethod: "CARD",
      installments: 2,
      card: { holder: "TESTE", number: "4111111111111111", expiry: "12/30", cvv: "123", installments: 2 },
      revalidate: false,
    });
    expect(res.approved).toBe(true);
    expect(res.order.status).toBe("PAID");
    expect(res.order.paymentProvider).toBe("mock");
    expect((res.order.paymentData as { simulated?: boolean }).simulated).toBe(true);
  });
});
