/** Preço mínimo de venda (Hotelbeds hotelMandatory / tarifa comissionada). */
import { describe, expect, it } from "vitest";
import { priceItem, subrinhoPctForFloor } from "@/server/pricing/engine";
import { minSellPriceOf, priceCart, quoteDisplayPrice, type PricingContext } from "@/server/pricing/cart-pricing";
import { MarginBook } from "@/server/pricing/margins";
import type { CouponDef } from "@/server/coupons/engine";

const ctx: PricingContext = {
  affiliateId: "aff",
  margins: new MarginBook([], { subrinho: "4.5", affiliate: "3.7" }),
  fx: { USD: { rate: "5.00", source: "test", fetchedAt: "" } },
  installmentFeePct: "9.68",
  maxInstallments: 10,
};
// custo US$ 100 → R$ 500,00 → NET Subrinho 523,56 → PIX 543,68 (sem piso)
const hotel = { id: "h1", category: "LODGING" as const, supplierCode: "HOTELBEDS", productId: "3424", optionId: "o", costCurrency: "USD" as const, lines: [{ unitCost: "100.00", quantity: 1 }] };
const floorUsd = { currency: "USD" as const, amount: "120.00" }; // piso R$ 600,00

const coupon = (over: Partial<CouponDef>): CouponDef =>
  ({
    id: "c",
    code: "X",
    issuer: "AFFILIATE",
    affiliateId: "aff",
    description: null,
    discountType: "PERCENT",
    percentOff: "10",
    amountOff: null,
    stepAmount: null,
    maxDiscount: null,
    minSubtotal: null,
    categories: [],
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    redemptions: 0,
    active: true,
    ...over,
  }) as CouponDef;

describe("preço mínimo de venda", () => {
  it("margem Subrinho mínima exata para o PIX alcançar o piso", () => {
    const input = { costCurrency: "USD" as const, lines: hotel.lines, fxRate: "5.00", affiliateMarginPct: "3.7", installmentFeePct: "9.68" };
    const pct = subrinhoPctForFloor(input, "4.5", "600.00");
    expect(priceItem({ ...input, subrinhoMarginPct: pct }).netAffiliate.gte(600)).toBe(true);
    expect(priceItem({ ...input, subrinhoMarginPct: pct.minus("0.0001") }).netAffiliate.lt(600)).toBe(true);
    // piso abaixo do preço normal: nada muda
    expect(subrinhoPctForFloor(input, "4.5", "500.00").toFixed(4)).toBe("4.5000");
  });

  it("vitrine e carrinho respeitam o piso (a Subrinho completa a diferença)", () => {
    expect(quoteDisplayPrice(ctx, hotel, "USD", hotel.lines).pix.toFixed(2)).toBe("543.68");
    const shown = quoteDisplayPrice(ctx, hotel, "USD", hotel.lines, floorUsd);
    expect(shown.pix.gte(600)).toBe(true);
    expect(shown.pix.lt("600.02")).toBe(true);
    const c = priceCart(ctx, [{ ...hotel, minSellPrice: floorUsd }]);
    const it0 = c.items[0];
    expect(it0.final.finalPix.toFixed(2)).toBe(shown.pix.toFixed(2));
    expect(it0.floor!.minPix.toFixed(2)).toBe("600.00");
    expect(it0.floor!.ruleSubrinhoPct!.toFixed(2)).toBe("4.50");
    expect(it0.subrinhoMargin.pct.gt("4.5")).toBe(true);
    // a margem do afiliado continua a da regra
    expect(it0.final.affiliateMarginPct.toFixed(4)).toBe("3.7000");
  });

  it("cupons não baixam o preço abaixo do piso", () => {
    const c = priceCart(ctx, [{ ...hotel, minSellPrice: { currency: "USD", amount: "110.00" } }], {
      SUBRINHO: coupon({ id: "s", issuer: "SUBRINHO", affiliateId: null, discountType: "FIXED", amountOff: "500" }),
      AFFILIATE: coupon({ id: "a", discountType: "PERCENT", percentOff: "50" }),
    });
    const f = c.items[0].final;
    expect(f.finalPix.gte("550.00")).toBe(true);
    expect(f.finalPix.toFixed(2)).toBe("550.00"); // desconta só até o piso
    expect(c.coupons.SUBRINHO!.limitedByMargin).toBe(true);
  });

  it("override de margem do afiliado para 0%: o piso continua valendo", () => {
    const c = priceCart(ctx, [{ ...hotel, minSellPrice: floorUsd, affiliateMarginOverridePct: "0" }]);
    expect(c.items[0].final.finalPix.gte(600)).toBe(true);
    expect(c.items[0].final.affiliateCommission.toFixed(2)).toBe("0.00");
  });

  it("sem piso: conta idêntica à de antes", () => {
    const a = priceCart(ctx, [hotel]).items[0].final;
    const b = priceCart(ctx, [{ ...hotel, minSellPrice: { currency: "USD", amount: "50.00" } }]).items[0].final;
    expect(b.finalPix.toFixed(2)).toBe(a.finalPix.toFixed(2));
    expect(b.subrinhoMarginPct.toFixed(4)).toBe(a.subrinhoMarginPct.toFixed(4));
  });

  it("lê o piso dos detalhes do item com segurança", () => {
    expect(minSellPriceOf({ minSellPrice: { currency: "EUR", amount: "99.9" } })).toEqual({ currency: "EUR", amount: "99.90" });
    expect(minSellPriceOf({ minSellPrice: { currency: "GBP", amount: "1" } })).toBeNull();
    expect(minSellPriceOf({ minSellPrice: { currency: "USD", amount: "abc" } })).toBeNull();
    expect(minSellPriceOf(null)).toBeNull();
  });
});
