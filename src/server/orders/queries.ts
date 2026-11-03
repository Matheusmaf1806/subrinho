/**
 * Leitura de pedidos.
 * - Painel Subrinho: vê TUDO.
 * - Painel do Afiliado: vê apenas o que é dele (valor pago, margem/comissão dele, repasse).
 *   NUNCA expõe custo, câmbio, margem/NET Subrinho ou dados do fornecedor.
 */
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, affiliateUsers, carts, cartViews, customers, orderEvents, orderItems, orders } from "@/server/db/schema";
import { startOfLocalDay, addDays } from "@/lib/tz";

export type OrderFilters = {
  status?: string;
  affiliateId?: string;
  q?: string;
  from?: string; // YYYY-MM-DD (data de criação, fuso SP)
  to?: string;
  limit?: number;
  offset?: number;
};

function filterConds(f: OrderFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.status && f.status !== "ALL") conds.push(eq(orders.status, f.status as never));
  if (f.affiliateId) conds.push(eq(orders.affiliateId, f.affiliateId));
  if (f.from) conds.push(gte(orders.createdAt, startOfLocalDay(f.from)));
  if (f.to) conds.push(lt(orders.createdAt, startOfLocalDay(addDays(f.to, 1))));
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    const digits = f.q.replace(/\D/g, "");
    const num = Number(digits);
    const ors: SQL[] = [
      sql`${orders.customerData}->>'name' ilike ${q}`,
      sql`${orders.customerData}->>'email' ilike ${q}`,
      sql`${orders.payerData}->>'name' ilike ${q}`,
      sql`${orders.payerData}->>'email' ilike ${q}`,
    ];
    if (digits.length >= 3) {
      // CPF/CNPJ com ou sem pontuação
      const dq = `%${digits}%`;
      ors.push(sql`regexp_replace(coalesce(${orders.payerData}->>'document', ''), '[^0-9]', '', 'g') like ${dq}`);
      ors.push(sql`regexp_replace(coalesce(${orders.customerData}->>'document', ''), '[^0-9]', '', 'g') like ${dq}`);
    }
    if (num > 0 && num <= 2147483647) ors.push(eq(orders.number, num));
    conds.push(or(...ors)!);
  }
  return conds;
}

// ───────────── Subrinho ─────────────

export async function listOrdersForSubrinho(tx: Tx, f: OrderFilters) {
  const conds = filterConds(f);
  return tx
    .select({ order: orders, affiliateName: affiliates.name })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);
}

export async function getOrderForSubrinho(tx: Tx, orderId: string) {
  const [row] = await tx
    .select({ order: orders, affiliate: affiliates, cart: carts })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .innerJoin(carts, eq(carts.id, orders.cartId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const [items, events, views, creator] = await Promise.all([
    tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    tx.select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.createdAt)),
    tx.select().from(cartViews).where(eq(cartViews.cartId, row.cart.id)).orderBy(desc(cartViews.viewedAt)).limit(200),
    cartCreator(tx, row.cart),
  ]);
  return { ...row, items, events, views, creator };
}

async function cartCreator(tx: Tx, cart: typeof carts.$inferSelect) {
  if (cart.createdByCustomerId) {
    const [c] = await tx.select({ name: customers.name, email: customers.email }).from(customers).where(eq(customers.id, cart.createdByCustomerId));
    return c ? { type: "Cliente", ...c } : null;
  }
  if (cart.createdByAffiliateUserId) {
    const [u] = await tx.select({ name: affiliateUsers.name, email: affiliateUsers.email }).from(affiliateUsers).where(eq(affiliateUsers.id, cart.createdByAffiliateUserId));
    return u ? { type: "Agência", ...u } : null;
  }
  return null;
}

// ───────────── Afiliado ─────────────

export type AffiliateOrderRow = {
  id: string;
  number: number;
  status: string;
  createdAt: Date;
  cartCreatedAt: Date;
  cartViews: number;
  paidAt: Date | null;
  customerName: string;
  payerName: string;
  paymentMethod: string;
  installments: number;
  amountPaid: string;
  commission: string;
  payoutDate: string | null;
  payoutStatus: string | null;
};

export async function listOrdersForAffiliate(tx: Tx, affiliateId: string, f: OrderFilters): Promise<AffiliateOrderRow[]> {
  const conds = filterConds({ ...f, affiliateId });
  const rows = await tx
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      createdAt: orders.createdAt,
      cartCreatedAt: orders.cartCreatedAt,
      cartViews: carts.viewCount,
      paidAt: orders.paidAt,
      customerData: orders.customerData,
      payerData: orders.payerData,
      paymentMethod: orders.paymentMethod,
      installments: orders.installments,
      amountCharged: orders.amountCharged,
      commission: orders.affiliateCommission,
      payoutDate: orders.payoutDate,
      payoutId: orders.payoutId,
    })
    .from(orders)
    .innerJoin(carts, eq(carts.id, orders.cartId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);
  const payoutIds = rows.map((r) => r.payoutId).filter(Boolean) as string[];
  const payoutStatus = new Map<string, string>();
  if (payoutIds.length) {
    const ps = await tx.execute<{ id: string; status: string }>(
      sql`select id, status from payouts where id in (${sql.join(payoutIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
    );
    for (const p of ps.rows) payoutStatus.set(p.id, p.status);
  }
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    createdAt: r.createdAt,
    cartCreatedAt: r.cartCreatedAt,
    cartViews: r.cartViews,
    paidAt: r.paidAt,
    customerName: r.customerData.name,
    payerName: r.payerData.name,
    paymentMethod: r.paymentMethod,
    installments: r.installments,
    amountPaid: r.amountCharged,
    commission: r.commission,
    payoutDate: r.payoutDate,
    payoutStatus: r.payoutId ? payoutStatus.get(r.payoutId) ?? null : null,
  }));
}

export type AffiliateOrderItemView = {
  id: string;
  category: string;
  title: string;
  subtitle: string | null;
  location: string | null;
  serviceDate: string | null;
  serviceEndDate: string | null;
  pax: unknown;
  /** Linhas só com quantidade e descrição (sem custo do fornecedor). */
  lines: { label: string; quantity: number }[];
  pricePaid: string;
  pricePix: string;
  priceInstallment: string;
  affiliateMarginPct: string;
  affiliateMarginSource: string;
  affiliateDiscount: string;
  effectiveAffiliateMarginPct: string;
  commission: string;
  bookingRef: string | null;
  bookingStatus: string | null;
};

/** Visão do pedido para o afiliado — lista branca de campos. */
export async function getOrderForAffiliate(tx: Tx, affiliateId: string, orderId: string) {
  const [row] = await tx
    .select({ order: orders, cart: carts })
    .from(orders)
    .innerJoin(carts, eq(carts.id, orders.cartId))
    .where(and(eq(orders.id, orderId), eq(orders.affiliateId, affiliateId)));
  if (!row) return null;
  const { order, cart } = row;
  const [items, views, creator, payout] = await Promise.all([
    tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    tx
      .select({ viewedAt: cartViews.viewedAt, page: cartViews.page, viewerType: cartViews.viewerType, visitorId: cartViews.visitorId })
      .from(cartViews)
      .where(eq(cartViews.cartId, cart.id))
      .orderBy(desc(cartViews.viewedAt))
      .limit(100),
    cartCreator(tx, cart),
    order.payoutId
      ? tx.execute<{ status: string; scheduled_date: string; paid_at: Date | null }>(sql`select status, scheduled_date, paid_at from payouts where id = ${order.payoutId}::uuid`)
      : null,
  ]);
  const uniqueVisitors = new Set(views.map((v) => v.visitorId ?? `${v.viewerType}`)).size;
  const p = payout?.rows[0];
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    cart: {
      token: cart.token,
      createdAt: cart.createdAt,
      viewCount: cart.viewCount,
      lastViewedAt: cart.lastViewedAt,
      uniqueVisitors,
      createdBy: creator,
      views: views.map((v) => ({ viewedAt: v.viewedAt, page: v.page, viewerType: v.viewerType })),
    },
    customer: order.customerData,
    payer: order.payerData,
    travelers: order.travelers,
    payment: {
      method: order.paymentMethod,
      installments: order.installments,
      amountPaid: order.amountCharged,
      brand: (order.paymentData as { card?: { brand?: string; last4?: string } }).card?.brand ?? null,
      last4: (order.paymentData as { card?: { brand?: string; last4?: string } }).card?.last4 ?? null,
    },
    totals: {
      amountPaid: order.amountCharged,
      totalPix: order.totalPix,
      totalInstallment: order.totalInstallment,
      affiliateDiscount: order.totalAffiliateDiscount,
      commission: order.affiliateCommission,
    },
    coupons: (order.couponsSnapshot as { code: string; layer: string; rule: string; applied: string }[])
      .filter((c) => c.layer === "AFFILIATE")
      .map((c) => ({ code: c.code, rule: c.rule, applied: c.applied })),
    payout: {
      date: order.payoutDate,
      status: p?.status ?? (order.status === "PAID" ? "OPEN" : null),
      paidAt: p?.paid_at ?? null,
    },
    items: items.map<AffiliateOrderItemView>((i) => ({
      id: i.id,
      category: i.category,
      title: i.title,
      subtitle: i.subtitle,
      location: i.location,
      serviceDate: i.serviceDate,
      serviceEndDate: i.serviceEndDate,
      pax: i.pax,
      lines: i.lines.map((l) => ({ label: l.label, quantity: l.quantity })),
      pricePaid: i.chargedAmount,
      pricePix: i.finalPix,
      priceInstallment: i.finalInstallment,
      affiliateMarginPct: i.affiliateMarginPct,
      affiliateMarginSource: i.affiliateMarginSource,
      affiliateDiscount: i.affiliateDiscount,
      effectiveAffiliateMarginPct: i.effectiveAffiliateMarginPct,
      commission: i.affiliateCommission,
      bookingRef: i.supplierBookingRef,
      bookingStatus: i.supplierStatus,
    })),
  };
}

export type AffiliateOrderView = NonNullable<Awaited<ReturnType<typeof getOrderForAffiliate>>>;

/** Carrinhos da loja (para a agência acompanhar acessos e conversão). */
export async function listCartsForAffiliate(tx: Tx, affiliateId: string, opts: { status?: "OPEN" | "CONVERTED"; limit?: number } = {}) {
  const conds = [eq(carts.affiliateId, affiliateId)];
  if (opts.status) conds.push(eq(carts.status, opts.status));
  const rows = await tx
    .select({
      id: carts.id,
      token: carts.token,
      status: carts.status,
      createdAt: carts.createdAt,
      updatedAt: carts.updatedAt,
      viewCount: carts.viewCount,
      lastViewedAt: carts.lastViewedAt,
      createdByType: carts.createdByType,
      customerName: customers.name,
      agentName: affiliateUsers.name,
      items: sql<number>`(select count(*)::int from cart_items ci where ci.cart_id = ${carts.id} and ci.status = 'ACTIVE')`,
    })
    .from(carts)
    .leftJoin(customers, eq(customers.id, carts.createdByCustomerId))
    .leftJoin(affiliateUsers, eq(affiliateUsers.id, carts.createdByAffiliateUserId))
    .where(and(...conds))
    .orderBy(desc(carts.updatedAt))
    .limit(opts.limit ?? 100);
  return rows;
}

export async function orderIdsByNumber(tx: Tx, numbers: number[]) {
  if (!numbers.length) return [];
  return tx.select({ id: orders.id, number: orders.number }).from(orders).where(inArray(orders.number, numbers));
}

export { ilike };
