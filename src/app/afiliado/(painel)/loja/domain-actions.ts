"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { StoreDomainError, updateStoreDomains, verifyCustomDomain } from "@/server/admin/store-domains";
import { revalidateStore } from "@/server/store-links";
import { requireAdminForAction, str } from "../../_lib/helpers";

/** Subdomínio e domínio próprio da loja: somente ADMIN da agência. */
export async function updateDomainsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  try {
    const before = g.session.affiliate;
    const row = await updateStoreDomains(db, before.id, { subdomain: str(fd, "subdomain"), customDomain: str(fd, "customDomain") });
    revalidatePath("/afiliado", "layout");
    revalidateStore(before, "", "layout");
    if (row) revalidateStore(row, "", "layout");
    return { ok: true, message: row?.customDomain && !row.customDomainVerifiedAt ? "Endereço salvo. Configure o DNS do domínio e clique em Verificar domínio." : "Endereço salvo." };
  } catch (e) {
    if (e instanceof StoreDomainError) return { error: e.message };
    console.error("[painel-afiliado] domínio:", e);
    return { error: "Não foi possível salvar o endereço. Tente novamente." };
  }
}

export async function verifyDomainAction(): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const r = await verifyCustomDomain(db, g.session.affiliate.id).catch((e) => ({ ok: false, message: e instanceof StoreDomainError ? e.message : "Não foi possível verificar agora." }));
  revalidatePath("/afiliado", "layout");
  return r.ok ? { ok: true, message: r.message } : { error: r.message };
}
