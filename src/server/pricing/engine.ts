/**
 * Motor de preço da Subrinho.
 *
 * Para TODO item de TODA categoria:
 *   1. Custo na moeda do fornecedor = Σ (preço unitário × quantidade)
 *   2. Custo R$ = custo na moeda × câmbio (Dólar/Euro vindo da API; BRL = 1)
 *   3. NET Subrinho = Custo R$ / (1 − margem Subrinho)
 *   4. NET Afiliado = NET Subrinho / (1 − margem Afiliado)        ← preço PIX
 *   5. PARCELADO    = NET Afiliado / (1 − taxa do parcelado)       ← 10x sem juros
 *
 * Exemplo (USD): $100 × 5 = $500 → × 4,93 = R$ 2.465,00 → /(1−4,5%) = R$ 2.581,15
 *   → /(1−3,7%) = R$ 2.680,32 → /(1−9,68%) = R$ 2.967,58
 *
 * Cada etapa é arredondada para centavos (meio para cima), de modo que o que é exibido
 * é exatamente o que é somado e gravado.
 *
 * Descontos (cupons) entram DEPOIS da formação do preço e saem da margem da camada que
 * emitiu o cupom (Subrinho ou Afiliado), nunca deixando essa margem negativa.
 */
import type { Currency } from "@/server/db/schema";
import { Decimal, type DecimalInput, d, grossUp, round2, round4, sum, ZERO, HUNDRED } from "./money";

export type CostLine = { unitCost: DecimalInput; quantity: number };

export type ItemPricingInput = {
  costCurrency: Currency;
  lines: CostLine[];
  /** Cotação da moeda do custo em BRL. Ignorado quando costCurrency = BRL. */
  fxRate: DecimalInput;
  subrinhoMarginPct: DecimalInput;
  affiliateMarginPct: DecimalInput;
  installmentFeePct: DecimalInput;
};

export type ItemPricing = {
  costCurrency: Currency;
  costForeign: Decimal;
  fxRate: Decimal;
  costBrl: Decimal;
  subrinhoMarginPct: Decimal;
  subrinhoMarginAmount: Decimal;
  netSubrinho: Decimal;
  affiliateMarginPct: Decimal;
  affiliateMarginAmount: Decimal;
  netAffiliate: Decimal;
  installmentFeePct: Decimal;
  installmentPrice: Decimal;
};

export type ItemDiscounts = { subrinho?: DecimalInput; affiliate?: DecimalInput };

export type FinalItemPricing = ItemPricing & {
  subrinhoDiscount: Decimal;
  affiliateDiscount: Decimal;
  /** Preço final no PIX (NET Afiliado − descontos). */
  finalPix: Decimal;
  /** Preço final parcelado (finalPix / (1 − taxa)). */
  finalInstallment: Decimal;
  /** Receita da Subrinho no item (margem Subrinho − desconto Subrinho). */
  subrinhoRevenue: Decimal;
  /** Comissão do afiliado no item (margem afiliado − desconto afiliado). */
  affiliateCommission: Decimal;
  effectiveSubrinhoMarginPct: Decimal;
  effectiveAffiliateMarginPct: Decimal;
};

export class PricingError extends Error {}

function assertPct(name: string, v: Decimal) {
  if (v.isNaN() || v.lt(0)) throw new PricingError(`${name} não pode ser menor que 0%`);
  if (v.gte(100)) throw new PricingError(`${name} precisa ser menor que 100%`);
}

export function costForeignOf(lines: CostLine[]): Decimal {
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 0) throw new PricingError("Quantidade inválida");
    if (d(l.unitCost).lt(0)) throw new PricingError("Preço unitário inválido");
  }
  return round4(sum(lines.map((l) => d(l.unitCost).times(l.quantity))));
}

export function priceItem(input: ItemPricingInput): ItemPricing {
  const subrinhoMarginPct = d(input.subrinhoMarginPct);
  const affiliateMarginPct = d(input.affiliateMarginPct);
  const installmentFeePct = d(input.installmentFeePct);
  assertPct("Margem Subrinho", subrinhoMarginPct);
  assertPct("Margem do afiliado", affiliateMarginPct);
  assertPct("Taxa do parcelado", installmentFeePct);

  const fxRate = input.costCurrency === "BRL" ? new Decimal(1) : d(input.fxRate);
  if (fxRate.lte(0)) throw new PricingError(`Câmbio ${input.costCurrency} indisponível`);

  const costForeign = costForeignOf(input.lines);
  const costBrl = round2(costForeign.times(fxRate));
  const netSubrinho = round2(grossUp(costBrl, subrinhoMarginPct));
  const netAffiliate = round2(grossUp(netSubrinho, affiliateMarginPct));
  const installmentPrice = round2(grossUp(netAffiliate, installmentFeePct));

  return {
    costCurrency: input.costCurrency,
    costForeign,
    fxRate,
    costBrl,
    subrinhoMarginPct,
    subrinhoMarginAmount: netSubrinho.minus(costBrl),
    netSubrinho,
    affiliateMarginPct,
    affiliateMarginAmount: netAffiliate.minus(netSubrinho),
    netAffiliate,
    installmentFeePct,
    installmentPrice,
  };
}

/** Margem "por dentro" efetiva: lucro / preço de venda da camada, em pontos percentuais. */
function effectivePct(profit: Decimal, price: Decimal): Decimal {
  if (price.lte(0)) return ZERO;
  return profit.div(price).times(HUNDRED).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function applyDiscounts(p: ItemPricing, discounts: ItemDiscounts = {}): FinalItemPricing {
  const subrinhoDiscount = round2(discounts.subrinho ?? 0);
  const affiliateDiscount = round2(discounts.affiliate ?? 0);
  if (subrinhoDiscount.lt(0) || affiliateDiscount.lt(0)) throw new PricingError("Desconto negativo");
  if (subrinhoDiscount.gt(p.subrinhoMarginAmount))
    throw new PricingError("Desconto Subrinho maior que a margem Subrinho do item");
  if (affiliateDiscount.gt(p.affiliateMarginAmount))
    throw new PricingError("Desconto do afiliado maior que a margem do afiliado no item");

  const subrinhoRevenue = p.subrinhoMarginAmount.minus(subrinhoDiscount);
  const affiliateCommission = p.affiliateMarginAmount.minus(affiliateDiscount);
  const netSubrinhoAfter = p.netSubrinho.minus(subrinhoDiscount);
  const finalPix = p.netAffiliate.minus(subrinhoDiscount).minus(affiliateDiscount);
  const finalInstallment =
    subrinhoDiscount.isZero() && affiliateDiscount.isZero()
      ? p.installmentPrice
      : round2(grossUp(finalPix, p.installmentFeePct));

  return {
    ...p,
    subrinhoDiscount,
    affiliateDiscount,
    finalPix,
    finalInstallment,
    subrinhoRevenue,
    affiliateCommission,
    effectiveSubrinhoMarginPct: effectivePct(subrinhoRevenue, netSubrinhoAfter),
    effectiveAffiliateMarginPct: effectivePct(affiliateCommission, finalPix),
  };
}

export type InstallmentPlan = { count: number; total: Decimal; installment: Decimal; first: Decimal };

/** Divide o total parcelado em N parcelas iguais; a primeira absorve a diferença de centavos. */
export function installmentPlan(total: DecimalInput, count: number): InstallmentPlan {
  const t = round2(total);
  const n = Math.max(1, Math.floor(count));
  const installment = t.div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const first = t.minus(installment.times(n - 1));
  return { count: n, total: t, installment, first };
}
