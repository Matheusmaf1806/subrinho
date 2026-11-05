/**
 * Monitoramento sem serviço externo: erros da aplicação (onRequestError, em src/instrumentation.ts),
 * falhas de fornecedor (busca, página do produto, emissão) e e-mails que não saíram ficam na tabela
 * error_events. A equipe vê tudo em Painel Subrinho › Monitoramento e recebe alerta por e-mail:
 *  - fornecedor: 3 falhas em 15 minutos → alerta (no máximo 1 a cada 6 h por fornecedor);
 *  - erro da aplicação: 1º erro de cada rota → alerta (no máximo 1 a cada 6 h por rota).
 */
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { DB, Tx } from "@/server/db";
import { alertState, authTokens, conversionEvents, emailOutbox, errorEvents, loginAttempts } from "@/server/db/schema";
import { appUrl } from "@/server/store-links";

export type ErrorInput = { source: "request" | "supplier" | "email" | "cron" | "conversion"; key: string; message: string; code?: string | null; path?: string | null; digest?: string | null; data?: Record<string, unknown> };

const SUPPLIER_WINDOW_MIN = 15;
const SUPPLIER_THRESHOLD = 3;
const ALERT_EVERY_H = 6;

/** Uma gravação por assunto a cada 20 s por instância: um fornecedor fora do ar não lota o banco. */
const recent = new Map<string, number>();
function throttled(k: string, ms = 20_000) {
  const now = Date.now();
  const last = recent.get(k) ?? 0;
  if (now - last < ms) return true;
  recent.set(k, now);
  if (recent.size > 500) for (const [key, t] of recent) if (now - t > ms) recent.delete(key);
  return false;
}

export async function recordError(db: Tx, e: ErrorInput): Promise<void> {
  if (throttled(`${e.source}|${e.key}|${e.code ?? ""}`)) return;
  try {
    await db.insert(errorEvents).values({
      source: e.source,
      key: e.key.slice(0, 200),
      message: e.message.slice(0, 1500),
      code: e.code?.slice(0, 80) ?? null,
      path: e.path?.slice(0, 500) ?? null,
      digest: e.digest ?? null,
      data: e.data ?? {},
    });
    await maybeAlert(db, e);
  } catch (err) {
    // o monitoramento nunca derruba a página (ex.: banco fora do ar)
    console.error("[monitoramento] não gravou o erro:", err instanceof Error ? err.message : err);
  }
}

/** Grava o envio do alerta só se o último foi há mais de `hours` (atômico). */
async function claimAlert(db: Tx, key: string, hours = ALERT_EVERY_H): Promise<boolean> {
  const res = await db.execute(sql`
    INSERT INTO ${alertState} (key, last_sent_at, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET last_sent_at = now(), count = ${alertState.count} + 1
    WHERE ${alertState.lastSentAt} < now() - make_interval(hours => ${hours})
    RETURNING key`);
  return ((res as unknown as { rows: unknown[] }).rows ?? []).length > 0;
}

async function maybeAlert(db: Tx, e: ErrorInput) {
  if (e.source === "email") return; // alerta de e-mail por e-mail não chega: fica só no painel
  const { sendToTeam } = await import("@/server/email/notify");
  if (e.source === "supplier") {
    const since = new Date(Date.now() - SUPPLIER_WINDOW_MIN * 60_000);
    const [{ n }] = await db
      .select({ n: count() })
      .from(errorEvents)
      .where(and(eq(errorEvents.source, "supplier"), eq(errorEvents.key, e.key), gte(errorEvents.createdAt, since)));
    if (n < SUPPLIER_THRESHOLD || !(await claimAlert(db, `supplier:${e.key}`))) return;
    await sendToTeam(db, "alerts", "alert.supplier", null, {
      title: `Fornecedor com falhas: ${e.key}`,
      paragraphs: [
        `${n} falhas nos últimos ${SUPPLIER_WINDOW_MIN} minutos. Enquanto isso, a loja mostra "Não conseguimos consultar agora" para esse fornecedor.`,
        `Última falha${e.code ? ` (código ${e.code})` : ""}: ${e.message}`,
      ],
      cta: { label: "Abrir o monitoramento", url: `${appUrl()}/subrinho/monitoramento` },
      note: `Próximo aviso deste fornecedor só daqui a ${ALERT_EVERY_H} horas, se continuar falhando.`,
    });
    return;
  }
  if (!(await claimAlert(db, `${e.source}:${e.key}`))) return;
  await sendToTeam(db, "alerts", `alert.${e.source}`, null, {
    title: `Erro na plataforma: ${e.key}`,
    paragraphs: [e.message, ...(e.path ? [`Endereço: ${e.path}`] : []), ...(e.digest ? [`Digest: ${e.digest}`] : [])],
    cta: { label: "Abrir o monitoramento", url: `${appUrl()}/subrinho/monitoramento` },
    note: `Próximo aviso deste erro só daqui a ${ALERT_EVERY_H} horas.`,
  });
}

/** Falha de fornecedor (busca, produto, cotação, emissão). Erros de negócio (destino inválido etc.) não contam. */
export async function recordSupplierFailure(db: Tx, supplierCode: string, error: unknown, where: string) {
  const { SupplierError, SupplierIntegrationError } = await import("@/server/suppliers/types");
  if (error instanceof SupplierError && !(error instanceof SupplierIntegrationError)) return;
  const { failureCode } = await import("@/server/suppliers/failure-code");
  await recordError(db, {
    source: "supplier",
    key: supplierCode,
    code: failureCode(error),
    message: error instanceof Error ? error.message : String(error),
    data: { where },
  });
}

// ───────────── Painel ─────────────

export async function supplierHealth(db: DB, hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db
    .select({ key: errorEvents.key, n: count(), last: sql<Date>`max(${errorEvents.createdAt})` })
    .from(errorEvents)
    .where(and(eq(errorEvents.source, "supplier"), gte(errorEvents.createdAt, since)))
    .groupBy(errorEvents.key);
  const out = [];
  for (const r of rows) {
    const [lastEv] = await db
      .select()
      .from(errorEvents)
      .where(and(eq(errorEvents.source, "supplier"), eq(errorEvents.key, r.key)))
      .orderBy(desc(errorEvents.createdAt))
      .limit(1);
    out.push({ supplier: r.key, failures: Number(r.n), lastAt: new Date(r.last), lastCode: lastEv?.code ?? null, lastMessage: lastEv?.message ?? "" });
  }
  return out.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export async function recentErrors(db: DB, opts: { source?: string; limit?: number } = {}) {
  return db
    .select()
    .from(errorEvents)
    .where(opts.source ? eq(errorEvents.source, opts.source) : undefined)
    .orderBy(desc(errorEvents.createdAt))
    .limit(opts.limit ?? 50);
}

export async function emailStats(db: DB, hours = 24 * 7) {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db.select({ status: emailOutbox.status, n: count() }).from(emailOutbox).where(gte(emailOutbox.createdAt, since)).groupBy(emailOutbox.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
}

/** Limpeza diária: erros com mais de 30 dias, tentativas de login com mais de 7, tokens vencidos. */
export async function cleanupOldRecords(db: DB, now = new Date()) {
  const day = 86400_000;
  await db.delete(errorEvents).where(lt(errorEvents.createdAt, new Date(now.getTime() - 30 * day)));
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now.getTime() - 7 * day)));
  await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date(now.getTime() - day)));
}

export async function conversionStats(db: DB, hours = 24 * 7) {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db.select({ status: conversionEvents.status, n: count() }).from(conversionEvents).where(gte(conversionEvents.createdAt, since)).groupBy(conversionEvents.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
}
