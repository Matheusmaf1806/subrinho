"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { affiliates, affiliateUsers } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Informe seu e-mail e sua senha." };

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

  const valid = row ? await verifyPassword(password, row.passwordHash) : false;
  if (!row || !valid) return { error: "E-mail ou senha inválidos." };
  if (!row.active) return { error: "Seu acesso está desativado. Fale com o administrador da sua agência." };
  if (!row.affiliateActive) return { error: "O acesso desta agência está suspenso. Fale com a equipe Subrinho." };

  await startSession("afiliado", { userType: "AFFILIATE", userId: row.id });
  redirect("/afiliado");
}
