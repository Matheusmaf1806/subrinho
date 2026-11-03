import { describe, expect, it } from "vitest";
import { MarginBook, marginScopeKey, type MarginRuleLite } from "@/server/pricing/margins";

const AFF = "aff-1";
const rules: MarginRuleLite[] = [
  { id: "s-def", owner: "SUBRINHO", affiliateId: null, scope: "DEFAULT", category: null, supplierCode: null, productId: null, optionId: null, marginPct: "4.5" },
  { id: "s-lod", owner: "SUBRINHO", affiliateId: null, scope: "CATEGORY", category: "LODGING", supplierCode: null, productId: null, optionId: null, marginPct: "6" },
  { id: "s-hb", owner: "SUBRINHO", affiliateId: null, scope: "SUPPLIER", category: null, supplierCode: "HOTELBEDS", productId: null, optionId: null, marginPct: "7" },
  { id: "a-def", owner: "AFFILIATE", affiliateId: AFF, scope: "DEFAULT", category: null, supplierCode: null, productId: null, optionId: null, marginPct: "3.7" },
  { id: "a-tix", owner: "AFFILIATE", affiliateId: AFF, scope: "CATEGORY", category: "TICKETS", supplierCode: null, productId: null, optionId: null, marginPct: "8" },
  { id: "a-col", owner: "AFFILIATE", affiliateId: AFF, scope: "PRODUCT", category: "TICKETS", supplierCode: "TU_EXPERIENZA", productId: "colosseo", optionId: null, marginPct: "10" },
  { id: "a-colvat", owner: "AFFILIATE", affiliateId: AFF, scope: "PRODUCT_OPTION", category: "TICKETS", supplierCode: "TU_EXPERIENZA", productId: "colosseo", optionId: "colosseo-vaticano", marginPct: "12" },
  { id: "a-other", owner: "AFFILIATE", affiliateId: "aff-2", scope: "DEFAULT", category: null, supplierCode: null, productId: null, optionId: null, marginPct: "20" },
];
const book = new MarginBook(rules, { subrinho: "5", affiliate: "3" });

describe("resolução de margens (mais específica vence)", () => {
  it("ingresso Coliseu 1 dia usa a margem do produto", () => {
    const r = book.resolve("AFFILIATE", { category: "TICKETS", supplierCode: "TU_EXPERIENZA", productId: "colosseo", optionId: "colosseo-1d" }, AFF);
    expect(r.pct.toString()).toBe("10");
    expect(r.ruleId).toBe("a-col");
  });
  it("ingresso Coliseu + Vaticano usa a margem do tipo de ingresso", () => {
    const r = book.resolve("AFFILIATE", { category: "TICKETS", supplierCode: "TU_EXPERIENZA", productId: "colosseo", optionId: "colosseo-vaticano" }, AFF);
    expect(r.pct.toString()).toBe("12");
  });
  it("outro ingresso usa a margem da categoria", () => {
    const r = book.resolve("AFFILIATE", { category: "TICKETS", supplierCode: "NADIO", productId: "disney", optionId: null }, AFF);
    expect(r.pct.toString()).toBe("8");
  });
  it("outra categoria usa a margem padrão do afiliado", () => {
    const r = book.resolve("AFFILIATE", { category: "CHIP", supplierCode: "ESIMX", productId: "x" }, AFF);
    expect(r.pct.toString()).toBe("3.7");
  });
  it("não vaza regra de outro afiliado e usa fallback", () => {
    const r = book.resolve("AFFILIATE", { category: "CHIP", supplierCode: "ESIMX", productId: "x" }, "aff-3");
    expect(r.scope).toBe("FALLBACK");
    expect(r.pct.toString()).toBe("3");
  });
  it("Subrinho: fornecedor > categoria > padrão", () => {
    expect(book.resolve("SUBRINHO", { category: "LODGING", supplierCode: "HOTELBEDS", productId: "h" }).pct.toString()).toBe("7");
    expect(book.resolve("SUBRINHO", { category: "LODGING", supplierCode: "RATEHAWK", productId: "h" }).pct.toString()).toBe("6");
    expect(book.resolve("SUBRINHO", { category: "CHIP", supplierCode: "ESIMX", productId: "h" }).pct.toString()).toBe("4.5");
  });
  it("chave de escopo é única por alvo", () => {
    expect(marginScopeKey({ owner: "AFFILIATE", affiliateId: AFF, scope: "CATEGORY", category: "TICKETS" })).toBe("AFFILIATE:aff-1|CATEGORY|TICKETS");
  });
});
