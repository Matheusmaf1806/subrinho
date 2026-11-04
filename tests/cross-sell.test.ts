/** "Complete sua viagem": o que sugerir depois de adicionar algo ao carrinho. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Decimal } from "decimal.js";
import { crossSellTarget, rankCrossSell } from "@/app/loja/[slug]/_lib/cross-sell";
import { cleanDestination } from "@/server/cart/service";
import type { PricedSummary } from "@/server/catalog";
import type { Category } from "@/server/db/schema";

const ALL = new Set<Category>(["TICKETS", "LODGING", "HOUSES", "INSURANCE", "CHIP"]);
const item = (category: Category, destination: string | null) => ({ category, destination });

describe("crossSellTarget", () => {
  it("hotel em Paris → experiências", () => {
    expect(crossSellTarget([item("LODGING", "Paris")], ALL)).toEqual({ anchor: 0, order: ["TICKETS"] });
  });
  it("casa → experiências", () => {
    expect(crossSellTarget([item("HOUSES", "Orlando")], ALL)?.order).toEqual(["TICKETS"]);
  });
  it("só ingresso → hotel (casas como alternativa)", () => {
    expect(crossSellTarget([item("TICKETS", "Roma")], ALL)?.order).toEqual(["LODGING", "HOUSES"]);
  });
  it("ingresso com hotel na mesma cidade → mais experiências", () => {
    expect(crossSellTarget([item("TICKETS", "Paris"), item("LODGING", "paris, França")], ALL)?.order).toEqual(["TICKETS"]);
  });
  it("ingresso em outra cidade que o hotel → hotel para essa cidade", () => {
    expect(crossSellTarget([item("TICKETS", "Roma"), item("LODGING", "Paris")], ALL)?.order).toEqual(["LODGING", "HOUSES"]);
  });
  it("usa o item mais recente que tem destino; seguro e chip não contam", () => {
    expect(crossSellTarget([item("INSURANCE", "Europa"), item("TICKETS", null), item("LODGING", "Lisboa")], ALL)).toEqual({ anchor: 2, order: ["TICKETS"] });
  });
  it("só sugere categoria com fornecedor ativo", () => {
    expect(crossSellTarget([item("LODGING", "Paris")], new Set<Category>(["LODGING"]))).toBeNull();
    expect(crossSellTarget([item("TICKETS", "Orlando")], new Set<Category>(["TICKETS", "HOUSES"]))?.order).toEqual(["HOUSES"]);
  });
  it("carrinho sem destino: nada", () => {
    expect(crossSellTarget([item("TICKETS", null)], ALL)).toBeNull();
    expect(crossSellTarget([], ALL)).toBeNull();
  });
});

const p = (id: string, pix: number, extra: Partial<PricedSummary> = {}) =>
  ({ productId: id, supplierCode: "X", title: id, price: { pix: new Decimal(pix), installment: new Decimal(pix), plan: { count: 1, installment: new Decimal(pix) } }, ...extra }) as unknown as PricedSummary;

describe("rankCrossSell", () => {
  it("hotéis: 3 estrelas ou mais, pelo melhor preço", () => {
    const list = [p("a", 300, { stars: 2 }), p("b", 900, { stars: 4 }), p("c", 500, { stars: 3 }), p("d", 700, { stars: 5 }), p("e", 100, { stars: 1 })];
    expect(rankCrossSell(list, "LODGING").map((x) => x.productId)).toEqual(["c", "d", "b"]);
  });
  it("hotéis: poucos com 3 estrelas → usa todos", () => {
    const list = [p("a", 300, { stars: 2 }), p("b", 900, { stars: 4 }), p("c", 100)];
    expect(rankCrossSell(list, "LODGING").map((x) => x.productId)).toEqual(["c", "a", "b"]);
  });
  it("experiências: avaliação primeiro, depois a ordem do fornecedor", () => {
    const list = [p("a", 50), p("b", 90, { rating: 4.8 }), p("c", 10), p("d", 70, { rating: 4.2 })];
    expect(rankCrossSell(list, "TICKETS").map((x) => x.productId)).toEqual(["b", "d", "a"]);
  });
});

describe("cleanDestination", () => {
  it("guarda só texto simples e curto", () => {
    expect(cleanDestination("  Paris, França ")).toBe("Paris, França");
    expect(cleanDestination("<script>x</script>")).toBe("script x script");
    expect(cleanDestination("")).toBeNull();
    expect(cleanDestination(undefined)).toBeNull();
    expect(cleanDestination("a".repeat(200))?.length).toBe(80);
  });
});
