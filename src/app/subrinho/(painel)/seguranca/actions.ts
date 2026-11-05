"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requestMeta, requireSubrinhoUser } from "@/server/auth/session";
import { confirmTotp, disableTotp, resetTotp, startTotp } from "@/server/auth/mfa";
import { recordAudit } from "@/server/audit";
import { actionError, text } from "../../_lib/form";

export async function startTotpAction(): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser();
    if (user.totpEnabledAt) return { error: "A verificação em duas etapas já está ligada" };
    await startTotp(db, "subrinho", user.id);
    revalidatePath("/subrinho/seguranca");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function confirmTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser();
    const err = await confirmTotp(db, "subrinho", user.id, text(fd, "code"), (await requestMeta()).ip);
    if (err) return { error: err };
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
    const err = await disableTotp(db, "subrinho", user.id, text(fd, "code"), (await requestMeta()).ip);
    if (err) return { error: err };
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
    const u = await resetTotp(db, "subrinho", text(fd, "id"));
    if (!u) return { error: "Usuário não encontrado" };
    await recordAudit(db, { actor: { type: "SUBRINHO", id: owner.id, name: owner.name }, action: "auth.2fa_reset", entity: "subrinho_user", entityId: u.id, summary: `Desligou a verificação em duas etapas de ${u.name}` });
    revalidatePath("/subrinho/configuracoes");
    return { ok: true, message: `Verificação de ${u.name} desligada. No próximo login, só e-mail e senha.` };
  } catch (e) {
    return actionError(e);
  }
}

/** Equipe Subrinho desliga a verificação de um usuário de agência (celular perdido). */
export async function resetAffiliateUserTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(["ADMIN"]);
    const u = await resetTotp(db, "afiliado", text(fd, "id"));
    if (!u) return { error: "Usuário não encontrado" };
    await recordAudit(db, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, affiliateId: text(fd, "affiliateId") || null, action: "auth.2fa_reset", entity: "affiliate_user", entityId: u.id, summary: `Desligou a verificação em duas etapas de ${u.name}` });
    revalidatePath("/subrinho/afiliados", "layout");
    return { ok: true, message: `Verificação de ${u.name} desligada.` };
  } catch (e) {
    return actionError(e);
  }
}
