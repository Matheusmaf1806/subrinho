"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { authTokens, subrinhoUsers } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { requestMeta, startSession } from "@/server/auth/session";
import { loginBlocked, recordLogin } from "@/server/auth/limits";
import { matchTotp, openSecret } from "@/server/auth/totp";
import { RESET_SENT_MESSAGE, requestPasswordReset, resetPassword, ResetError } from "@/server/auth/reset";
import { randomToken, sha256 } from "@/lib/random";
import { actionError } from "../_lib/form";

const LoginSchema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha").max(200),
});

/** Cookie da segunda etapa (código do app autenticador): vale 10 minutos. */
const MFA_COOKIE = "sb_subrinho_mfa";
const MFA_TTL_MS = 10 * 60_000;
const MFA_MAX_ATTEMPTS = 5;

// Hash fictício para que e-mails inexistentes levem o mesmo tempo que senhas erradas.
let dummyHash: Promise<string> | null = null;

export async function loginSubrinho(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let needsCode = false;
  try {
    const parsed = LoginSchema.safeParse({
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    const { email, password } = parsed.data;
    const { ip } = await requestMeta();
    const blocked = await loginBlocked(db, "subrinho", email, ip);
    if (blocked) return { error: blocked };

    const [user] = await db
      .select({ id: subrinhoUsers.id, passwordHash: subrinhoUsers.passwordHash, totpEnabledAt: subrinhoUsers.totpEnabledAt })
      .from(subrinhoUsers)
      .where(and(eq(subrinhoUsers.email, email), eq(subrinhoUsers.active, true)));

    dummyHash ??= hashPassword("senha-inexistente-subrinho");
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    await recordLogin(db, "subrinho", email, ip, !!user && ok);
    if (!user || !ok) return { error: "E-mail ou senha inválidos." };

    if (user.totpEnabledAt) {
      const token = randomToken();
      await db.insert(authTokens).values({ id: sha256(token), purpose: "MFA", userType: "SUBRINHO", userId: user.id, expiresAt: new Date(Date.now() + MFA_TTL_MS) });
      (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/subrinho", maxAge: MFA_TTL_MS / 1000 });
      needsCode = true;
    } else {
      await startSession("subrinho", { userType: "SUBRINHO", userId: user.id });
    }
  } catch (e) {
    return actionError(e);
  }
  redirect(needsCode ? "/subrinho/login/codigo" : "/subrinho");
}

/** Segunda etapa: código de 6 dígitos do app autenticador. */
export async function verifyMfaAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jar = await cookies();
    const token = jar.get(MFA_COOKIE)?.value;
    if (!token) return { error: "A etapa do código venceu. Entre com e-mail e senha de novo." };
    const [t] = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.id, sha256(token)), eq(authTokens.purpose, "MFA"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
    if (!t || t.attempts >= MFA_MAX_ATTEMPTS) return { error: "A etapa do código venceu. Entre com e-mail e senha de novo." };
    // limite por pessoa (não só por tentativa de login): quem tem a senha não consegue chutar códigos sem parar
    const { ip } = await requestMeta();
    const blocked = await loginBlocked(db, "mfa", t.userId, ip);
    if (blocked) return { error: "Muitos códigos errados seguidos. Espere 15 minutos e entre de novo com e-mail e senha." };
    const [user] = await db.select().from(subrinhoUsers).where(and(eq(subrinhoUsers.id, t.userId), eq(subrinhoUsers.active, true)));
    const secret = openSecret(user?.totpSecret);
    const step = user && secret ? matchTotp(secret, String(fd.get("code") ?? "")) : null;
    if (!user || step === null) {
      await db.update(authTokens).set({ attempts: t.attempts + 1 }).where(eq(authTokens.id, t.id));
      await recordLogin(db, "mfa", t.userId, ip, false);
      const left = MFA_MAX_ATTEMPTS - t.attempts - 1;
      return { error: left > 0 ? `Código incorreto. Confira o app autenticador (${left} tentativa${left > 1 ? "s" : ""}).` : "Código incorreto muitas vezes. Entre com e-mail e senha de novo." };
    }
    // cada código vale uma vez só (quem viu o código por cima do ombro não entra com ele)
    const [fresh] = await db
      .insert(authTokens)
      .values({ id: sha256(`totp:${user.id}:${step}`), purpose: "TOTP_USED", userType: "SUBRINHO", userId: user.id, expiresAt: new Date(Date.now() + 3 * 60_000) })
      .onConflictDoNothing()
      .returning({ id: authTokens.id });
    if (!fresh) return { error: "Este código já foi usado. Espere o próximo código no app." };
    const [used] = await db.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.id, t.id), isNull(authTokens.usedAt))).returning({ id: authTokens.id });
    if (!used) return { error: "Este código já foi usado. Entre com e-mail e senha de novo." };
    await recordLogin(db, "mfa", t.userId, ip, true);
    jar.delete({ name: MFA_COOKIE, path: "/subrinho" });
    await startSession("subrinho", { userType: "SUBRINHO", userId: user.id });
  } catch (e) {
    return actionError(e);
  }
  redirect("/subrinho");
}

export async function requestResetSubrinhoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { ip } = await requestMeta();
    await requestPasswordReset(db, { realm: "subrinho", email: String(fd.get("email") ?? ""), ip });
    return { ok: true, message: RESET_SENT_MESSAGE };
  } catch (e) {
    return actionError(e);
  }
}

export async function resetSubrinhoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await resetPassword(db, { realm: "subrinho", token: String(fd.get("t") ?? ""), password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  } catch (e) {
    if (e instanceof ResetError) return { error: e.message };
    return actionError(e);
  }
  // com a verificação em duas etapas ligada, o login pede o código: melhor entrar pelo formulário
  redirect("/subrinho/login?senha=nova");
}
