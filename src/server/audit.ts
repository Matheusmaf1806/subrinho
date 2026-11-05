/**
 * Histórico de alterações: quem mudou o quê e quando (margens, cupons, preços no checkout, emissões,
 * marca e endereço da loja, usuários, repasses, configurações, notas fiscais). Painel Subrinho ›
 * Histórico mostra tudo; o Painel do Afiliado mostra o que é da própria loja.
 */
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { DB, Tx } from "@/server/db";
import { auditLog } from "@/server/db/schema";

export type AuditActor = { type: "SUBRINHO" | "AFFILIATE" | "CUSTOMER" | "SYSTEM"; id?: string | null; name?: string | null; /** Agência do ator (para travar o acesso às coisas da própria loja). */ affiliateId?: string | null };

export type AuditInput = {
  actor: AuditActor;
  action: string;
  summary: string;
  affiliateId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
};

async function currentIp(): Promise<string | null> {
  try {
    const { requestMeta } = await import("@/server/auth/session");
    return (await requestMeta()).ip;
  } catch {
    return null; // fora de uma requisição (cron, scripts)
  }
}

export async function recordAudit(tx: Tx, a: AuditInput): Promise<void> {
  try {
    await tx.insert(auditLog).values({
      actorType: a.actor.type,
      actorId: a.actor.id ?? null,
      actorName: a.actor.name?.slice(0, 120) ?? null,
      affiliateId: a.affiliateId ?? null,
      action: a.action.slice(0, 80),
      entity: a.entity ?? null,
      entityId: a.entityId ?? null,
      summary: a.summary.slice(0, 500),
      data: a.data ?? {},
      ip: await currentIp(),
    });
  } catch (e) {
    console.error("[histórico] não gravou:", e instanceof Error ? e.message : e);
  }
}

/** Diferença legível entre dois objetos (só os campos que mudaram). */
export function changes<T extends Record<string, unknown>>(before: Partial<T> | null | undefined, after: Partial<T>, keys?: (keyof T)[]) {
  const out: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of keys ?? (Object.keys(after) as (keyof T)[])) {
    const a = before?.[k] ?? null;
    const b = after[k] ?? null;
    if (String(a ?? "") !== String(b ?? "")) out[String(k)] = { de: a, para: b };
  }
  return out;
}

export async function listAudit(db: DB, f: { affiliateId?: string | null; q?: string | null; limit?: number; offset?: number } = {}) {
  const conds: SQL[] = [];
  if (f.affiliateId) conds.push(eq(auditLog.affiliateId, f.affiliateId));
  if (f.q?.trim()) {
    const q = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(auditLog.summary, q), ilike(auditLog.actorName, q), ilike(auditLog.action, q), ilike(auditLog.entityId, q))!);
  }
  return db
    .select()
    .from(auditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0);
}

/**
 * Registra a ação bem-sucedida de um painel usando a própria mensagem de sucesso como resumo e
 * devolve o mesmo estado (para usar direto no `return` da Server Action).
 */
export async function audited<S extends { ok?: boolean; message?: string } | null>(
  db: Tx,
  actor: AuditActor,
  action: string,
  state: S,
  ctx: { affiliateId?: string | null; entity?: string | null; entityId?: string | null; data?: Record<string, unknown> } = {},
): Promise<S> {
  if (state?.ok) await recordAudit(db, { actor, action, summary: state.message ?? action, ...ctx });
  return state;
}
