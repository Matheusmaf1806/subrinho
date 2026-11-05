"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requestMeta, requireAffiliateUser } from "@/server/auth/session";
import { confirmTotp, disableTotp, resetTotp, startTotp } from "@/server/auth/mfa";
import { recordAudit } from "@/server/audit";
import { isUuid, requireAdminForAction, str } from "../../_lib/helpers";
import { and, eq } from "drizzle-orm";
import { affiliateUsers } from "@/server/db/schema";

const actorOf = (s: Awaited<ReturnType<typeof requireAffiliateUser>>) => ({ type: "AFFILIATE" as const, id: s.user.id, name: s.user.name, affiliateId: s.affiliate.id });

export async function startAffiliateTotpAction(): Promise<ActionState> {
  const s = await requireAffiliateUser();
  if (s.user.totpEnabledAt) return { error: "A verificação em duas etapas já está ligada" };
  await startTotp(db, "afiliado", s.user.id);
  revalidatePath("/afiliado/seguranca");
  return { ok: true };
}

export async function confirmAffiliateTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAffiliateUser();
  const err = await confirmTotp(db, "afiliado", s.user.id, str(fd, "code"), (await requestMeta()).ip);
  if (err) return { error: err };
  await recordAudit(db, { actor: actorOf(s), affiliateId: s.affiliate.id, action: "auth.2fa_on", entity: "affiliate_user", entityId: s.user.id, summary: `${s.user.name} ligou a verificação em duas etapas` });
  revalidatePath("/afiliado", "layout");
  return { ok: true, message: "Pronto! A partir do próximo login, o painel pede o código do app." };
}

export async function disableAffiliateTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAffiliateUser();
  const err = await disableTotp(db, "afiliado", s.user.id, str(fd, "code"), (await requestMeta()).ip);
  if (err) return { error: err };
  await recordAudit(db, { actor: actorOf(s), affiliateId: s.affiliate.id, action: "auth.2fa_off", entity: "affiliate_user", entityId: s.user.id, summary: `${s.user.name} desligou a verificação em duas etapas` });
  revalidatePath("/afiliado", "layout");
  return { ok: true, message: "Verificação em duas etapas desligada." };
}

/** ADMIN da agência desliga a verificação de um usuário da mesma agência (celular perdido). */
export async function resetAgencyUserTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const id = str(fd, "id");
  if (!isUuid(id) || id === g.session.user.id) return { error: "Usuário não encontrado." };
  const [own] = await db.select({ id: affiliateUsers.id }).from(affiliateUsers).where(and(eq(affiliateUsers.id, id), eq(affiliateUsers.affiliateId, g.session.affiliate.id)));
  if (!own) return { error: "Usuário não encontrado." };
  const u = await resetTotp(db, "afiliado", id);
  if (!u) return { error: "Usuário não encontrado." };
  await recordAudit(db, { actor: actorOf(g.session), affiliateId: g.session.affiliate.id, action: "auth.2fa_reset", entity: "affiliate_user", entityId: u.id, summary: `Desligou a verificação em duas etapas de ${u.name}` });
  revalidatePath("/afiliado/usuarios");
  return { ok: true, message: `Verificação de ${u.name} desligada. No próximo login, só e-mail e senha.` };
}
