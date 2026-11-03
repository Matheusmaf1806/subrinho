import { describe, expect, it } from "vitest";
import { applyDiscounts, installmentPlan, priceItem, PricingError } from "@/server/pricing/engine";

describe("motor de preço — exemplo da especificação", () => {
  const p = priceItem({
    costCurrency: "USD",
    lines: [{ unitCost: "100.00", quantity: 5 }],
    fxRate: "4.93",
    subrinhoMarginPct: "4.5",
    affiliateMarginPct: "3.7",
    installmentFeePct: "9.68",
  });

  it("custo em dólar = preço × quantidade", () => expect(p.costForeign.toFixed(2)).toBe("500.00"));
  it("custo R$ = custo dólar × câmbio", () => expect(p.costBrl.toFixed(2)).toBe("2465.00"));
  it("NET Subrinho = custo / (1 − 4,5%)", () => expect(p.netSubrinho.toFixed(2)).toBe("2581.15"));
  it("NET Afiliado = NET Subrinho / (1 − 3,7%)", () => expect(p.netAffiliate.toFixed(2)).toBe("2680.32"));
  it("PARCELADO = NET Afiliado / (1 − 9,68%)", () => expect(p.installmentPrice.toFixed(2)).toBe("2967.58"));
  it("margens em R$", () => {
    expect(p.subrinhoMarginAmount.toFixed(2)).toBe("116.15");
    expect(p.affiliateMarginAmount.toFixed(2)).toBe("99.17");
  });

  it("sem desconto, PIX = NET Afiliado e comissão = margem do afiliado", () => {
    const f = applyDiscounts(p);
    expect(f.finalPix.toFixed(2)).toBe("2680.32");
    expect(f.finalInstallment.toFixed(2)).toBe("2967.58");
    expect(f.affiliateCommission.toFixed(2)).toBe("99.17");
    expect(f.subrinhoRevenue.toFixed(2)).toBe("116.15");
  });
});

describe("motor de preço — reais (sem câmbio)", () => {
  it("ignora o câmbio quando a moeda é BRL", () => {
    const p = priceItem({
      costCurrency: "BRL",
      lines: [{ unitCost: "2465", quantity: 1 }],
      fxRate: "999",
      subrinhoMarginPct: "4.5",
      affiliateMarginPct: "3.7",
      installmentFeePct: "9.68",
    });
    expect(p.fxRate.toString()).toBe("1");
    expect(p.costBrl.toFixed(2)).toBe("2465.00");
    expect(p.netAffiliate.toFixed(2)).toBe("2680.32");
    expect(p.installmentPrice.toFixed(2)).toBe("2967.58");
  });

  it("soma várias linhas (adulto + criança)", () => {
    const p = priceItem({
      costCurrency: "EUR",
      lines: [
        { unitCost: "45.50", quantity: 2 },
        { unitCost: "30.25", quantity: 1 },
      ],
      fxRate: "5.40",
      subrinhoMarginPct: "0",
      affiliateMarginPct: "0",
      installmentFeePct: "0",
    });
    expect(p.costForeign.toFixed(2)).toBe("121.25");
    expect(p.costBrl.toFixed(2)).toBe("654.75");
    expect(p.netAffiliate.toFixed(2)).toBe("654.75");
  });
});

describe("validações", () => {
  const base = { costCurrency: "BRL" as const, lines: [{ unitCost: 10, quantity: 1 }], fxRate: 1, installmentFeePct: 9.68 };
  it("margem nunca pode ser menor que zero", () => {
    expect(() => priceItem({ ...base, subrinhoMarginPct: -1, affiliateMarginPct: 1 })).toThrow(PricingError);
    expect(() => priceItem({ ...base, subrinhoMarginPct: 1, affiliateMarginPct: -0.01 })).toThrow(PricingError);
  });
  it("margem precisa ser menor que 100%", () => {
    expect(() => priceItem({ ...base, subrinhoMarginPct: 100, affiliateMarginPct: 1 })).toThrow(PricingError);
  });
  it("desconto nunca pode passar da margem da camada", () => {
    const p = priceItem({ ...base, subrinhoMarginPct: 10, affiliateMarginPct: 10 });
    expect(() => applyDiscounts(p, { affiliate: p.affiliateMarginAmount.plus(0.01) })).toThrow(PricingError);
  });
  it("câmbio ausente gera erro", () => {
    expect(() =>
      priceItem({ ...base, costCurrency: "USD", fxRate: 0, subrinhoMarginPct: 1, affiliateMarginPct: 1 }),
    ).toThrow(PricingError);
  });
});

describe("descontos saem da margem da camada", () => {
  const p = priceItem({
    costCurrency: "USD",
    lines: [{ unitCost: "100.00", quantity: 5 }],
    fxRate: "4.93",
    subrinhoMarginPct: "4.5",
    affiliateMarginPct: "3.7",
    installmentFeePct: "9.68",
  });

  it("desconto do afiliado reduz apenas a comissão do afiliado", () => {
    const f = applyDiscounts(p, { affiliate: "50" });
    expect(f.finalPix.toFixed(2)).toBe("2630.32");
    expect(f.affiliateCommission.toFixed(2)).toBe("49.17");
    expect(f.subrinhoRevenue.toFixed(2)).toBe("116.15");
    expect(f.finalInstallment.toFixed(2)).toBe("2912.22");
  });

  it("desconto da Subrinho reduz apenas a receita da Subrinho", () => {
    const f = applyDiscounts(p, { subrinho: "116.15" });
    expect(f.finalPix.toFixed(2)).toBe("2564.17");
    expect(f.subrinhoRevenue.toFixed(2)).toBe("0.00");
    expect(f.effectiveSubrinhoMarginPct.toFixed(2)).toBe("0.00");
    expect(f.affiliateCommission.toFixed(2)).toBe("99.17");
  });
});

describe("parcelamento", () => {
  it("10x sem juros, primeira parcela absorve centavos", () => {
    const plan = installmentPlan("2967.58", 10);
    expect(plan.installment.toFixed(2)).toBe("296.75");
    expect(plan.first.toFixed(2)).toBe("296.83");
    expect(plan.first.plus(plan.installment.times(9)).toFixed(2)).toBe("2967.58");
  });
});
