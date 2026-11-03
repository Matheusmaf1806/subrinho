import { describe, expect, it } from "vitest";
import { allocateCapped, checkCouponValidity, computeCoupon, type CouponDef } from "@/server/coupons/engine";
import { priceCart, type PricingContext } from "@/server/pricing/cart-pricing";
import { MarginBook } from "@/server/pricing/margins";
import { d } from "@/server/pricing/money";

const base: CouponDef = {
  id: "c1", code: "X", issuer: "AFFILIATE", affiliateId: "aff", discountType: "PERCENT",
  percentOff: null, amountOff: null, stepAmount: null, maxDiscount: null, minSubtotal: null,
  categories: [], startsAt: null, endsAt: null, maxRedemptions: null, redemptions: 0, active: true,
};

describe("alocação com teto", () => {
  it("respeita tetos e redistribui", () => {
    const a = allocateCapped(
      [ { id: "a", weight: 100, cap: 5 }, { id: "b", weight: 100, cap: 1000 } ],
      100,
    );
    expect(a.get("a")).toBe(5);
    expect(a.get("b")).toBe(95);
  });
  it("nunca passa da soma dos tetos", () => {
    const a = allocateCapped([ { id: "a", weight: 1, cap: 3 }, { id: "b", weight: 1, cap: 4 } ], 1000);
    expect(a.get("a")! + a.get("b")!).toBe(7);
  });
  it("soma exata com arredondamento", () => {
    const a = allocateCapped([ { id: "a", weight: 1, cap: 1000 }, { id: "b", weight: 1, cap: 1000 }, { id: "c", weight: 1, cap: 1000 } ], 100);
    expect([...a.values()].reduce((s, v) => s + v, 0)).toBe(100);
  });
});

describe("tipos de cupom", () => {
  const items = [
    { id: "t", category: "TICKETS" as const, price: d("6000"), cap: d("500") },
    { id: "h", category: "LODGING" as const, price: d("5000"), cap: d("400") },
  ];
  it("percentual sobre itens elegíveis", () => {
    const r = computeCoupon({ ...base, discountType: "PERCENT", percentOff: "5" }, items);
    expect(r.total.toFixed(2)).toBe("550.00");
  });
  it("valor fixo", () => {
    const r = computeCoupon({ ...base, discountType: "FIXED", amountOff: "100" }, items);
    expect(r.total.toFixed(2)).toBe("100.00");
  });
  it("condicional: R$100 a cada R$10.000", () => {
    const r = computeCoupon({ ...base, discountType: "CONDITIONAL", amountOff: "100", stepAmount: "10000" }, items);
    expect(r.total.toFixed(2)).toBe("100.00"); // 11.000 → 1×
    const r2 = computeCoupon({ ...base, discountType: "CONDITIONAL", amountOff: "100", stepAmount: "5000" }, items);
    expect(r2.total.toFixed(2)).toBe("200.00"); // 11.000 → 2×
  });
  it("por categoria", () => {
    const r = computeCoupon({ ...base, discountType: "PERCENT", percentOff: "10", categories: ["LODGING"] }, items);
    expect(r.eligibleSubtotal.toFixed(2)).toBe("5000.00");
    expect(r.total.toFixed(2)).toBe("400.00"); // teto = margem do item
    expect(r.limitedByMargin).toBe(true);
    expect(r.allocations.has("t")).toBe(false);
  });
  it("margem nunca fica negativa", () => {
    const r = computeCoupon({ ...base, discountType: "FIXED", amountOff: "5000" }, items);
    expect(r.total.toFixed(2)).toBe("900.00");
  });
  it("subtotal mínimo", () => {
    const r = computeCoupon({ ...base, discountType: "FIXED", amountOff: "10", minSubtotal: "20000" }, items);
    expect(r.total.toFixed(2)).toBe("0.00");
    expect(r.notApplied).toBeTruthy();
  });
});

describe("validade", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  it("cupom de afiliado só vale na loja dele", () => {
    expect(checkCouponValidity(base, { affiliateId: "outro", now }).ok).toBe(false);
    expect(checkCouponValidity(base, { affiliateId: "aff", now }).ok).toBe(true);
  });
  it("expirado / esgotado", () => {
    expect(checkCouponValidity({ ...base, endsAt: new Date("2026-11-01") }, { affiliateId: "aff", now }).ok).toBe(false);
    expect(checkCouponValidity({ ...base, maxRedemptions: 1, redemptions: 1 }, { affiliateId: "aff", now }).ok).toBe(false);
  });
});

describe("carrinho com cupons nas duas camadas", () => {
  const ctx: PricingContext = {
    affiliateId: "aff",
    margins: new MarginBook([], { subrinho: "4.5", affiliate: "3.7" }),
    fx: { USD: { rate: "4.93", source: "test", fetchedAt: "" } },
    installmentFeePct: "9.68",
    maxInstallments: 10,
  };
  const items = [
    { id: "i1", category: "TICKETS" as const, supplierCode: "NADIO", productId: "p", costCurrency: "USD" as const, lines: [{ unitCost: "100", quantity: 5 }] },
  ];

  it("sem cupom bate com a especificação", () => {
    const c = priceCart(ctx, items);
    expect(c.totals.pix.toFixed(2)).toBe("2680.32");
    expect(c.totals.installment.toFixed(2)).toBe("2967.58");
  });

  it("cupom Subrinho + cupom afiliado", () => {
    const c = priceCart(ctx, items, {
      SUBRINHO: { ...base, id: "s", issuer: "SUBRINHO", affiliateId: null, discountType: "FIXED", amountOff: "50" },
      AFFILIATE: { ...base, id: "a", discountType: "PERCENT", percentOff: "10" },
    });
    expect(c.totals.subrinhoDiscount.toFixed(2)).toBe("50.00");
    // 10% de 2680,32 = 268,03 mas a margem do afiliado é 99,17 → limitado
    expect(c.totals.affiliateDiscount.toFixed(2)).toBe("99.17");
    expect(c.coupons.AFFILIATE!.limitedByMargin).toBe(true);
    expect(c.totals.pix.toFixed(2)).toBe("2531.15");
    expect(c.totals.affiliateCommission.toFixed(2)).toBe("0.00");
  });

  it("override de margem no checkout (somente neste carrinho)", () => {
    const c = priceCart(ctx, [{ ...items[0], affiliateMarginOverridePct: "10" }]);
    expect(c.items[0].affiliateMargin.source).toBe("OVERRIDE");
    expect(c.items[0].affiliateDefaultMargin.pct.toString()).toBe("3.7");
    expect(c.totals.pix.toFixed(2)).toBe("2867.94"); // 2581,15 / 0,9
  });
});
