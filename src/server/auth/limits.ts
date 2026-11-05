/**
 * Limite de tentativas (força bruta), guardado no banco (vale para todas as instâncias da Vercel):
 *  - login: 5 erros com o mesmo e-mail em 15 min bloqueiam aquele e-mail por 15 min;
 *    30 erros vindos do mesmo IP em 15 min bloqueiam o IP;
 *  - nova senha: 3 pedidos por e-mail e 10 por IP a cada hora.
 * Login certo apaga os erros daquele e-mail.
 */
import { and, count, eq, gte, min } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";

export const LOGIN_WINDOW_MIN = 15;
export const LOGIN_MAX_PER_ID = 5;
export const LOGIN_MAX_PER_IP = 30;
export const RESET_WINDOW_MIN = 60;
export const RESET_MAX_PER_ID = 3;
export const RESET_MAX_PER_IP = 10;

const norm = (s: string) => s.trim().toLowerCase().slice(0, 200);

async function failures(db: Tx, where: ReturnType<typeof and>, since: Date) {
  const [r] = await db.select({ n: count(), first: min(loginAttempts.createdAt) }).from(loginAttempts).where(and(where, eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)));
  return { n: Number(r?.n ?? 0), first: r?.first ? new Date(r.first) : null };
}

const minutesLeft = (first: Date | null, windowMin: number, now: Date) => Math.max(1, Math.ceil(((first?.getTime() ?? now.getTime()) + windowMin * 60_000 - now.getTime()) / 60_000));

/** Mensagem de bloqueio, ou null se pode tentar. */
export async function loginBlocked(db: Tx, scope: string, identifier: string, ip: string | null, now = new Date()): Promise<string | null> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MIN * 60_000);
  const byId = await failures(db, and(eq(loginAttempts.scope, scope), eq(loginAttempts.identifier, norm(identifier))), since);
  if (byId.n >= LOGIN_MAX_PER_ID)
    return `Muitas tentativas com este e-mail. Tente de novo em ${minutesLeft(byId.first, LOGIN_WINDOW_MIN, now)} min ou use “Esqueci minha senha”.`;
  if (ip) {
    const byIp = await failures(db, and(eq(loginAttempts.ip, ip)), since);
    if (byIp.n >= LOGIN_MAX_PER_IP) return `Muitas tentativas de acesso desta rede. Tente de novo em ${minutesLeft(byIp.first, LOGIN_WINDOW_MIN, now)} min.`;
  }
  return null;
}

export async function recordLogin(db: Tx, scope: string, identifier: string, ip: string | null, success: boolean) {
  const id = norm(identifier);
  if (success) await db.delete(loginAttempts).where(and(eq(loginAttempts.scope, scope), eq(loginAttempts.identifier, id), eq(loginAttempts.success, false)));
  else await db.insert(loginAttempts).values({ scope, identifier: id, ip, success: false });
}

/** Pedido de nova senha: conta como tentativa (sucesso = enviado) e respeita o limite por hora. */
export async function resetBlocked(db: Tx, scope: string, identifier: string, ip: string | null, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - RESET_WINDOW_MIN * 60_000);
  const [byId] = await db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.scope, scope), eq(loginAttempts.identifier, norm(identifier)), gte(loginAttempts.createdAt, since)));
  if (Number(byId?.n ?? 0) >= RESET_MAX_PER_ID) return true;
  if (ip) {
    const [byIp] = await db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.createdAt, since), eq(loginAttempts.success, true)));
    if (Number(byIp?.n ?? 0) >= RESET_MAX_PER_IP) return true;
  }
  return false;
}

export async function recordReset(db: Tx, scope: string, identifier: string, ip: string | null) {
  await db.insert(loginAttempts).values({ scope, identifier: norm(identifier), ip, success: true });
}
