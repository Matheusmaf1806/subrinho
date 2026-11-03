"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { subrinhoUsers } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { actionError } from "../_lib/form";

const LoginSchema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha").max(200),
});

// Hash fictício para que e-mails inexistentes levem o mesmo tempo que senhas erradas.
let dummyHash: Promise<string> | null = null;

export async function loginSubrinho(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const parsed = LoginSchema.safeParse({
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    const { email, password } = parsed.data;

    const [user] = await db
      .select({ id: subrinhoUsers.id, passwordHash: subrinhoUsers.passwordHash })
      .from(subrinhoUsers)
      .where(and(eq(subrinhoUsers.email, email), eq(subrinhoUsers.active, true)));

    dummyHash ??= hashPassword("senha-inexistente-subrinho");
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) return { error: "E-mail ou senha inválidos." };

    await startSession("subrinho", { userType: "SUBRINHO", userId: user.id });
  } catch (e) {
    return actionError(e);
  }
  redirect("/subrinho");
}
