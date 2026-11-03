/** Relatórios de fechamento de quinzena — leituras do Painel Subrinho. */
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, fortnightReports, orders, payouts, subrinhoUsers } from "@/server/db/schema";
import { addDays, startOfLocalDay } from "@/lib/tz";
import type { FortnightSummary } from "@/server/payouts/service";

export async function listReports(tx: Tx, limit = 48) {
  return tx
    .select({
      id: fortnightReports.id,
      periodStart: fortnightReports.periodStart,
      periodEnd: fortnightReports.periodEnd,
      payoutDate: fortnightReports.payoutDate,
      summary: fortnightReports.summary,
      generatedAt: fortnightReports.generatedAt,
      generatedByType: fortnightReports.generatedByType,
      generatedByName: subrinhoUsers.name,
    })
    .from(fortnightReports)
    .leftJoin(subrinhoUsers, eq(subrinhoUsers.id, fortnightReports.generatedById))
    .orderBy(desc(fortnightReports.periodStart))
    .limit(limit)
    .then((rows) => rows.map((r) => ({ ...r, summary: r.summary as unknown as FortnightSummary })));
}

export async function getReport(tx: Tx, id: string) {
  const [r] = await tx
    .select({ report: fortnightReports, generatedByName: subrinhoUsers.name })
    .from(fortnightReports)
    .leftJoin(subrinhoUsers, eq(subrinhoUsers.id, fortnightReports.generatedById))
    .where(eq(fortnightReports.id, id));
  if (!r) return null;
  return { ...r.report, summary: r.report.summary as unknown as FortnightSummary, generatedByName: r.generatedByName };
}

/** Repasses gerados para a quinzena (por afiliado). */
export async function reportPayouts(tx: Tx, periodStart: string) {
  return tx
    .select({ payout: payouts, affiliateName: affiliates.name })
    .from(payouts)
    .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
    .where(eq(payouts.periodStart, periodStart))
    .orderBy(asc(affiliates.name));
}

/** Pedidos pagos na quinzena (mesmo critério do fechamento: data do pagamento, fuso SP). */
export async function reportOrders(tx: Tx, period: { start: string; end: string }) {
  return tx
    .select({
      id: orders.id,
      number: orders.number,
      paidAt: orders.paidAt,
      affiliateName: affiliates.name,
      customerData: orders.customerData,
      paymentMethod: orders.paymentMethod,
      installments: orders.installments,
      amountCharged: orders.amountCharged,
      totalCostBrl: orders.totalCostBrl,
      subrinhoRevenue: orders.subrinhoRevenue,
      affiliateCommission: orders.affiliateCommission,
    })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(
      and(
        eq(orders.status, "PAID"),
        gte(orders.paidAt, startOfLocalDay(period.start)),
        lt(orders.paidAt, startOfLocalDay(addDays(period.end, 1))),
      ),
    )
    .orderBy(asc(orders.paidAt));
}
