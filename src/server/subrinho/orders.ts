/** Pedidos — leituras complementares e ações administrativas do Painel Subrinho. */
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/server/db";
import {
  affiliates,
  affiliateUsers,
  carts,
  customers,
  marginRules,
  orderEvents,
  orders,
  payouts,
  subrinhoUsers,
} from "@/server/db/schema";
import { markOrderPaid } from "@/server/checkout/service";
import { listOrdersForSubrinho, type OrderFilters } from "@/server/orders/queries";
import { addDays, startOfLocalDay } from "@/lib/tz";

export class OrderAdminError extends Error {}

const INT4_MAX = 2147483647;

/**
 * listOrdersForSubrinho, protegido contra buscas com muitos dígitos (ex.: CPF "123.456.789-09").
 * O filtro compartilhado converte os dígitos da busca em nº do pedido (integer) e o Postgres
 * rejeita valores > 2^31−1; nesse caso usamos a mesma consulta sem a comparação por número.
 */
export async function listOrdersSafe(tx: Tx, f: OrderFilters) {
  const digits = Number((f.q ?? "").replace(/\D/g, ""));
  if (!f.q || !Number.isFinite(digits) || digits <= INT4_MAX) return listOrdersForSubrinho(tx, f);
  const conds: SQL[] = [];
  if (f.status && f.status !== "ALL") conds.push(eq(orders.status, f.status as never));
  if (f.affiliateId) conds.push(eq(orders.affiliateId, f.affiliateId));
  if (f.from) conds.push(gte(orders.createdAt, startOfLocalDay(f.from)));
  if (f.to) conds.push(lt(orders.createdAt, startOfLocalDay(addDays(f.to, 1))));
  const q = `%${f.q.trim()}%`;
  conds.push(
    or(
      sql`${orders.customerData}->>'name' ilike ${q}`,
      sql`${orders.customerData}->>'email' ilike ${q}`,
      sql`${orders.customerData}->>'document' ilike ${q}`,
      sql`${orders.payerData}->>'name' ilike ${q}`,
      sql`${orders.payerData}->>'document' ilike ${q}`,
    )!,
  );
  return tx
    .select({ order: orders, affiliateName: affiliates.name })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);
}

export async function affiliateOptions(tx: Tx) {
  return tx
    .select({ id: affiliates.id, name: affiliates.name, slug: affiliates.slug, active: affiliates.active })
    .from(affiliates)
    .orderBy(asc(affiliates.name));
}

/** Status dos repasses vinculados aos pedidos listados. */
export async function payoutsByIds(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { status: string; scheduledDate: string; paidAt: Date | null }>();
  const rows = await tx
    .select({ id: payouts.id, status: payouts.status, scheduledDate: payouts.scheduledDate, paidAt: payouts.paidAt })
    .from(payouts)
    .where(inArray(payouts.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

type OrderRow = typeof orders.$inferSelect;

/** Dados extras para a ficha completa do pedido. */
export async function orderDetailExtras(
  tx: Tx,
  order: OrderRow,
  items: { subrinhoMarginRuleId: string | null; affiliateMarginRuleId: string | null }[],
  events: { data: Record<string, unknown> }[],
) {
  const ruleIds = [...new Set(items.flatMap((i) => [i.subrinhoMarginRuleId, i.affiliateMarginRuleId]).filter((x): x is string => !!x))];
  const staffIds = new Set<string>();
  const manualBy = (order.paymentData as { manualBy?: unknown }).manualBy;
  // "by"/"byId" guardam o id do usuário; eventos antigos guardavam o nome — só ids válidos vão à consulta
  const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  if (isUuid(manualBy)) staffIds.add(manualBy);
  for (const e of events) for (const v of [e.data?.by, e.data?.byId]) if (isUuid(v)) staffIds.add(v);

  const [rules, payout, placedBy, account, staff] = await Promise.all([
    ruleIds.length ? tx.select().from(marginRules).where(inArray(marginRules.id, ruleIds)) : Promise.resolve([]),
    order.payoutId ? tx.select().from(payouts).where(eq(payouts.id, order.payoutId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    order.placedByAffiliateUserId
      ? tx
          .select({ name: affiliateUsers.name, email: affiliateUsers.email, role: affiliateUsers.role })
          .from(affiliateUsers)
          .where(eq(affiliateUsers.id, order.placedByAffiliateUserId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    order.customerId
      ? tx
          .select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone, createdAt: customers.createdAt })
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    staffIds.size
      ? tx.select({ id: subrinhoUsers.id, name: subrinhoUsers.name }).from(subrinhoUsers).where(inArray(subrinhoUsers.id, [...staffIds]))
      : Promise.resolve([]),
  ]);
  return {
    rules: new Map(rules.map((r) => [r.id, r])),
    payout,
    placedBy,
    account,
    staffNames: new Map(staff.map((s) => [s.id, s.name])),
  };
}

async function lockOrder(tx: Tx, orderId: string) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) throw new OrderAdminError("Pedido não encontrado");
  return o;
}

/** Confirmação manual de pagamento (ex.: Pix recebido fora do gateway). */
export async function confirmPaymentManually(tx: Tx, orderId: string, user: { id: string; name: string }, note?: string | null) {
  const o = await lockOrder(tx, orderId);
  if (o.status !== "PENDING_PAYMENT") throw new OrderAdminError("Este pedido não está aguardando pagamento");
  const [cart] = await tx.select({ status: carts.status, convertedOrderId: carts.convertedOrderId }).from(carts).where(eq(carts.id, o.cartId));
  if (cart?.status === "CONVERTED" && cart.convertedOrderId && cart.convertedOrderId !== orderId)
    throw new OrderAdminError("O carrinho deste pedido já foi pago em outro pedido");
  const paid = await markOrderPaid(tx, orderId, { paidAt: new Date(), ref: "manual", data: { manualBy: user.id } });
  await tx.insert(orderEvents).values({ orderId, type: "MANUAL_PAYMENT", data: { by: user.id, byName: user.name, note: note ?? null } });
  return paid;
}

/** Cancela um pedido que ainda aguarda pagamento. */
export async function cancelPendingOrder(tx: Tx, orderId: string, user: { id: string; name: string }, reason?: string | null) {
  const o = await lockOrder(tx, orderId);
  if (o.status !== "PENDING_PAYMENT") throw new OrderAdminError("Só é possível cancelar pedidos que aguardam pagamento");
  const now = new Date();
  await tx.update(orders).set({ status: "CANCELLED", cancelledAt: now }).where(eq(orders.id, orderId));
  await tx.insert(orderEvents).values({
    orderId,
    type: "CANCELLED",
    data: { by: user.id, byName: user.name, reason: reason ?? null, source: "PAINEL_SUBRINHO", cancelledAt: now.toISOString() },
  });
}
