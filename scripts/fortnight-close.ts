// Uso: npm run fortnight:close            → fecha a última quinzena encerrada
//      npm run fortnight:close 2026-11-01 → fecha a quinzena que contém a data
import "./env";
import { closeDb, getDb } from "../src/server/db";
import { fortnightOf, lastClosedFortnight } from "../src/server/payouts/calendar";
import { closeFortnight } from "../src/server/payouts/service";
import { todayLocal } from "../src/lib/tz";

const arg = process.argv[2];
const period = arg ? fortnightOf(arg) : lastClosedFortnight(todayLocal());
const db = getDb();
const r = await db.transaction((tx) => closeFortnight(tx, period, { type: "CRON" }));
console.log(`✔ Quinzena ${period.start} a ${period.end} fechada — ${r.summary.totals.orders} pedidos, ${r.payouts.length} repasses, pagamento em ${r.summary.payoutDate}`);
await closeDb();
