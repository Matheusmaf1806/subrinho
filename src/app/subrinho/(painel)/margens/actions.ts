"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import type { Category, MarginScope } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { deleteMarginRule, upsertMarginRule } from "@/server/admin/margins";
import { SUPPLIERS } from "@/server/suppliers/registry";
import { ACTIVE_CATEGORIES, CATEGORY_LABEL, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { pct } from "@/lib/format";
import { actionError, FormError, oneOf, optText, requiredDecimal, text, uuid } from "../../_lib/form";
import { PERMS, SCOPE_LABEL } from "../../_lib/labels";

const SCOPES: MarginScope[] = ["DEFAULT", "CATEGORY", "SUPPLIER", "PRODUCT", "PRODUCT_OPTION"];
const CATEGORIES: Category[] = [...ACTIVE_CATEGORIES, ...FUTURE_CATEGORIES];
const SAFE_ID = /^[^\u0000-\u001f\u007f]{1,160}$/;

export async function upsertSubrinhoMarginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.margins);
    const scope = oneOf(text(fd, "scope"), SCOPES, "Escopo");
    const marginPct = requiredDecimal(fd, "marginPct", "Margem");
    let category: Category | null = null;
    let supplierCode: string | null = null;
    let productId: string | null = null;
    let optionId: string | null = null;
    let label = optText(fd, "label")?.slice(0, 160) ?? null;

    if (scope === "CATEGORY") {
      category = oneOf(text(fd, "category"), CATEGORIES, "Categoria");
      label ??= CATEGORY_LABEL[category];
    }
    if (scope === "SUPPLIER" || scope === "PRODUCT" || scope === "PRODUCT_OPTION") {
      const meta = SUPPLIERS.find((s) => s.code === text(fd, "supplierCode"));
      if (!meta) throw new FormError("Fornecedor inválido");
      supplierCode = meta.code;
      category = meta.category;
      label ??= meta.name;
    }
    if (scope === "PRODUCT" || scope === "PRODUCT_OPTION") {
      productId = text(fd, "productId");
      if (!SAFE_ID.test(productId)) throw new FormError("Produto inválido");
    }
    if (scope === "PRODUCT_OPTION") {
      optionId = text(fd, "optionId");
      if (!SAFE_ID.test(optionId)) throw new FormError("Opção inválida");
    }
    if (scope === "DEFAULT") label ??= "Padrão Subrinho";

    const rule = await db.transaction((tx) =>
      upsertMarginRule(tx, { owner: "SUBRINHO", scope, category, supplierCode, productId, optionId, label, marginPct }, user.id),
    );
    revalidatePath("/subrinho/margens");
    return { ok: true, message: `Margem ${SCOPE_LABEL[scope].toLowerCase()} salva: ${pct(rule.marginPct)}` };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteSubrinhoMarginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.margins);
    const id = uuid(fd, "id", "Regra");
    await db.transaction((tx) => deleteMarginRule(tx, id, { owner: "SUBRINHO" }));
    revalidatePath("/subrinho/margens");
    return { ok: true, message: "Regra removida" };
  } catch (e) {
    return actionError(e);
  }
}
