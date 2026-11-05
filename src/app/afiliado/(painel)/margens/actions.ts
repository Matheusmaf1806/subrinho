"use server";

import { revalidatePath } from "next/cache";
import { revalidateStore } from "@/server/store-links";
import type { StoreAddress } from "@/lib/store-domains";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import type { Category } from "@/server/db/schema";
import { deleteMarginRule, listMarginRules, upsertMarginRule } from "@/server/admin/margins";
import { resolveTicketTarget } from "@/server/afiliado/margins";
import { ACTIVE_CATEGORIES, CATEGORY_LABEL } from "@/server/suppliers/types";
import { decimalField, requireAdminForAction, serviceErrorMessage, str } from "../../_lib/helpers";

function revalidate(store: Pick<StoreAddress, "slug" | "subdomain" | "customDomain">) {
  revalidatePath("/afiliado", "layout");
  // A margem muda o preço exibido na loja.
  revalidateStore(store, "", "layout");
}

function readPct(fd: FormData): string | { error: string } {
  const v = decimalField(fd, "marginPct");
  if (v === null) return { error: "Informe a margem em %." };
  return v;
}

export async function saveDefaultMarginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { user, affiliate } = g.session;
  const marginPct = readPct(fd);
  if (typeof marginPct !== "string") return marginPct;
  try {
    await upsertMarginRule(db, { owner: "AFFILIATE", affiliateId: affiliate.id, scope: "DEFAULT", label: "Padrão", marginPct }, user.id);
  } catch (e) {
    return { error: serviceErrorMessage(e) };
  }
  revalidate(affiliate);
  return { ok: true, message: "Margem padrão salva." };
}

export async function saveCategoryMarginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { user, affiliate } = g.session;
  const category = str(fd, "category") as Category;
  if (!ACTIVE_CATEGORIES.includes(category)) return { error: "Categoria inválida." };
  const marginPct = readPct(fd);
  if (typeof marginPct !== "string") return marginPct;
  try {
    await upsertMarginRule(
      db,
      { owner: "AFFILIATE", affiliateId: affiliate.id, scope: "CATEGORY", category, label: CATEGORY_LABEL[category], marginPct },
      user.id,
    );
  } catch (e) {
    return { error: serviceErrorMessage(e) };
  }
  revalidate(affiliate);
  return { ok: true, message: `Margem de ${CATEGORY_LABEL[category]} salva.` };
}

/** Margem de um ingresso (todos os tipos) ou de um tipo de ingresso específico. */
export async function saveTicketMarginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { user, affiliate } = g.session;
  const marginPct = readPct(fd);
  if (typeof marginPct !== "string") return marginPct;
  try {
    const target = await resolveTicketTarget(db, str(fd, "target"));
    if (!target) return { error: "Ingresso não encontrado no catálogo." };
    await upsertMarginRule(
      db,
      {
        owner: "AFFILIATE",
        affiliateId: affiliate.id,
        scope: target.scope,
        category: "TICKETS",
        supplierCode: target.supplierCode,
        productId: target.productId,
        optionId: target.optionId,
        label: target.label,
        marginPct,
      },
      user.id,
    );
  } catch (e) {
    return { error: serviceErrorMessage(e) };
  }
  revalidate(affiliate);
  return { ok: true, message: "Margem salva." };
}

/** Altera o percentual de uma regra existente (mesmo alvo). */
export async function updateMarginRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { user, affiliate } = g.session;
  const marginPct = readPct(fd);
  if (typeof marginPct !== "string") return marginPct;
  try {
    // Busca somente entre as regras DESTE afiliado — nunca confia em ids vindos do formulário.
    const rule = (await listMarginRules(db, "AFFILIATE", affiliate.id)).find((r) => r.id === str(fd, "ruleId"));
    if (!rule) return { error: "Regra não encontrada." };
    await upsertMarginRule(
      db,
      {
        owner: "AFFILIATE",
        affiliateId: affiliate.id,
        scope: rule.scope,
        category: rule.category,
        supplierCode: rule.supplierCode,
        productId: rule.productId,
        optionId: rule.optionId,
        label: rule.label,
        marginPct,
      },
      user.id,
    );
  } catch (e) {
    return { error: serviceErrorMessage(e) };
  }
  revalidate(affiliate);
  return { ok: true, message: "Margem atualizada." };
}

export async function deleteMarginRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate } = g.session;
  try {
    await deleteMarginRule(db, str(fd, "ruleId"), { owner: "AFFILIATE", affiliateId: affiliate.id });
  } catch (e) {
    return { error: serviceErrorMessage(e, "Não foi possível remover a regra.") };
  }
  revalidate(affiliate);
  return { ok: true, message: "Regra removida." };
}
