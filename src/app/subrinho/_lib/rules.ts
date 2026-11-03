/** Descrição de regras de margem (servidor). */
import type { marginRules } from "@/server/db/schema";
import { SUPPLIERS } from "@/server/suppliers/registry";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { SCOPE_LABEL } from "./labels";

type Rule = Pick<typeof marginRules.$inferSelect, "scope" | "category" | "supplierCode" | "productId" | "optionId" | "label">;

export function supplierName(code: string | null | undefined): string {
  if (!code) return "—";
  return SUPPLIERS.find((s) => s.code === code)?.name ?? code;
}

/** Alvo legível de uma regra: "Hospedagem", "Hotelbeds", "Tu Experienza · Coliseu"... */
export function ruleTarget(r: Rule): string {
  switch (r.scope) {
    case "DEFAULT":
      return "Todos os produtos";
    case "CATEGORY":
      return r.category ? CATEGORY_LABEL[r.category] : "—";
    case "SUPPLIER":
      return supplierName(r.supplierCode);
    case "PRODUCT":
      return `${supplierName(r.supplierCode)} · ${r.label ?? r.productId}`;
    case "PRODUCT_OPTION":
      return `${supplierName(r.supplierCode)} · ${r.label ?? `${r.productId} / ${r.optionId}`}`;
  }
}

export function ruleSummary(r: Rule): string {
  return `${SCOPE_LABEL[r.scope]}: ${ruleTarget(r)}`;
}
