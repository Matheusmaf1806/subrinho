/** Afiliados — leituras do Painel Subrinho (com indicadores de vendas). */
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, payouts } from "@/server/db/schema";
import { listPayoutProofs } from "@/server/payouts/service";

// Obs.: em selects de uma tabela só o Drizzle não qualifica as colunas (${affiliates.id} vira "id"),
// o que dentro de uma subconsulta apontaria para a tabela interna — por isso a referência explícita.
const AFF_ID = sql.raw(`"affiliates"."id"`);
const paidOrders = sql<number>`(select count(*)::int from orders o where o.affiliate_id = ${AFF_ID} and o.status = 'PAID')`;
const gmv = sql<string>`(select coalesce(sum(o.amount_charged), 0)::text from orders o where o.affiliate_id = ${AFF_ID} and o.status = 'PAID')`;
const commission = sql<string>`(select coalesce(sum(o.affiliate_commission), 0)::text from orders o where o.affiliate_id = ${AFF_ID} and o.status = 'PAID')`;
const subrinhoRevenue = sql<string>`(select coalesce(sum(o.subrinho_revenue), 0)::text from orders o where o.affiliate_id = ${AFF_ID} and o.status = 'PAID')`;
const usersCount = sql<number>`(select count(*)::int from affiliate_users u where u.affiliate_id = ${AFF_ID})`;
const customersCount = sql<number>`(select count(*)::int from customers c where c.affiliate_id = ${AFF_ID})`;

export async function listAffiliatesWithStats(tx: Tx) {
  return tx
    .select({ affiliate: affiliates, paidOrders, gmv, commission, subrinhoRevenue, usersCount })
    .from(affiliates)
    .orderBy(asc(affiliates.name));
}

export async function getAffiliateWithStats(tx: Tx, id: string) {
  const [row] = await tx
    .select({ affiliate: affiliates, paidOrders, gmv, commission, subrinhoRevenue, usersCount, customersCount })
    .from(affiliates)
    .where(eq(affiliates.id, id));
  return row ?? null;
}

export async function affiliatePayouts(tx: Tx, affiliateId: string, limit = 24) {
  const rows = await tx.select().from(payouts).where(eq(payouts.affiliateId, affiliateId)).orderBy(desc(payouts.periodStart)).limit(limit);
  const proofs = await listPayoutProofs(tx, rows.map((r) => r.id));
  return rows.map((p) => ({ ...p, proofs: proofs.filter((f) => f.payoutId === p.id) }));
}
