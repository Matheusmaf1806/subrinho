/**
 * "Esqueci minha senha" das três áreas: equipe Subrinho, agência (Painel do Afiliado) e cliente da loja.
 * O link vai por e-mail, vale 1 hora e funciona uma vez; só o hash do token fica no banco. A resposta
 * é sempre a mesma (não revela se o e-mail tem conta). Ao trocar a senha, todas as sessões daquela
 * conta são encerradas.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DB } from "@/server/db";
import { affiliates, affiliateUsers, authTokens, customers, sessions, subrinhoUsers, type UserType } from "@/server/db/schema";
import { randomToken, sha256 } from "@/lib/random";
import { hashPassword } from "./password";
import { recordReset, resetBlocked } from "./limits";
import { sendPasswordReset } from "@/server/email/notify";
import { appUrl, storePublicUrl } from "@/server/store-links";
import { recordAudit } from "@/server/audit";

export type ResetRealm = "subrinho" | "afiliado" | "loja";
type Store = typeof affiliates.$inferSelect;

const RESET_TTL_MS = 60 * 60_000;
const USER_TYPE: Record<ResetRealm, UserType> = { subrinho: "SUBRINHO", afiliado: "AFFILIATE", loja: "CUSTOMER" };
const AREA: Record<ResetRealm, string> = { subrinho: "Painel Subrinho", afiliado: "Painel do Afiliado", loja: "sua conta na loja" };

export class ResetError extends Error {}

export const RESET_SENT_MESSAGE = "Se este e-mail tiver uma conta, enviamos agora um link para criar a nova senha. Confira a caixa de entrada e o spam.";

async function findUser(db: DB, realm: ResetRealm, email: string, store?: Store | null) {
  if (realm === "subrinho") {
    const [u] = await db.select({ id: subrinhoUsers.id, name: subrinhoUsers.name, email: subrinhoUsers.email }).from(subrinhoUsers).where(and(eq(subrinhoUsers.email, email), eq(subrinhoUsers.active, true)));
    return u ?? null;
  }
  if (realm === "afiliado") {
    const [u] = await db
      .select({ id: affiliateUsers.id, name: affiliateUsers.name, email: affiliateUsers.email })
      .from(affiliateUsers)
      .innerJoin(affiliates, eq(affiliates.id, affiliateUsers.affiliateId))
      .where(and(eq(affiliateUsers.email, email), eq(affiliateUsers.active, true), eq(affiliates.active, true)));
    return u ?? null;
  }
  if (!store) return null;
  const [u] = await db.select({ id: customers.id, name: customers.name, email: customers.email }).from(customers).where(and(eq(customers.affiliateId, store.id), eq(customers.email, email), isNull(customers.deletedAt)));
  return u ?? null;
}

export function resetLink(realm: ResetRealm, token: string, store?: Store | null) {
  const qs = `?t=${encodeURIComponent(token)}`;
  if (realm === "loja" && store) return storePublicUrl(store, `/redefinir-senha${qs}`);
  return `${appUrl()}/${realm}/redefinir-senha${qs}`;
}

/** Pede o link. Nunca diz se a conta existe; respeita o limite de pedidos. */
export async function requestPasswordReset(db: DB, p: { realm: ResetRealm; email: string; ip: string | null; store?: Store | null }): Promise<void> {
  const email = p.email.trim().toLowerCase();
  if (!email || email.length > 200) return;
  const scope = `reset:${p.realm}${p.store ? `:${p.store.id}` : ""}`;
  if (await resetBlocked(db, scope, email, p.ip)) return;
  await recordReset(db, scope, email, p.ip);
  const user = await findUser(db, p.realm, email, p.store);
  if (!user) return;
  const token = randomToken();
  await db.transaction(async (tx) => {
    // um link por vez: os anteriores deixam de valer
    await tx.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.purpose, "RESET"), eq(authTokens.userType, USER_TYPE[p.realm]), eq(authTokens.userId, user.id), isNull(authTokens.usedAt)));
    await tx.insert(authTokens).values({ id: sha256(token), purpose: "RESET", userType: USER_TYPE[p.realm], userId: user.id, storeAffiliateId: p.store?.id ?? null, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    await sendPasswordReset(tx, { to: user.email, name: user.name, link: resetLink(p.realm, token, p.store), store: p.store ?? null, area: AREA[p.realm] });
  });
}

/** Confere o link sem gastar (para a página mostrar o formulário ou "link vencido"). */
export async function peekResetToken(db: DB, realm: ResetRealm, token: string, storeId?: string | null) {
  if (!token || token.length > 100) return null;
  const [t] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.id, sha256(token)), eq(authTokens.purpose, "RESET"), eq(authTokens.userType, USER_TYPE[realm]), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  if (!t || (realm === "loja" && t.storeAffiliateId !== (storeId ?? null))) return null;
  return t;
}

/** Troca a senha com o link. Devolve o id do usuário (para já entrar). */
export async function resetPassword(db: DB, p: { realm: ResetRealm; token: string; password: string; confirm: string; storeId?: string | null }): Promise<string> {
  if (p.password !== p.confirm) throw new ResetError("As duas senhas não são iguais");
  if (p.password.length < 8) throw new ResetError("A senha precisa ter ao menos 8 caracteres");
  if (p.password.length > 200) throw new ResetError("Senha longa demais");
  const hash = await hashPassword(p.password);
  return db.transaction(async (tx) => {
    // gasta o token (trava: dois cliques não trocam duas vezes)
    const [t] = await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, sha256(p.token)), eq(authTokens.purpose, "RESET"), eq(authTokens.userType, USER_TYPE[p.realm]), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .returning();
    if (!t || (p.realm === "loja" && t.storeAffiliateId !== (p.storeId ?? null))) throw new ResetError("Este link venceu ou já foi usado. Peça um novo em “Esqueci minha senha”.");
    // conta desativada ou excluída depois do pedido do link: não reabre
    const alive =
      p.realm === "subrinho"
        ? and(eq(subrinhoUsers.id, t.userId), eq(subrinhoUsers.active, true))
        : p.realm === "afiliado"
          ? and(eq(affiliateUsers.id, t.userId), eq(affiliateUsers.active, true))
          : and(eq(customers.id, t.userId), isNull(customers.deletedAt));
    const table = p.realm === "subrinho" ? subrinhoUsers : p.realm === "afiliado" ? affiliateUsers : customers;
    const [u] = await tx.update(table).set({ passwordHash: hash }).where(alive).returning({ id: table.id, name: table.name });
    if (!u) throw new ResetError("Esta conta não está mais ativa. Fale com o atendimento.");
    await tx.delete(sessions).where(and(eq(sessions.userType, USER_TYPE[p.realm]), eq(sessions.userId, t.userId)));
    if (p.realm !== "loja")
      await recordAudit(tx, {
        actor: { type: USER_TYPE[p.realm] as "SUBRINHO" | "AFFILIATE", id: u.id, name: u.name },
        action: "auth.password_reset",
        entity: p.realm === "subrinho" ? "subrinho_user" : "affiliate_user",
        entityId: u.id,
        summary: "Criou uma nova senha pelo link do e-mail",
      });
    return u.id;
  });
}
