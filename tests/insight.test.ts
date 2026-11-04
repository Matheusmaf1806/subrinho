/** Quem vê o fornecedor e a comissão na loja (decidido no servidor). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sess = vi.hoisted(() => ({ sub: null as unknown, viewer: null as unknown, panel: null as unknown }));
vi.mock("@/server/auth/session", () => ({
  currentSubrinhoUser: async () => sess.sub,
  storeViewer: async () => sess.viewer,
  currentAffiliateUser: async () => sess.panel,
}));

import { storeInsight } from "@/app/loja/[slug]/_lib/insight";
import { quoteDisplayPrice, type PricingContext } from "@/server/pricing/cart-pricing";
import { MarginBook } from "@/server/pricing/margins";

const STORE = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("storeInsight", () => {
  beforeEach(() => {
    sess.sub = null;
    sess.viewer = null;
    sess.panel = null;
  });

  it("visitante e cliente: nada", async () => {
    expect(await storeInsight(STORE)).toEqual({ supplier: false, commission: false });
    sess.viewer = { kind: "CUSTOMER", sessionId: "s", customer: {} };
    expect(await storeInsight(STORE)).toEqual({ supplier: false, commission: false });
  });

  it("equipe Subrinho: só OWNER e ADMIN veem o fornecedor", async () => {
    for (const [role, ok] of [["OWNER", true], ["ADMIN", true], ["FINANCE", false], ["SUPPORT", false]] as const) {
      sess.sub = { id: "u", role, active: true };
      expect((await storeInsight(STORE)).supplier).toBe(ok);
      expect((await storeInsight(STORE)).commission).toBe(false);
    }
  });

  it("agência: comissão só para o ADMIN da própria loja", async () => {
    sess.viewer = { kind: "AFFILIATE", sessionId: "s", user: { role: "AGENT" }, adminMode: false, canAdmin: false };
    expect((await storeInsight(STORE)).commission).toBe(false);
    sess.viewer = { kind: "AFFILIATE", sessionId: "s", user: { role: "ADMIN" }, adminMode: false, canAdmin: true };
    expect(await storeInsight(STORE)).toEqual({ supplier: false, commission: true });
  });

  it("agência logada só no painel: comissão só na loja dela e se for ADMIN", async () => {
    sess.panel = { user: { role: "ADMIN" }, affiliate: { id: OTHER } };
    expect((await storeInsight(STORE)).commission).toBe(false);
    sess.panel = { user: { role: "AGENT" }, affiliate: { id: STORE } };
    expect((await storeInsight(STORE)).commission).toBe(false);
    sess.panel = { user: { role: "ADMIN" }, affiliate: { id: STORE } };
    expect((await storeInsight(STORE)).commission).toBe(true);
  });
});

describe("preço de vitrine", () => {
  const ctx: PricingContext = {
    affiliateId: "aff",
    margins: new MarginBook([], { subrinho: "4.5", affiliate: "3.7" }),
    fx: { USD: { rate: "5.00", source: "test", fetchedAt: "" } },
    installmentFeePct: "9.68",
    maxInstallments: 10,
  };
  const target = { category: "LODGING" as const, supplierCode: "HOTELBEDS", productId: "3424", optionId: "o" };
  const lines = [{ unitCost: "100.00", quantity: 1 }];

  it("comissão só entra quando pedida e é a margem da agência sobre o preço Pix", () => {
    const plain = quoteDisplayPrice(ctx, target, "USD", lines);
    expect("commission" in plain).toBe(false);
    const withC = quoteDisplayPrice(ctx, target, "USD", lines, null, { commission: true });
    // custo US$ 100 → R$ 500,00 → NET Subrinho 523,56 → PIX 543,68: comissão = 543,68 − 523,56
    expect(withC.pix.toFixed(2)).toBe("543.68");
    expect(withC.commission!.amount.toFixed(2)).toBe("20.12");
    expect(withC.commission!.pct.toString()).toBe("3.7");
  });
});
