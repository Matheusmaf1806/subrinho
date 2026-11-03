/**
 * Resolução de margens: a regra mais específica vence.
 *   PRODUCT_OPTION (ex.: "Coliseu + Vaticano") > PRODUCT (ex.: "Coliseu") > SUPPLIER > CATEGORY > DEFAULT
 */
import type { Category, MarginScope } from "@/server/db/schema";
import { d, type Decimal } from "./money";

export type MarginOwner = "SUBRINHO" | "AFFILIATE";

export type MarginRuleLite = {
  id: string;
  owner: MarginOwner;
  affiliateId: string | null;
  scope: MarginScope;
  category: Category | null;
  supplierCode: string | null;
  productId: string | null;
  optionId: string | null;
  marginPct: string;
  label?: string | null;
};

export type MarginTarget = {
  category: Category;
  supplierCode: string;
  productId: string;
  optionId?: string | null;
};

export type ResolvedMargin = {
  pct: Decimal;
  ruleId: string | null;
  scope: MarginScope | "FALLBACK";
  label?: string | null;
};

const SPECIFICITY: MarginScope[] = ["PRODUCT_OPTION", "PRODUCT", "SUPPLIER", "CATEGORY", "DEFAULT"];

function matches(rule: MarginRuleLite, t: MarginTarget): boolean {
  switch (rule.scope) {
    case "PRODUCT_OPTION":
      return (
        rule.supplierCode === t.supplierCode &&
        rule.productId === t.productId &&
        !!t.optionId &&
        rule.optionId === t.optionId
      );
    case "PRODUCT":
      return rule.supplierCode === t.supplierCode && rule.productId === t.productId;
    case "SUPPLIER":
      return rule.supplierCode === t.supplierCode;
    case "CATEGORY":
      return rule.category === t.category;
    case "DEFAULT":
      return true;
  }
}

/** Índice em memória das regras — monte uma vez por request e resolva vários itens. */
export class MarginBook {
  private byOwner = new Map<string, MarginRuleLite[]>();

  constructor(
    rules: MarginRuleLite[],
    private fallback: { subrinho: string; affiliate: string },
  ) {
    for (const r of rules) {
      const key = r.owner === "SUBRINHO" ? "SUBRINHO" : `AFFILIATE:${r.affiliateId}`;
      const list = this.byOwner.get(key) ?? [];
      list.push(r);
      this.byOwner.set(key, list);
    }
  }

  resolve(owner: MarginOwner, target: MarginTarget, affiliateId?: string | null): ResolvedMargin {
    const key = owner === "SUBRINHO" ? "SUBRINHO" : `AFFILIATE:${affiliateId}`;
    const rules = this.byOwner.get(key) ?? [];
    for (const scope of SPECIFICITY) {
      const hit = rules.find((r) => r.scope === scope && matches(r, target));
      if (hit) return { pct: d(hit.marginPct), ruleId: hit.id, scope, label: hit.label };
    }
    return {
      pct: d(owner === "SUBRINHO" ? this.fallback.subrinho : this.fallback.affiliate),
      ruleId: null,
      scope: "FALLBACK",
    };
  }
}

/** Chave única do alvo da regra (garante 1 regra por alvo, por dono). */
export function marginScopeKey(r: {
  owner: MarginOwner;
  affiliateId?: string | null;
  scope: MarginScope;
  category?: string | null;
  supplierCode?: string | null;
  productId?: string | null;
  optionId?: string | null;
}): string {
  const who = r.owner === "SUBRINHO" ? "SUBRINHO" : `AFFILIATE:${r.affiliateId}`;
  switch (r.scope) {
    case "DEFAULT":
      return `${who}|DEFAULT`;
    case "CATEGORY":
      return `${who}|CATEGORY|${r.category}`;
    case "SUPPLIER":
      return `${who}|SUPPLIER|${r.supplierCode}`;
    case "PRODUCT":
      return `${who}|PRODUCT|${r.supplierCode}|${r.productId}`;
    case "PRODUCT_OPTION":
      return `${who}|PRODUCT_OPTION|${r.supplierCode}|${r.productId}|${r.optionId}`;
  }
}
