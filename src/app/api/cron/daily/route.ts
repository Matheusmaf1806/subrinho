import { db } from "@/server/db";
import { flushEmails } from "@/server/email/outbox";
import { flushConversions } from "@/server/conversions/meta";
import { sendAbandonedCartReminders } from "@/server/cart/reminders";
import { alertExpiringCertificates, cleanupOldRecords, recordError } from "@/server/monitoring";
import { cronAuthorized } from "../auth";

/**
 * Rotina diária: lembretes de carrinho abandonado, reenvio dos e-mails e das compras para a Meta que
 * ficaram na fila e limpeza
 * dos registros antigos (erros, tentativas de login, tokens vencidos). Agendada em vercel.json.
 */
async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  for (const [name, job] of [
    ["carrinhos", () => sendAbandonedCartReminders(db)],
    ["emails", () => flushEmails(db, { limit: 200 })],
    ["conversoes", () => flushConversions(db, { limit: 200 })],
    ["certificados", () => alertExpiringCertificates(db)],
    ["limpeza", () => cleanupOldRecords(db).then(() => "ok")],
  ] as const) {
    try {
      out[name] = await job();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
      await recordError(db, { source: "cron", key: `daily:${name}`, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json(out);
}

export const GET = handle;
export const POST = handle;
