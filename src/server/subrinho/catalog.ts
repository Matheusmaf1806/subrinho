/**
 * Catálogo dos fornecedores para escolher produtos/opções nas regras de margem do Painel Subrinho.
 * Consulta os adapters (mock ou API real) sem preço — só identificadores e nomes.
 */
import { getAdapter } from "@/server/suppliers/registry";
import type { ProductDetail, ProductSummary } from "@/server/suppliers/types";

export type CatalogProduct = { productId: string; title: string; subtitle?: string; location: string };
export type CatalogOption = { optionId: string; title: string; description?: string };

function adapterOrNull(code: string) {
  try {
    return getAdapter(code);
  } catch {
    return null;
  }
}

/** Produtos de um fornecedor (busca geral + por destino, sem duplicar). */
export async function supplierProducts(code: string): Promise<CatalogProduct[]> {
  const a = adapterOrNull(code);
  if (!a) return [];
  const dests = (() => {
    try {
      return a.destinations();
    } catch {
      return [];
    }
  })();
  const lists = await Promise.all(
    [a.search({}), ...dests.map((dst) => a.search({ destination: dst.id }))].map((p) => p.catch(() => [] as ProductSummary[])),
  );
  const out = new Map<string, CatalogProduct>();
  for (const p of lists.flat()) {
    if (!out.has(p.productId)) out.set(p.productId, { productId: p.productId, title: p.title, subtitle: p.subtitle, location: p.location });
  }
  return [...out.values()].sort((x, y) => x.title.localeCompare(y.title, "pt-BR"));
}

/** Opções (tipos de ingresso, quartos/regime, regiões...) de um produto. */
export async function productOptions(code: string, productId: string): Promise<{ product: CatalogProduct | null; options: CatalogOption[] }> {
  const a = adapterOrNull(code);
  if (!a) return { product: null, options: [] };
  const dests = (() => {
    try {
      return a.destinations();
    } catch {
      return [];
    }
  })();
  const details = await Promise.all(
    [a.getProduct(productId, {}), ...dests.map((dst) => a.getProduct(productId, { destination: dst.id }))].map((p) =>
      p.catch(() => null as ProductDetail | null),
    ),
  );
  const first = details.find((x): x is ProductDetail => !!x) ?? null;
  const opts = new Map<string, CatalogOption>();
  for (const det of details) {
    for (const o of det?.options ?? []) if (!opts.has(o.optionId)) opts.set(o.optionId, { optionId: o.optionId, title: o.title, description: o.description });
  }
  return {
    product: first ? { productId: first.productId, title: first.title, subtitle: first.subtitle, location: first.location } : null,
    options: [...opts.values()],
  };
}
