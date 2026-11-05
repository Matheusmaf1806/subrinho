/**
 * Verificação em duas etapas (app autenticador) da equipe Subrinho e das agências:
 *  - ligar/desligar (segredo cifrado no banco, ligado só depois de confirmar um código);
 *  - segunda etapa do login (cookie de 10 minutos, 5 tentativas por etapa e limite por pessoa);
 *  - cada código vale uma vez só (quem viu o código por cima do ombro não entra com ele).
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import type { DB } from "@/server/db";
import { affiliateUsers, authTokens, sessions, subrinhoUsers } from "@/server/db/schema";
import { randomToken, sha256 } from "@/lib/random";
import { loginBlocked, recordLogin } from "./limits";
import { matchTotp, newTotpSecret, openSecret, sealSecret } from "./totp";

export type MfaRealm = "subrinho" | "afiliado";

const COOKIE: Record<MfaRealm, string> = { subrinho: "sb_subrinho_mfa", afiliado: "sb_afiliado_mfa" };
const PATH: Record<MfaRealm, string> = { subrinho: "/subrinho", afiliado: "/afiliado" };
const USER_TYPE = { subrinho: "SUBRINHO", afiliado: "AFFILIATE" } as const;
const TTL_MS = 10 * 60_000;
export const MFA_MAX_ATTEMPTS = 5;

const table = (realm: MfaRealm) => (realm === "subrinho" ? subrinhoUsers : affiliateUsers);

async function totpOf(db: DB, realm: MfaRealm, userId: string) {
  const t = table(realm);
  const [u] = await db.select({ id: t.id, active: t.active, totpSecret: t.totpSecret, totpEnabledAt: t.totpEnabledAt }).from(t).where(eq(t.id, userId));
  return u ?? null;
}

/** Senha certa e duas etapas ligadas: guarda a etapa pendente e manda para a tela do código. */
export async function beginMfa(db: DB, realm: MfaRealm, userId: string) {
  const token = randomToken();
  await db.insert(authTokens).values({ id: sha256(token), purpose: "MFA", userType: USER_TYPE[realm], userId, expiresAt: new Date(Date.now() + TTL_MS) });
  (await cookies()).set(COOKIE[realm], token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: PATH[realm], maxAge: TTL_MS / 1000 });
}

export async function hasPendingMfa(realm: MfaRealm) {
  return !!(await cookies()).get(COOKIE[realm])?.value;
}

/** Confere um código para a pessoa (limite por pessoa + uso único). Devolve a mensagem de erro, ou null se valeu. */
export async function checkCode(db: DB, realm: MfaRealm, userId: string, sealed: string | null, code: string, ip: string | null): Promise<string | null> {
  if (await loginBlocked(db, "mfa", userId, ip)) return "Muitos códigos errados seguidos. Espere 15 minutos e tente de novo.";
  const secret = openSecret(sealed);
  const step = secret ? matchTotp(secret, code) : null;
  if (step === null) {
    await recordLogin(db, "mfa", userId, ip, false);
    return "Código incorreto. Confira o app autenticador.";
  }
  const [fresh] = await db
    .insert(authTokens)
    // a trava é do código naquela janela (com segredo novo, o código também é outro)
    .values({ id: sha256(`totp:${userId}:${step}:${code.replace(/\D/g, "")}`), purpose: "TOTP_USED", userType: USER_TYPE[realm], userId, expiresAt: new Date(Date.now() + 3 * 60_000) })
    .onConflictDoNothing()
    .returning({ id: authTokens.id });
  if (!fresh) return "Este código já foi usado. Espere o próximo código no app.";
  await recordLogin(db, "mfa", userId, ip, true);
  return null;
}

/** Segunda etapa do login pelo cookie. Devolve o id para abrir a sessão. */
export async function finishMfa(db: DB, realm: MfaRealm, code: string, ip: string | null): Promise<{ userId: string } | { error: string }> {
  const jar = await cookies();
  const token = jar.get(COOKIE[realm])?.value;
  const expired = { error: "A etapa do código venceu. Entre com e-mail e senha de novo." };
  if (!token) return expired;
  const [t] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.id, sha256(token)), eq(authTokens.purpose, "MFA"), eq(authTokens.userType, USER_TYPE[realm]), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  if (!t || t.attempts >= MFA_MAX_ATTEMPTS) return expired;
  const u = await totpOf(db, realm, t.userId);
  if (!u?.active || !u.totpEnabledAt) return expired;
  const err = await checkCode(db, realm, u.id, u.totpSecret, code, ip);
  if (err) {
    await db.update(authTokens).set({ attempts: t.attempts + 1 }).where(eq(authTokens.id, t.id));
    const left = MFA_MAX_ATTEMPTS - t.attempts - 1;
    if (err.startsWith("Código incorreto")) return { error: left > 0 ? `Código incorreto. Confira o app autenticador (${left} tentativa${left > 1 ? "s" : ""}).` : "Código incorreto muitas vezes. Entre com e-mail e senha de novo." };
    return { error: err };
  }
  const [used] = await db.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.id, t.id), isNull(authTokens.usedAt))).returning({ id: authTokens.id });
  if (!used) return expired;
  jar.delete({ name: COOKIE[realm], path: PATH[realm] });
  return { userId: u.id };
}

// ───────────── Ligar / desligar ─────────────

export async function startTotp(db: DB, realm: MfaRealm, userId: string) {
  const t = table(realm);
  await db.update(t).set({ totpSecret: sealSecret(newTotpSecret()) }).where(and(eq(t.id, userId), isNull(t.totpEnabledAt)));
}

export async function confirmTotp(db: DB, realm: MfaRealm, userId: string, code: string, ip: string | null): Promise<string | null> {
  const u = await totpOf(db, realm, userId);
  if (!u || u.totpEnabledAt) return "A verificação em duas etapas já está ligada";
  if (!openSecret(u.totpSecret)) return "Gere o QR Code de novo";
  const err = await checkCode(db, realm, userId, u.totpSecret, code, ip);
  if (err) return err.startsWith("Código incorreto") ? "Código incorreto. Confira se o relógio do celular está certo e digite o código atual." : err;
  const t = table(realm);
  await db.update(t).set({ totpEnabledAt: new Date() }).where(eq(t.id, userId));
  return null;
}

export async function disableTotp(db: DB, realm: MfaRealm, userId: string, code: string, ip: string | null): Promise<string | null> {
  const u = await totpOf(db, realm, userId);
  if (!u?.totpEnabledAt) return "A verificação em duas etapas não está ligada";
  const err = await checkCode(db, realm, userId, u.totpSecret, code, ip);
  if (err) return err;
  const t = table(realm);
  await db.update(t).set({ totpEnabledAt: null, totpSecret: null }).where(eq(t.id, userId));
  return null;
}

/** Celular perdido: quem administra desliga a verificação da pessoa e encerra as sessões dela. */
export async function resetTotp(db: DB, realm: MfaRealm, userId: string) {
  const t = table(realm);
  const [u] = await db.update(t).set({ totpEnabledAt: null, totpSecret: null }).where(eq(t.id, userId)).returning({ id: t.id, name: t.name });
  if (u) await db.delete(sessions).where(and(eq(sessions.userType, USER_TYPE[realm]), eq(sessions.userId, u.id)));
  return u ?? null;
}
