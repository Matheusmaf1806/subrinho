import type { Category, Currency } from "@/server/db/schema";
import { computeCoupon, type CouponDef, type CouponResult } from "@/server/coupons/engine";
import { applyDiscounts, installmentPlan, priceItem, type CostLine, type FinalItemPricing, type ItemPricing, type InstallmentPlan } from "./engine";
import type { MarginBook, ResolvedMargin } from "./margins";
import { Decimal, d, sum, ZERO } from "./money";

export type FxTable = Partial<Record<Currency, { rate: string; source: string; fetchedAt: string }>>;

export type PricingContext = {
  affiliateId: string;
  margins: MarginBook;
  fx: FxTable;
  installmentFeePct: string;
  maxInstallments: number;
};

export type PricingTarget = {
  category: Category;
  supplierCode: string;
  productId: string;
  optionId?: string | null;
};

export type CartItemForPricing = PricingTarget & {
  id: string;
  costCurrency: Currency;
  lines: CostLine[];
  affiliateMarginOverridePct?: string | null;
};

export type AffiliateMarginResolution = ResolvedMargin & { source: "RULE" | "OVERRIDE" | "FALLBACK" };

export type PricedItem = {
  id: string;
  base: ItemPricing;
  final: FinalItemPricing;
  subrinhoMargin: ResolvedMargin;
  affiliateMargin: AffiliateMarginResolution;
  /** Margem padrão do afiliado (antes de override), para exibir no modal do ADMIN. */
  affiliateDefaultMargin: ResolvedMargin;
};

export type CartTotals = {
  costBrl: Decimal;
  subrinhoMargin: Decimal;
  netSubrinho: Decimal;
  affiliateMargin: Decimal;
  netAffiliate: Decimal;
  subrinhoDiscount: Decimal;
  affiliateDiscount: Decimal;
  discount: Decimal;
  pix: Decimal;
  installment: Decimal;
  installmentPlan: InstallmentPlan;
  subrinhoRevenue: Decimal;
  affiliateCommission: Decimal;
};

export type PricedCart = {
  items: PricedItem[];
  coupons: { SUBRINHO?: CouponResult; AFFILIATE?: CouponResult };
  totals: CartTotals;
};

export function fxRateFor(ctx: Pick<PricingContext, "fx">, currency: Currency): Decimal {
  if (currency === "BRL") return new Decimal(1);
  const r = ctx.fx[currency];
  if (!r) throw new Error(`Cotação ${currency}/BRL indisponível — atualize o câmbio no Painel Subrinho`);
  return d(r.rate);
}

export function resolveItemMargins(ctx: PricingContext, item: PricingTarget & { affiliateMarginOverridePct?: string | null }) {
  const subrinhoMargin = ctx.margins.resolve("SUBRINHO", item);
  const affiliateDefaultMargin = ctx.margins.resolve("AFFILIATE", item, ctx.affiliateId);
  const hasOverride =
    item.affiliateMarginOverridePct !== null && item.affiliateMarginOverridePct !== undefined;
  const affiliateMargin: AffiliateMarginResolution = hasOverride
    ? { pct: d(item.affiliateMarginOverridePct), ruleId: null, scope: affiliateDefaultMargin.scope, source: "OVERRIDE" }
    : { ...affiliateDefaultMargin, source: affiliateDefaultMargin.scope === "FALLBACK" ? "FALLBACK" : "RULE" };
  return { subrinhoMargin, affiliateDefaultMargin, affiliateMargin };
}

/** Preço de vitrine (listagem/detalhe) de um produto para a loja do afiliado. */
export function quoteDisplayPrice(
  ctx: PricingContext,
  target: PricingTarget,
  costCurrency: Currency,
  lines: CostLine[],
) {
  const { subrinhoMargin, affiliateMargin } = resolveItemMargins(ctx, target);
  const base = priceItem({
    costCurrency,
    lines,
    fxRate: fxRateFor(ctx, costCurrency),
    subrinhoMarginPct: subrinhoMargin.pct,
    affiliateMarginPct: affiliateMargin.pct,
    installmentFeePct: ctx.installmentFeePct,
  });
  return {
    pix: base.netAffiliate,
    installment: base.installmentPrice,
    plan: installmentPlan(base.installmentPrice, ctx.maxInstallments),
  };
}

export function priceCart(
  ctx: PricingContext,
  items: CartItemForPricing[],
  coupons: { SUBRINHO?: CouponDef | null; AFFILIATE?: CouponDef | null } = {},
): PricedCart {
  const prelim = items.map((it) => {
    const margins = resolveItemMargins(ctx, it);
    const base = priceItem({
      costCurrency: it.costCurrency,
      lines: it.lines,
      fxRate: fxRateFor(ctx, it.costCurrency),
      subrinhoMarginPct: margins.subrinhoMargin.pct,
      affiliateMarginPct: margins.affiliateMargin.pct,
      installmentFeePct: ctx.installmentFeePct,
    });
    return { it, base, ...margins };
  });

  const couponResults: PricedCart["coupons"] = {};
  if (coupons.SUBRINHO) {
    couponResults.SUBRINHO = computeCoupon(
      coupons.SUBRINHO,
      prelim.map((p) => ({ id: p.it.id, category: p.it.category, price: p.base.netAffiliate, cap: p.base.subrinhoMarginAmount })),
    );
  }
  if (coupons.AFFILIATE) {
    couponResults.AFFILIATE = computeCoupon(
      coupons.AFFILIATE,
      prelim.map((p) => ({ id: p.it.id, category: p.it.category, price: p.base.netAffiliate, cap: p.base.affiliateMarginAmount })),
    );
  }

  const priced: PricedItem[] = prelim.map((p) => ({
    id: p.it.id,
    base: p.base,
    final: applyDiscounts(p.base, {
      subrinho: couponResults.SUBRINHO?.allocations.get(p.it.id) ?? ZERO,
      affiliate: couponResults.AFFILIATE?.allocations.get(p.it.id) ?? ZERO,
    }),
    subrinhoMargin: p.subrinhoMargin,
    affiliateMargin: p.affiliateMargin,
    affiliateDefaultMargin: p.affiliateDefaultMargin,
  }));

  const f = priced.map((p) => p.final);
  const installment = sum(f.map((x) => x.finalInstallment));
  const subrinhoDiscount = sum(f.map((x) => x.subrinhoDiscount));
  const affiliateDiscount = sum(f.map((x) => x.affiliateDiscount));
  return {
    items: priced,
    coupons: couponResults,
    totals: {
      costBrl: sum(f.map((x) => x.costBrl)),
      subrinhoMargin: sum(f.map((x) => x.subrinhoMarginAmount)),
      netSubrinho: sum(f.map((x) => x.netSubrinho)),
      affiliateMargin: sum(f.map((x) => x.affiliateMarginAmount)),
      netAffiliate: sum(f.map((x) => x.netAffiliate)),
      subrinhoDiscount,
      affiliateDiscount,
      discount: subrinhoDiscount.plus(affiliateDiscount),
      pix: sum(f.map((x) => x.finalPix)),
      installment,
      installmentPlan: installmentPlan(installment, ctx.maxInstallments),
      subrinhoRevenue: sum(f.map((x) => x.subrinhoRevenue)),
      affiliateCommission: sum(f.map((x) => x.affiliateCommission)),
    },
  };
}
