"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { affiliates, affiliateUsers } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { requestMeta, startSession } from "@/server/auth/session";
import { loginBlocked, recordLogin } from "@/server/auth/limits";
import { RESET_SENT_MESSAGE, requestPasswordReset, resetPassword, ResetError } from "@/server/auth/reset";

let dummyHash: Promise<string> | null = null;

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Informe seu e-mail e sua senha." };
  const { ip } = await requestMeta();
  const blocked = await loginBlocked(db, "afiliado", email, ip);
  if (blocked) return { error: blocked };

  const [row] = await db
    .select({
      id: affiliateUsers.id,
      passwordHash: affiliateUsers.passwordHash,
      active: affiliateUsers.active,
      affiliateActive: affiliates.active,
    })
    .from(affiliateUsers)
    .innerJoin(affiliates, eq(affiliates.id, affiliateUsers.affiliateId))
    .where(eq(affiliateUsers.email, email));

  dummyHash ??= hashPassword("senha-inexistente-afiliado");
  const valid = await verifyPassword(password, row?.passwordHash ?? (await dummyHash));
  await recordLogin(db, "afiliado", email, ip, !!row && valid);
  if (!row || !valid) return { error: "E-mail ou senha inválidos." };
  if (!row.active) return { error: "Seu acesso está desativado. Fale com o administrador da sua agência." };
  if (!row.affiliateActive) return { error: "O acesso desta agência está suspenso. Fale com a equipe Subrinho." };

  await startSession("afiliado", { userType: "AFFILIATE", userId: row.id });
  redirect("/afiliado");
}

export async function requestResetAfiliadoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { ip } = await requestMeta();
  await requestPasswordReset(db, { realm: "afiliado", email: String(fd.get("email") ?? ""), ip });
  return { ok: true, message: RESET_SENT_MESSAGE };
}

export async function resetAfiliadoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let userId: string;
  try {
    userId = await resetPassword(db, { realm: "afiliado", token: String(fd.get("t") ?? ""), password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  } catch (e) {
    if (e instanceof ResetError) return { error: e.message };
    throw e;
  }
  await startSession("afiliado", { userType: "AFFILIATE", userId });
  redirect("/afiliado");
}
