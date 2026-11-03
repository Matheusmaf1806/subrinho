/** Cupons — leituras complementares do Painel Subrinho. */
import { desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, orders } from "@/server/db/schema";

export type CouponSnapshot = {
  id: string;
  code: string;
  layer: "SUBRINHO" | "AFFILIATE";
  rule: string;
  discountType?: string;
  categories?: string[];
  eligibleSubtotal?: string;
  requested?: string;
  applied: string;
  limitedByMargin?: boolean;
};

/** Pedidos em que o cupom foi aplicado (snapshot gravado no pedido). */
export async function couponOrders(tx: Tx, couponId: string, limit = 100) {
  const rows = await tx
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      affiliateName: affiliates.name,
      customerData: orders.customerData,
      amountCharged: orders.amountCharged,
      couponsSnapshot: orders.couponsSnapshot,
    })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(sql`${orders.couponsSnapshot} @> ${JSON.stringify([{ id: couponId }])}::jsonb`)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const snap = (r.couponsSnapshot as CouponSnapshot[]).find((c) => c.id === couponId);
    return { ...r, applied: snap?.applied ?? "0", limitedByMargin: !!snap?.limitedByMargin };
  });
}
