"use server";

import { audited } from "@/server/audit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { affiliateUsers } from "@/server/db/schema";
import { createAffiliateUser } from "@/server/admin/affiliates";
import { isUuid, requireAdminForAction, serviceErrorMessage, str } from "../../_lib/helpers";

const NewUser = z.object({
  name: z.string().trim().min(2, "Informe o nome do usuário.").max(120),
  email: z.email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(200),
  role: z.enum(["ADMIN", "AGENT"], "Escolha o perfil do usuário."),
});

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate } = g.session;
  const parsed = NewUser.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    password: String(fd.get("password") ?? ""),
    role: str(fd, "role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    // O afiliado vem SEMPRE da sessão.
    await createAffiliateUser(db, affiliate.id, parsed.data);
  } catch (e) {
    return { error: serviceErrorMessage(e, "Não foi possível criar o usuário.") };
  }
  revalidatePath("/afiliado/usuarios");
  return audited(db, { type: "AFFILIATE", id: g.session.user.id, name: g.session.user.name }, "affiliate_user.create", { ok: true, message: `Usuário ${parsed.data.name} criado. Envie o e-mail e a senha para ele acessar o painel.` }, { affiliateId: g.session.affiliate.id });
}

export async function setUserActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { user, affiliate } = g.session;
  const userId = str(fd, "userId");
  if (!isUuid(userId)) return { error: "Usuário não encontrado." };
  if (userId === user.id) return { error: "Você não pode desativar o seu próprio acesso." };
  const active = str(fd, "active") === "1";
  const updated = await db
    .update(affiliateUsers)
    .set({ active })
    .where(and(eq(affiliateUsers.id, userId), eq(affiliateUsers.affiliateId, affiliate.id)))
    .returning({ id: affiliateUsers.id });
  if (!updated.length) return { error: "Usuário não encontrado." };
  revalidatePath("/afiliado/usuarios");
  return audited(db, { type: "AFFILIATE", id: g.session.user.id, name: g.session.user.name }, "affiliate_user.toggle", { ok: true, message: active ? "Usuário reativado." : "Usuário desativado." }, { affiliateId: g.session.affiliate.id });
}
