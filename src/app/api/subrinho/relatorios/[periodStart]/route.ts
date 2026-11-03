import { db } from "@/server/db";
import { currentSubrinhoUser } from "@/server/auth/session";
import { fortnightOf } from "@/server/payouts/calendar";
import { fortnightCsvForSubrinho } from "@/server/payouts/service";

/** CSV completo da quinzena (conta de cada item) — somente equipe Subrinho. */
export async function GET(_req: Request, { params }: { params: Promise<{ periodStart: string }> }) {
  const user = await currentSubrinhoUser();
  if (!user) return new Response("Não autorizado", { status: 401 });

  const { periodStart } = await params;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(periodStart) && new Date(`${periodStart}T12:00:00Z`).toISOString().slice(0, 10) === periodStart;
  if (!valid) return new Response("Data inválida (use AAAA-MM-DD)", { status: 400 });

  const f = fortnightOf(periodStart);
  const csv = await fortnightCsvForSubrinho(db, f);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subrinho-quinzena-${f.start}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
