import type { Category, Currency } from "@/server/db/schema";
import { computeCoupon, type CouponDef, type CouponResult } from "@/server/coupons/engine";
import { applyDiscounts, installmentPlan, priceItem, subrinhoPctForFloor, type CostLine, type FinalItemPricing, type ItemPricing, type InstallmentPlan } from "./engine";
import type { MarginBook, ResolvedMargin } from "./margins";
import { Decimal, d, maxD, minD, sum, ZERO } from "./money";

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

/** Preço mínimo de venda exigido pelo fornecedor, na moeda dele (ex.: Hotelbeds sellingRate obrigatório). */
export type MinSellPrice = { currency: Currency; amount: string };

export type CartItemForPricing = PricingTarget & {
  id: string;
  costCurrency: Currency;
  lines: CostLine[];
  affiliateMarginOverridePct?: string | null;
  minSellPrice?: MinSellPrice | null;
};

/** Valida o piso vindo dos detalhes do item (JSON). */
export function minSellPriceOf(details: unknown): MinSellPrice | null {
  const m = (details as { minSellPrice?: { currency?: unknown; amount?: unknown } } | null)?.minSellPrice;
  if (!m || !["USD", "EUR", "BRL"].includes(String(m.currency))) return null;
  const raw = String(m.amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const amount = d(raw);
  return amount.gt(0) ? { currency: m.currency as Currency, amount: amount.toFixed(2) } : null;
}

export type AffiliateMarginResolution = ResolvedMargin & { source: "RULE" | "OVERRIDE" | "FALLBACK" };

export type PriceFloor = {
  /** Piso em R$ (preço PIX mínimo). */
  minPix: Decimal;
  /** Margem Subrinho da regra, antes de subir para respeitar o piso (quando subiu). */
  ruleSubrinhoPct: Decimal | null;
  /** Preço do item sem o piso (para o modal de margem do ADMIN). */
  withoutFloor: ItemPricing;
};

export type PricedItem = {
  id: string;
  base: ItemPricing;
  final: FinalItemPricing;
  /** Preço mínimo de venda do fornecedor (quando houver). */
  floor: PriceFloor | null;
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

/** Piso em R$: valor do fornecedor × câmbio, arredondado para cima (nunca vender centavos abaixo). */
export function floorBrlOf(ctx: Pick<PricingContext, "fx">, m: MinSellPrice): Decimal {
  return d(m.amount).times(fxRateFor(ctx, m.currency)).toDecimalPlaces(2, Decimal.ROUND_UP);
}

/** Preço do item com as margens resolvidas, respeitando o preço mínimo de venda (se houver). */
function priceWithFloor(
  ctx: PricingContext,
  it: { costCurrency: Currency; lines: CostLine[]; minSellPrice?: MinSellPrice | null },
  subrinhoMargin: ResolvedMargin,
  affiliatePct: Decimal,
): { base: ItemPricing; subrinhoMargin: ResolvedMargin; floor: PriceFloor | null } {
  const input = { costCurrency: it.costCurrency, lines: it.lines, fxRate: fxRateFor(ctx, it.costCurrency), affiliateMarginPct: affiliatePct, installmentFeePct: ctx.installmentFeePct };
  const withoutFloor = priceItem({ ...input, subrinhoMarginPct: subrinhoMargin.pct });
  if (!it.minSellPrice) return { base: withoutFloor, subrinhoMargin, floor: null };
  const minPix = floorBrlOf(ctx, it.minSellPrice);
  if (withoutFloor.netAffiliate.gte(minPix)) return { base: withoutFloor, subrinhoMargin, floor: { minPix, ruleSubrinhoPct: null, withoutFloor } };
  const pct = subrinhoPctForFloor(input, subrinhoMargin.pct, minPix);
  return {
    base: priceItem({ ...input, subrinhoMarginPct: pct }),
    subrinhoMargin: { ...subrinhoMargin, pct },
    floor: { minPix, ruleSubrinhoPct: subrinhoMargin.pct, withoutFloor },
  };
}

/** Preço de vitrine (listagem/detalhe) de um produto para a loja do afiliado. */
export function quoteDisplayPrice(
  ctx: PricingContext,
  target: PricingTarget,
  costCurrency: Currency,
  lines: CostLine[],
  minSellPrice?: MinSellPrice | null,
) {
  const { subrinhoMargin, affiliateMargin } = resolveItemMargins(ctx, target);
  const { base } = priceWithFloor(ctx, { costCurrency, lines, minSellPrice }, subrinhoMargin, affiliateMargin.pct);
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
    const { base, subrinhoMargin, floor } = priceWithFloor(ctx, it, margins.subrinhoMargin, margins.affiliateMargin.pct);
    // Folga até o piso: os cupons das duas camadas, somados, não podem passar disso.
    const headroom = floor ? maxD(0, base.netAffiliate.minus(floor.minPix)) : null;
    return { it, base, floor, headroom, ...margins, subrinhoMargin };
  });

  const couponResults: PricedCart["coupons"] = {};
  if (coupons.SUBRINHO) {
    couponResults.SUBRINHO = computeCoupon(
      coupons.SUBRINHO,
      prelim.map((p) => ({
        id: p.it.id,
        category: p.it.category,
        price: p.base.netAffiliate,
        cap: p.headroom ? minD(p.base.subrinhoMarginAmount, p.headroom) : p.base.subrinhoMarginAmount,
      })),
    );
  }
  if (coupons.AFFILIATE) {
    couponResults.AFFILIATE = computeCoupon(
      coupons.AFFILIATE,
      prelim.map((p) => {
        const usedBySubrinho = couponResults.SUBRINHO?.allocations.get(p.it.id) ?? ZERO;
        return {
          id: p.it.id,
          category: p.it.category,
          price: p.base.netAffiliate,
          cap: p.headroom ? minD(p.base.affiliateMarginAmount, maxD(0, p.headroom.minus(usedBySubrinho))) : p.base.affiliateMarginAmount,
        };
      }),
    );
  }

  const priced: PricedItem[] = prelim.map((p) => ({
    id: p.it.id,
    base: p.base,
    final: applyDiscounts(p.base, {
      subrinho: couponResults.SUBRINHO?.allocations.get(p.it.id) ?? ZERO,
      affiliate: couponResults.AFFILIATE?.allocations.get(p.it.id) ?? ZERO,
    }),
    floor: p.floor,
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
