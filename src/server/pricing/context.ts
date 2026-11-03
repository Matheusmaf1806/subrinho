import { eq, isNull, or, and } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { marginRules } from "@/server/db/schema";
import { ensureFreshFx, getCurrentFx } from "@/server/fx";
import { getSettings } from "@/server/settings";
import type { PricingContext } from "./cart-pricing";
import { MarginBook, type MarginRuleLite } from "./margins";

export async function loadMarginRules(tx: Tx, affiliateId: string): Promise<MarginRuleLite[]> {
  const rows = await tx
    .select()
    .from(marginRules)
    .where(
      or(
        and(eq(marginRules.owner, "SUBRINHO"), isNull(marginRules.affiliateId)),
        and(eq(marginRules.owner, "AFFILIATE"), eq(marginRules.affiliateId, affiliateId)),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    owner: r.owner,
    affiliateId: r.affiliateId,
    scope: r.scope,
    category: r.category,
    supplierCode: r.supplierCode,
    productId: r.productId,
    optionId: r.optionId,
    marginPct: r.marginPct,
    label: r.label,
  }));
}

/** Tudo que é preciso para precificar itens de uma loja (margens, câmbio, taxa do parcelado). */
export async function loadPricingContext(tx: Tx, affiliateId: string): Promise<PricingContext> {
  await ensureFreshFx(tx);
  const [rules, fx, s] = await Promise.all([loadMarginRules(tx, affiliateId), getCurrentFx(tx), getSettings(tx)]);
  return {
    affiliateId,
    margins: new MarginBook(rules, { subrinho: s.fallbackSubrinhoMarginPct, affiliate: s.fallbackAffiliateMarginPct }),
    fx,
    installmentFeePct: s.installmentFeePct,
    maxInstallments: s.maxInstallments,
  };
}
