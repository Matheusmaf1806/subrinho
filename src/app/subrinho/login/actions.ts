"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { subrinhoUsers } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { requestMeta, startSession } from "@/server/auth/session";
import { loginBlocked, recordLogin } from "@/server/auth/limits";
import { beginMfa, finishMfa } from "@/server/auth/mfa";
import { RESET_SENT_MESSAGE, requestPasswordReset, resetPassword, ResetError } from "@/server/auth/reset";
import { actionError } from "../_lib/form";

const LoginSchema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha").max(200),
});

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
      await beginMfa(db, "subrinho", user.id);
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
    const { ip } = await requestMeta();
    const r = await finishMfa(db, "subrinho", String(fd.get("code") ?? ""), ip);
    if ("error" in r) return { error: r.error };
    await startSession("subrinho", { userType: "SUBRINHO", userId: r.userId });
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
