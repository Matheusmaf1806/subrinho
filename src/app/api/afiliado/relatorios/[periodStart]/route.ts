/**
 * Relatório de quinzena (CSV) do afiliado logado.
 * Somente as vendas DESTE afiliado, sem custo, câmbio ou margem Subrinho.
 */
import { db } from "@/server/db";
import { currentAffiliateUser } from "@/server/auth/session";
import { fortnightOf } from "@/server/payouts/calendar";
import { fortnightCsvForAffiliate } from "@/server/payouts/service";

export async function GET(_req: Request, ctx: { params: Promise<{ periodStart: string }> }) {
  const session = await currentAffiliateUser();
  if (!session) return new Response("Não autorizado", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });

  const { periodStart } = await ctx.params;
  // Início de quinzena: dia 01 ou 16 de um mês válido.
  if (!/^\d{4}-(0[1-9]|1[0-2])-(01|16)$/.test(periodStart)) {
    return new Response("Período inválido", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const f = fortnightOf(periodStart);
  const csv = await fortnightCsvForAffiliate(db, f, session.affiliate.id);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="relatorio-quinzena-${f.start}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
