"use server";

import { revalidatePath } from "next/cache";
import { revalidateStore, storePublicUrl } from "@/server/store-links";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { createAffiliate, createAffiliateUser, updateAffiliate, type AffiliateInput } from "@/server/admin/affiliates";
import { BrandingError, brandingFromForm, updateBranding } from "@/server/admin/branding";
import { StoreDomainError, updateStoreDomains, verifyCustomDomain } from "@/server/admin/store-domains";
import { actionError, checkbox, FormError, optText, text, uuid } from "../../_lib/form";
import { PERMS } from "../../_lib/labels";

const UserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do usuário").max(120),
  email: z.email("E-mail do usuário inválido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(200),
});

function affiliateInput(fd: FormData, withActive: boolean): AffiliateInput {
  const email = optText(fd, "email");
  if (email && !z.email().safeParse(email).success) throw new FormError("E-mail da agência inválido");
  return {
    name: text(fd, "name"),
    slug: text(fd, "slug"),
    legalName: optText(fd, "legalName"),
    document: optText(fd, "document"),
    email,
    phone: optText(fd, "phone"),
    whatsapp: optText(fd, "whatsapp"),
    pixKey: optText(fd, "pixKey"),
    bankName: optText(fd, "bankName"),
    bankAgency: optText(fd, "bankAgency"),
    bankAccount: optText(fd, "bankAccount"),
    active: withActive ? checkbox(fd, "active") : true,
  };
}

export async function createAffiliateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    await requireSubrinhoUser(PERMS.affiliates);
    const input = affiliateInput(fd, false);
    const admin = UserSchema.safeParse({
      name: text(fd, "adminName"),
      email: text(fd, "adminEmail").toLowerCase(),
      password: String(fd.get("adminPassword") ?? ""),
    });
    if (!admin.success) throw new FormError(admin.error.issues[0]?.message ?? "Dados do usuário ADMIN inválidos");
    const a = await db.transaction((tx) => createAffiliate(tx, input, admin.data));
    id = a.id;
    revalidatePath("/subrinho/afiliados");
  } catch (e) {
    return actionError(e);
  }
  redirect(`/subrinho/afiliados/${id}?novo=1`);
}

export async function updateAffiliateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.affiliates);
    const id = uuid(fd, "id", "Afiliado");
    const input = affiliateInput(fd, true);
    const a = await db.transaction((tx) => updateAffiliate(tx, id, input));
    if (!a) throw new FormError("Afiliado não encontrado");
    revalidatePath("/subrinho/afiliados");
    revalidatePath(`/subrinho/afiliados/${id}`);
    return { ok: true, message: `Dados de ${a.name} salvos. Loja: ${storePublicUrl(a)}` };
  } catch (e) {
    return actionError(e);
  }
}

export async function addAffiliateUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.affiliates);
    const affiliateId = uuid(fd, "affiliateId", "Afiliado");
    const role = text(fd, "role") === "ADMIN" ? "ADMIN" : "AGENT";
    const parsed = UserSchema.safeParse({
      name: text(fd, "name"),
      email: text(fd, "email").toLowerCase(),
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) throw new FormError(parsed.error.issues[0]?.message ?? "Dados inválidos");
    const u = await db.transaction((tx) => createAffiliateUser(tx, affiliateId, { ...parsed.data, role }));
    revalidatePath(`/subrinho/afiliados/${affiliateId}`);
    return { ok: true, message: `Usuário ${u.name} criado (${role === "ADMIN" ? "ADMIN" : "Agente"}).` };
  } catch (e) {
    return actionError(e);
  }
}

/** White-label: identidade da loja do afiliado (inclui exibir ou não "tecnologia Subrinho"). */
export async function updateAffiliateBrandingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.affiliates);
    const id = uuid(fd, "id", "Afiliado");
    const a = await db.transaction(async (tx) => {
      const input = await brandingFromForm(tx, fd, { type: "SUBRINHO", id: user.id }, { allowPoweredBy: true });
      return updateBranding(tx, id, input);
    });
    revalidatePath(`/subrinho/afiliados/${id}`);
    revalidateStore(a, "", "layout");
    revalidatePath("/afiliado", "layout");
    return { ok: true, message: `Identidade da loja ${a.name} salva.` };
  } catch (e) {
    if (e instanceof BrandingError) return { error: e.message };
    return actionError(e);
  }
}

/** Endereço da loja (subdomínio e domínio próprio), pela equipe Subrinho. */
export async function updateAffiliateDomainsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.affiliates);
    const id = uuid(fd, "affiliateId");
    const row = await updateStoreDomains(db, id, { subdomain: text(fd, "subdomain"), customDomain: optText(fd, "customDomain") ?? "" });
    revalidatePath(`/subrinho/afiliados/${id}`);
    if (row) revalidateStore(row, "", "layout");
    return { ok: true, message: row?.customDomain && !row.customDomainVerifiedAt ? "Endereço salvo. Adicione o domínio ao projeto na Vercel e clique em Verificar domínio." : "Endereço salvo." };
  } catch (e) {
    if (e instanceof StoreDomainError) return { error: e.message };
    return actionError(e);
  }
}

export async function verifyAffiliateDomainAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.affiliates);
    const id = uuid(fd, "affiliateId");
    const r = await verifyCustomDomain(db, id);
    revalidatePath(`/subrinho/afiliados/${id}`);
    return r.ok ? { ok: true, message: r.message } : { error: r.message };
  } catch (e) {
    if (e instanceof StoreDomainError) return { error: e.message };
    return actionError(e);
  }
}
