import { and, asc, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { marginRules, type Category, type MarginScope } from "@/server/db/schema";
import { marginScopeKey, type MarginOwner } from "@/server/pricing/margins";
import { d } from "@/server/pricing/money";
import { getSettings } from "@/server/settings";

export class MarginError extends Error {}

export type MarginRuleInput = {
  owner: MarginOwner;
  affiliateId?: string | null;
  scope: MarginScope;
  category?: Category | null;
  supplierCode?: string | null;
  productId?: string | null;
  optionId?: string | null;
  label?: string | null;
  marginPct: string | number;
};

/** Cria ou atualiza a regra do alvo (1 regra por alvo). Margem sempre ≥ 0%. */
export async function upsertMarginRule(tx: Tx, input: MarginRuleInput, userId: string) {
  const pct = d(String(input.marginPct).replace(",", "."));
  if (pct.isNaN()) throw new MarginError("Margem inválida");
  if (pct.lt(0)) throw new MarginError("A margem não pode ser menor que 0%");
  if (pct.gte(100)) throw new MarginError("A margem precisa ser menor que 100%");
  if (input.owner === "AFFILIATE") {
    if (!input.affiliateId) throw new MarginError("Afiliado obrigatório");
    const s = await getSettings(tx);
    if (pct.gt(d(s.maxAffiliateMarginPct))) throw new MarginError(`A margem máxima permitida é ${s.maxAffiliateMarginPct}%`);
  }
  const need = (cond: unknown, msg: string) => {
    if (!cond) throw new MarginError(msg);
  };
  switch (input.scope) {
    case "CATEGORY":
      need(input.category, "Informe a categoria");
      break;
    case "SUPPLIER":
      need(input.supplierCode, "Informe o fornecedor");
      break;
    case "PRODUCT":
      need(input.supplierCode && input.productId, "Informe o produto");
      break;
    case "PRODUCT_OPTION":
      need(input.supplierCode && input.productId && input.optionId, "Informe o tipo de ingresso/opção");
      break;
  }
  const values = {
    owner: input.owner,
    affiliateId: input.owner === "AFFILIATE" ? input.affiliateId! : null,
    scope: input.scope,
    category: input.category ?? null,
    supplierCode: input.scope === "DEFAULT" || input.scope === "CATEGORY" ? null : input.supplierCode ?? null,
    productId: input.scope === "PRODUCT" || input.scope === "PRODUCT_OPTION" ? input.productId ?? null : null,
    optionId: input.scope === "PRODUCT_OPTION" ? input.optionId ?? null : null,
    label: input.label ?? null,
    marginPct: pct.toFixed(4),
    updatedBy: userId,
    updatedAt: new Date(),
  };
  const scopeKey = marginScopeKey(values);
  const [row] = await tx
    .insert(marginRules)
    .values({ ...values, scopeKey })
    .onConflictDoUpdate({ target: marginRules.scopeKey, set: { marginPct: values.marginPct, label: values.label, updatedBy: userId, updatedAt: new Date() } })
    .returning();
  return row;
}

export async function deleteMarginRule(tx: Tx, id: string, owner: { owner: MarginOwner; affiliateId?: string | null }) {
  const conds = [eq(marginRules.id, id), eq(marginRules.owner, owner.owner)];
  if (owner.owner === "AFFILIATE") conds.push(eq(marginRules.affiliateId, owner.affiliateId!));
  const [r] = await tx.select().from(marginRules).where(and(...conds));
  if (!r) throw new MarginError("Regra não encontrada");
  if (r.scope === "DEFAULT" && owner.owner === "SUBRINHO") throw new MarginError("A margem padrão da Subrinho não pode ser removida");
  await tx.delete(marginRules).where(eq(marginRules.id, id));
}

export async function listMarginRules(tx: Tx, owner: MarginOwner, affiliateId?: string | null) {
  return tx
    .select()
    .from(marginRules)
    .where(owner === "SUBRINHO" ? and(eq(marginRules.owner, "SUBRINHO"), isNull(marginRules.affiliateId)) : and(eq(marginRules.owner, "AFFILIATE"), eq(marginRules.affiliateId, affiliateId!)))
    .orderBy(asc(marginRules.scope), asc(marginRules.category), asc(marginRules.label));
}
