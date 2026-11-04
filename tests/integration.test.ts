/**
 * Teste de integração (PostgreSQL real). Rode com:
 *   TEST_DATABASE_URL=postgres://subrinho:subrinho@localhost:5432/subrinho_test npm test
 * Sem TEST_DATABASE_URL o teste é ignorado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BookItem, BookContext, BookingResult } from "@/server/suppliers/types";

// Fornecedor "real" de teste (LIVE_TEST) para a emissão controlada de reservas; os demais seguem o registro.
const liveBook = vi.hoisted(() => ({ calls: [] as { item: unknown; ctx: unknown }[], impl: null as null | ((item: unknown) => Promise<unknown>) }));
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
  return {
    ...real,
    getAdapter: (code: string) => (code === "LIVE_TEST" ? fake : real.getAdapter(code)),
    isLiveSupplier: (code: string) => code === "LIVE_TEST" || real.isLiveSupplier(code),
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
import { SUPPLIERS } from "@/server/suppliers/registry";
import { SupplierError, type Quote } from "@/server/suppliers/types";
import { autoIssueOrder, BookingIssueError, issueItemBooking } from "@/server/bookings/service";
import { addQuoteToCart, applyCouponToCart, changeItemPax, createCart, loadCartView, setAffiliateMarginOverride, CartError } from "@/server/cart/service";
import { findOrCreateCustomer, markOrderPaid, placeOrder } from "@/server/checkout/service";
import { closeFortnight, affiliateFinancials } from "@/server/payouts/service";
import { fortnightOf } from "@/server/payouts/calendar";
import { getOrderForAffiliate } from "@/server/orders/queries";
import { addDays, todayLocal } from "@/lib/tz";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("fluxo completo (integração)", () => {
  let pool: pg.Pool;
  let db: DB;
  let affiliateId: string;
  let adminUser: { id: string; affiliateId: string; role: string };

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

    await db.insert(schema.suppliers).values(SUPPLIERS.map((s) => ({ ...s })));
    await recordFxRate(db, { currency: "USD", rate: "4.93", source: "test" });
    await recordFxRate(db, { currency: "EUR", rate: "5.40", source: "test" });
    const staff = await createSubrinhoUser(db, { name: "Staff", email: "staff@test.com", password: "12345678", role: "OWNER" });
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
    await markOrderPaid(db, order.id, { paidAt: new Date(), data: { simulated: true } });
    const [awaiting] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, item.id));
    expect(awaiting.supplierStatus).toBe("AWAITING_ISSUE");
    expect(liveBook.calls).toHaveLength(0); // pagamento confirmado NÃO reserva sozinho

    // pagamento simulado nunca dispara emissão automática
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
});
