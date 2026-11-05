/**
 * Fila de e-mails (tabela email_outbox). `queueEmail` grava dentro da transação do evento (se a
 * transação desfaz, o e-mail some junto) e agenda o envio para depois da resposta. `flushEmails` pega
 * os pendentes com trava (FOR UPDATE SKIP LOCKED, nunca dois envios do mesmo e-mail) e manda pelo
 * provedor, com novas tentativas espaçadas. O cron diário reenvia o que ficou para trás.
 */
import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, type DB, type Tx } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";
import { emailConfig, resendSender, type EmailSender } from "./provider";

export type QueueInput = {
  kind: string;
  to: string;
  toName?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  affiliateId?: string | null;
  orderId?: string | null;
  /** Mesma chave = mesmo e-mail: a segunda tentativa de enfileirar é ignorada. */
  dedupeKey?: string | null;
};

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const normalizeEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
export const isEmail = (e: string | null | undefined) => EMAIL.test(normalizeEmail(e)) && !normalizeEmail(e).endsWith(".invalid");

/** Espera entre tentativas (min): 1, 5, 30, 120; na 5ª falha o e-mail fica como FAILED. */
const BACKOFF_MIN = [1, 5, 30, 120];
export const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

export async function queueEmail(tx: Tx, m: QueueInput): Promise<string | null> {
  const to = normalizeEmail(m.to);
  if (!isEmail(to)) return null;
  const [row] = await tx
    .insert(emailOutbox)
    .values({
      kind: m.kind,
      toEmail: to,
      toName: m.toName?.trim() || null,
      fromName: m.fromName?.trim() || null,
      replyTo: m.replyTo && isEmail(m.replyTo) ? normalizeEmail(m.replyTo) : null,
      subject: m.subject.slice(0, 250),
      html: m.html,
      text: m.text,
      affiliateId: m.affiliateId ?? null,
      orderId: m.orderId ?? null,
      dedupeKey: m.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id });
  if (row) scheduleFlush();
  return row?.id ?? null;
}

/** Envia depois da resposta (a transação do evento já terminou). Fora de uma requisição, o cron envia. */
export function scheduleFlush() {
  try {
    after(() => flushEmails(getDb()).catch((e) => console.error("[email] envio:", e)));
  } catch {
    /* fora de uma requisição (scripts, testes): o próximo envio ou o cron pega */
  }
}

type Claimed = { id: string; to_email: string; to_name: string | null; from_name: string | null; reply_to: string | null; subject: string; html: string; text: string; attempts: number; kind: string };

export async function flushEmails(db: DB, opts: { sender?: EmailSender | null; limit?: number; now?: Date } = {}) {
  const cfg = emailConfig();
  const sender = opts.sender !== undefined ? opts.sender : cfg ? resendSender(cfg) : null;
  const limit = opts.limit ?? 25;
  const res = await db.execute(sql`
    UPDATE ${emailOutbox} SET status = 'SENDING', claimed_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM ${emailOutbox}
      WHERE (status = 'PENDING' AND next_attempt_at <= now())
         OR (status = 'SENDING' AND claimed_at < now() - interval '10 minutes')
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, to_email, to_name, from_name, reply_to, subject, html, text, attempts, kind`);
  const rows = (res as unknown as { rows: Claimed[] }).rows ?? [];
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    if (!sender) {
      await db
        .update(emailOutbox)
        .set({ status: "SKIPPED", lastError: "Envio de e-mail desligado: configure RESEND_API_KEY e EMAIL_FROM na Vercel" })
        .where(eq(emailOutbox.id, r.id));
      if (process.env.NODE_ENV !== "production") console.info(`[email] (não enviado, sem provedor) ${r.kind} → ${r.to_email}: ${r.subject}`);
      continue;
    }
    const out = await sender({ id: r.id, to: r.to_email, toName: r.to_name, fromName: r.from_name, replyTo: r.reply_to, subject: r.subject, html: r.html, text: r.text });
    if (out.ok) {
      sent++;
      await db.update(emailOutbox).set({ status: "SENT", sentAt: new Date(), providerId: out.providerId, lastError: null }).where(eq(emailOutbox.id, r.id));
      continue;
    }
    failed++;
    const giveUp = !out.retry || r.attempts >= MAX_ATTEMPTS;
    await db
      .update(emailOutbox)
      .set({
        status: giveUp ? "FAILED" : "PENDING",
        lastError: out.error.slice(0, 500),
        nextAttemptAt: new Date((opts.now ?? new Date()).getTime() + (BACKOFF_MIN[Math.min(r.attempts - 1, BACKOFF_MIN.length - 1)] ?? 120) * 60_000),
      })
      .where(eq(emailOutbox.id, r.id));
    if (giveUp) {
      const { recordError } = await import("@/server/monitoring");
      await recordError(db, { source: "email", key: r.kind, message: `E-mail não enviado para ${r.to_email}: ${out.error}`, code: "EMAIL" }).catch(() => undefined);
    }
  }
  return { claimed: rows.length, sent, failed, skipped: sender ? 0 : rows.length };
}

/**
 * Reenvio manual (Painel Subrinho): cria uma cópia nova na fila (id novo = o provedor trata como outra
 * mensagem; repetir o mesmo id seria ignorado pela chave de idempotência).
 */
export async function requeueEmail(db: DB, id: string): Promise<string | null> {
  const [m] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
  if (!m) return null;
  return queueEmail(db, {
    kind: m.kind,
    to: m.toEmail,
    toName: m.toName,
    fromName: m.fromName,
    replyTo: m.replyTo,
    subject: m.subject,
    html: m.html,
    text: m.text,
    affiliateId: m.affiliateId,
    orderId: m.orderId,
  });
}
