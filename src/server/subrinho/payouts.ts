/** Repasses — leituras do Painel Subrinho (com dados bancários do afiliado para o financeiro). */
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, payouts, subrinhoUsers } from "@/server/db/schema";
import { listPayoutProofs } from "@/server/payouts/service";

export type PayoutFilters = { status?: string; affiliateId?: string; periodStart?: string };

export async function listPayoutsForSubrinho(tx: Tx, f: PayoutFilters, limit = 200) {
  const conds: SQL[] = [];
  if (f.status && f.status !== "ALL") conds.push(eq(payouts.status, f.status as "SCHEDULED" | "PAID" | "CANCELLED"));
  if (f.affiliateId) conds.push(eq(payouts.affiliateId, f.affiliateId));
  if (f.periodStart) conds.push(eq(payouts.periodStart, f.periodStart));
  const rows = await tx
    .select({
      payout: payouts,
      affiliate: {
        id: affiliates.id,
        name: affiliates.name,
        slug: affiliates.slug,
        legalName: affiliates.legalName,
        document: affiliates.document,
        email: affiliates.email,
        pixKey: affiliates.pixKey,
        bankName: affiliates.bankName,
        bankAgency: affiliates.bankAgency,
        bankAccount: affiliates.bankAccount,
      },
      paidByName: subrinhoUsers.name,
    })
    .from(payouts)
    .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
    .leftJoin(subrinhoUsers, eq(subrinhoUsers.id, payouts.paidById))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payouts.scheduledDate), asc(affiliates.name))
    .limit(limit);
  const proofs = await listPayoutProofs(tx, rows.map((r) => r.payout.id));
  return rows.map((r) => ({ ...r, proofs: proofs.filter((p) => p.payoutId === r.payout.id) }));
}

export type PayoutListRow = Awaited<ReturnType<typeof listPayoutsForSubrinho>>[number];

/** Quinzenas que já possuem repasses (para o filtro). */
export async function payoutPeriods(tx: Tx) {
  return tx
    .selectDistinct({ periodStart: payouts.periodStart, periodEnd: payouts.periodEnd })
    .from(payouts)
    .orderBy(desc(payouts.periodStart));
}

export async function payoutExists(tx: Tx, id: string) {
  const [r] = await tx.select({ id: payouts.id, status: payouts.status }).from(payouts).where(eq(payouts.id, id));
  return r ?? null;
}

export async function payoutTotalsByStatus(tx: Tx) {
  return tx
    .select({ status: payouts.status, n: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${payouts.amount}), 0)::text` })
    .from(payouts)
    .groupBy(payouts.status);
}
