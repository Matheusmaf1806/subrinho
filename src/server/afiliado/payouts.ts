/**
 * Repasses do afiliado, prontos para exibição (painel e dashboard).
 * Usa somente `affiliateFinancials` e o calendário de repasses.
 */
import type { Tx } from "@/server/db";
import { addDays, todayLocal } from "@/lib/tz";
import { affiliateFinancials, payoutDateForPeriod } from "@/server/payouts/service";
import { fortnightOf, type Fortnight } from "@/server/payouts/calendar";

export type UpcomingPayout = {
  key: string;
  /** OPEN = quinzena ainda não fechada pela Subrinho; SCHEDULED = repasse já agendado. */
  status: "OPEN" | "SCHEDULED";
  periodStart: string | null;
  periodEnd: string | null;
  orders: number;
  grossSales: string;
  amount: string;
  date: string | null;
};

/** Quinzenas recentes (da atual para trás). */
export function recentFortnights(count: number, today = todayLocal()): Fortnight[] {
  const out: Fortnight[] = [];
  let f = fortnightOf(today);
  for (let i = 0; i < count; i++) {
    out.push(f);
    f = fortnightOf(addDays(f.start, -1));
  }
  return out;
}

export async function affiliatePayoutsOverview(tx: Tx, affiliateId: string) {
  const fin = await affiliateFinancials(tx, affiliateId);

  // Vendas pagas ainda sem repasse vinculado: descobre a quinzena pela data de repasse.
  const candidates = recentFortnights(6);
  const dates: string[] = [];
  for (const f of candidates) dates.push(await payoutDateForPeriod(tx, f));
  const byDate = new Map<string, Fortnight>();
  candidates.forEach((f, i) => {
    if (!byDate.has(dates[i])) byDate.set(dates[i], f);
  });

  const upcoming: UpcomingPayout[] = [
    ...fin.open.map<UpcomingPayout>((o) => {
      const f = o.payoutDate ? byDate.get(o.payoutDate) : undefined;
      return {
        key: `open-${o.payoutDate ?? "sem-data"}`,
        status: "OPEN",
        periodStart: f?.start ?? null,
        periodEnd: f?.end ?? null,
        orders: o.orders,
        grossSales: o.gross,
        amount: o.amount,
        date: o.payoutDate,
      };
    }),
    ...fin.scheduled.map<UpcomingPayout>((p) => ({
      key: p.id,
      status: "SCHEDULED",
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      orders: p.ordersCount,
      grossSales: p.grossSales,
      amount: p.amount,
      date: p.scheduledDate,
    })),
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const proofsByPayout = new Map<string, typeof fin.proofs>();
  for (const pr of fin.proofs) proofsByPayout.set(pr.payoutId, [...(proofsByPayout.get(pr.payoutId) ?? []), pr]);

  const received = fin.paid.map((p) => ({ ...p, proofs: proofsByPayout.get(p.id) ?? [] }));

  return { upcoming, received, toReceive: fin.toReceive.toFixed(2), receivedTotal: fin.received.toFixed(2) };
}
