"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { sessions, subrinhoUsers } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { newTotpSecret, openSecret, sealSecret, verifyTotp } from "@/server/auth/totp";
import { recordAudit } from "@/server/audit";
import { actionError, text } from "../../_lib/form";

export async function startTotpAction(): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser();
    if (user.totpEnabledAt) return { error: "A verificação em duas etapas já está ligada" };
    await db.update(subrinhoUsers).set({ totpSecret: sealSecret(newTotpSecret()) }).where(eq(subrinhoUsers.id, user.id));
    revalidatePath("/subrinho/seguranca");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function confirmTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser();
    const secret = openSecret(user.totpSecret);
    if (!secret) return { error: "Gere o QR Code de novo" };
    if (!verifyTotp(secret, text(fd, "code"))) return { error: "Código incorreto. Confira se o relógio do celular está certo e digite o código atual." };
    await db.update(subrinhoUsers).set({ totpEnabledAt: new Date() }).where(eq(subrinhoUsers.id, user.id));
    await recordAudit(db, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, action: "auth.2fa_on", entity: "subrinho_user", entityId: user.id, summary: "Ligou a verificação em duas etapas" });
    revalidatePath("/subrinho/seguranca");
    revalidatePath("/subrinho");
    return { ok: true, message: "Pronto! A partir do próximo login, o painel pede o código do app." };
  } catch (e) {
    return actionError(e);
  }
}

export async function disableTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser();
    const secret = openSecret(user.totpSecret);
    if (!user.totpEnabledAt || !secret) return { error: "A verificação em duas etapas não está ligada" };
    if (!verifyTotp(secret, text(fd, "code"))) return { error: "Código incorreto" };
    await db.update(subrinhoUsers).set({ totpEnabledAt: null, totpSecret: null }).where(eq(subrinhoUsers.id, user.id));
    await recordAudit(db, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, action: "auth.2fa_off", entity: "subrinho_user", entityId: user.id, summary: "Desligou a verificação em duas etapas" });
    revalidatePath("/subrinho/seguranca");
    return { ok: true, message: "Verificação em duas etapas desligada." };
  } catch (e) {
    return actionError(e);
  }
}

/** Proprietário desliga a verificação de outra pessoa (celular perdido) e encerra as sessões dela. */
export async function resetUserTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const owner = await requireSubrinhoUser([]);
    if (owner.role !== "OWNER") return { error: "Somente Proprietários podem fazer isso" };
    const id = text(fd, "id");
    const [u] = await db.update(subrinhoUsers).set({ totpEnabledAt: null, totpSecret: null }).where(eq(subrinhoUsers.id, id)).returning({ id: subrinhoUsers.id, name: subrinhoUsers.name });
    if (!u) return { error: "Usuário não encontrado" };
    await db.delete(sessions).where(eq(sessions.userId, u.id));
    await recordAudit(db, { actor: { type: "SUBRINHO", id: owner.id, name: owner.name }, action: "auth.2fa_reset", entity: "subrinho_user", entityId: u.id, summary: `Desligou a verificação em duas etapas de ${u.name}` });
    revalidatePath("/subrinho/configuracoes");
    return { ok: true, message: `Verificação de ${u.name} desligada. No próximo login, só e-mail e senha.` };
  } catch (e) {
    return actionError(e);
  }
}
