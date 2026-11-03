import { db } from "@/server/db";
import { fortnightOf, lastClosedFortnight } from "@/server/payouts/calendar";
import { closeFortnight } from "@/server/payouts/service";
import { todayLocal } from "@/lib/tz";
import { cronAuthorized } from "../auth";

/**
 * Fechamento de quinzena. Agende para rodar nos dias 16 e 1º (ex.: "0 6 1,16 * *" UTC = 03h de Brasília).
 * Idempotente: rodar mais de uma vez apenas atualiza o relatório e os repasses ainda não pagos.
 * Opcional: ?date=YYYY-MM-DD fecha a quinzena que contém a data.
 */
async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date");
  const period = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? fortnightOf(date) : lastClosedFortnight(todayLocal());
  const r = await db.transaction((tx) => closeFortnight(tx, period, { type: "CRON" }));
  return Response.json({ period, payoutDate: r.summary.payoutDate, orders: r.summary.totals.orders, payouts: r.payouts.length });
}

export const GET = handle;
export const POST = handle;
