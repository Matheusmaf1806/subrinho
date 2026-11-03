/** Busca e detalhe de produtos agregando fornecedores, já com o preço da loja do afiliado. */
import { eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { suppliers, type Category } from "@/server/db/schema";
import { quoteDisplayPrice, type PricingContext } from "@/server/pricing/cart-pricing";
import { adaptersFor, getAdapter } from "@/server/suppliers/registry";
import type { OfferOption, ProductDetail, ProductSummary, SearchParams } from "@/server/suppliers/types";
import type { Decimal } from "@/server/pricing/money";
import type { InstallmentPlan } from "@/server/pricing/engine";

export type DisplayPrice = { pix: Decimal; installment: Decimal; plan: InstallmentPlan };
export type PricedSummary = ProductSummary & { price: DisplayPrice; offers: number };
export type PricedOption = OfferOption & { supplierCode: string; productId: string; price: DisplayPrice | null };
export type PricedDetail = Omit<ProductDetail, "options"> & { price: DisplayPrice; options: PricedOption[] };

export async function activeSupplierCodes(tx: Tx): Promise<Set<string>> {
  const rows = await tx.select({ code: suppliers.code }).from(suppliers).where(eq(suppliers.active, true));
  return new Set(rows.map((r) => r.code));
}

function priceOf(ctx: PricingContext, s: { category: Category; supplierCode: string; productId: string }, optionId: string | null, o: Pick<OfferOption, "currency" | "lines">) {
  try {
    return quoteDisplayPrice(ctx, { ...s, optionId }, o.currency, o.lines);
  } catch {
    return null;
  }
}

export async function searchCatalog(tx: Tx, ctx: PricingContext, category: Category, params: SearchParams): Promise<PricedSummary[]> {
  const active = await activeSupplierCodes(tx);
  const results = await Promise.all(
    adaptersFor(category, active).map((a) => a.search(params).catch(() => [] as ProductSummary[])),
  );
  const priced: PricedSummary[] = [];
  for (const s of results.flat()) {
    const price = priceOf(ctx, s, null, s);
    if (price) priced.push({ ...s, price, offers: 1 });
  }
  // Mesmo hotel em vários fornecedores → mostra o menor preço.
  const grouped = new Map<string, PricedSummary>();
  for (const p of priced) {
    const key = p.groupKey ?? `${p.supplierCode}:${p.productId}`;
    const cur = grouped.get(key);
    if (!cur) grouped.set(key, p);
    else {
      const best = p.price.pix.lt(cur.price.pix) ? p : cur;
      grouped.set(key, { ...best, offers: cur.offers + 1 });
    }
  }
  return [...grouped.values()].sort((a, b) => a.price.pix.comparedTo(b.price.pix));
}

export async function getProductDetail(
  tx: Tx,
  ctx: PricingContext,
  supplierCode: string,
  productId: string,
  params: SearchParams,
): Promise<PricedDetail | null> {
  const active = await activeSupplierCodes(tx);
  if (!active.has(supplierCode)) return null;
  const adapter = getAdapter(supplierCode);
  const detail = await adapter.getProduct(productId, params);
  if (!detail) return null;

  let options: PricedOption[] = detail.options.map((o) => ({
    ...o,
    supplierCode,
    productId: detail.productId,
    price: priceOf(ctx, detail, o.optionId, o),
  }));

  // Hotel vendido por outros fornecedores: junta as opções e mantém a mais barata por quarto/regime.
  if (detail.groupKey) {
    for (const other of adaptersFor(detail.category, active)) {
      if (other.code === supplierCode) continue;
      const list = await other.search({ ...params, destination: detail.destination }).catch(() => []);
      const twin = list.find((x) => x.groupKey === detail.groupKey);
      if (!twin) continue;
      const od = await other.getProduct(twin.productId, params).catch(() => null);
      if (!od) continue;
      options.push(
        ...od.options.map((o) => ({ ...o, supplierCode: other.code, productId: od.productId, price: priceOf(ctx, od, o.optionId, o) })),
      );
    }
    const byTitle = new Map<string, PricedOption>();
    for (const o of options) {
      const cur = byTitle.get(o.title);
      if (!cur || (o.price && (!cur.price || o.price.pix.lt(cur.price.pix)))) byTitle.set(o.title, o);
    }
    options = [...byTitle.values()];
  }
  options.sort((a, b) => (a.price && b.price ? a.price.pix.comparedTo(b.price.pix) : a.price ? -1 : 1));
  const price = priceOf(ctx, detail, null, detail);
  if (!price) return null;
  return { ...detail, price, options };
}
