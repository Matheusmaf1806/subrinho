/** Indicadores do Painel Subrinho (somente leitura). */
import { and, asc, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, fortnightReports, orders, payouts } from "@/server/db/schema";
import { addDays, startOfLocalDay, todayLocal } from "@/lib/tz";
import { fortnightOf, lastDayOfMonth, type Fortnight } from "@/server/payouts/calendar";
import { d, money } from "@/server/pricing/money";

export type Kpis = {
  orders: number;
  gmv: string;
  totalPix: string;
  costBrl: string;
  subrinhoRevenue: string;
  affiliateCommission: string;
  discounts: string;
  subrinhoDiscount: string;
  affiliateDiscount: string;
  avgTicket: string;
};

/** KPIs das vendas PAGAS entre duas datas locais (inclusive), pela data do pagamento. */
export async function paidKpis(tx: Tx, fromDate: string, toDate: string): Promise<Kpis> {
  const from = startOfLocalDay(fromDate);
  const to = startOfLocalDay(addDays(toDate, 1));
  const [r] = await tx
    .select({
      orders: sql<number>`count(*)::int`,
      gmv: sql<string>`coalesce(sum(${orders.amountCharged}), 0)::text`,
      totalPix: sql<string>`coalesce(sum(${orders.totalPix}), 0)::text`,
      costBrl: sql<string>`coalesce(sum(${orders.totalCostBrl}), 0)::text`,
      subrinhoRevenue: sql<string>`coalesce(sum(${orders.subrinhoRevenue}), 0)::text`,
      affiliateCommission: sql<string>`coalesce(sum(${orders.affiliateCommission}), 0)::text`,
      subrinhoDiscount: sql<string>`coalesce(sum(${orders.totalSubrinhoDiscount}), 0)::text`,
      affiliateDiscount: sql<string>`coalesce(sum(${orders.totalAffiliateDiscount}), 0)::text`,
    })
    .from(orders)
    .where(and(eq(orders.status, "PAID"), gte(orders.paidAt, from), lt(orders.paidAt, to)));
  const n = r?.orders ?? 0;
  const gmv = d(r?.gmv ?? 0);
  return {
    orders: n,
    gmv: money(gmv),
    totalPix: money(r?.totalPix ?? 0),
    costBrl: money(r?.costBrl ?? 0),
    subrinhoRevenue: money(r?.subrinhoRevenue ?? 0),
    affiliateCommission: money(r?.affiliateCommission ?? 0),
    subrinhoDiscount: money(r?.subrinhoDiscount ?? 0),
    affiliateDiscount: money(r?.affiliateDiscount ?? 0),
    discounts: money(d(r?.subrinhoDiscount ?? 0).plus(d(r?.affiliateDiscount ?? 0))),
    avgTicket: money(n ? gmv.div(n) : 0),
  };
}

export function currentPeriods(today = todayLocal()): { today: string; fortnight: Fortnight; month: { start: string; end: string } } {
  const [y, m] = today.split("-").map(Number);
  return {
    today,
    fortnight: fortnightOf(today),
    month: { start: `${y}-${String(m).padStart(2, "0")}-01`, end: lastDayOfMonth(y, m) },
  };
}

/** Repasses agendados (ainda não pagos), do mais próximo ao mais distante. */
export async function upcomingPayouts(tx: Tx, limit = 8) {
  return tx
    .select({
      id: payouts.id,
      affiliateId: payouts.affiliateId,
      affiliateName: affiliates.name,
      periodStart: payouts.periodStart,
      periodEnd: payouts.periodEnd,
      scheduledDate: payouts.scheduledDate,
      ordersCount: payouts.ordersCount,
      amount: payouts.amount,
    })
    .from(payouts)
    .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
    .where(eq(payouts.status, "SCHEDULED"))
    .orderBy(asc(payouts.scheduledDate), asc(affiliates.name))
    .limit(limit);
}

/** Previsão: vendas pagas que ainda não entraram em nenhum repasse (quinzena em aberto). */
export async function openPayoutForecast(tx: Tx) {
  return tx
    .select({
      affiliateId: orders.affiliateId,
      affiliateName: affiliates.name,
      payoutDate: orders.payoutDate,
      orders: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${orders.affiliateCommission}), 0)::text`,
      gross: sql<string>`coalesce(sum(${orders.amountCharged}), 0)::text`,
    })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(and(eq(orders.status, "PAID"), isNull(orders.payoutId)))
    .groupBy(orders.affiliateId, affiliates.name, orders.payoutDate)
    .orderBy(asc(orders.payoutDate), asc(affiliates.name));
}

export async function fortnightReportFor(tx: Tx, periodStart: string) {
  const [r] = await tx
    .select({ id: fortnightReports.id, generatedAt: fortnightReports.generatedAt })
    .from(fortnightReports)
    .where(eq(fortnightReports.periodStart, periodStart));
  return r ?? null;
}

export async function pendingPaymentCount(tx: Tx): Promise<number> {
  const [r] = await tx.select({ n: count() }).from(orders).where(eq(orders.status, "PENDING_PAYMENT"));
  return r?.n ?? 0;
}
