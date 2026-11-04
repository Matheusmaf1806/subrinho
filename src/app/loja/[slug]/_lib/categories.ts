/** Categorias que a loja mostra: só as que têm fornecedor com API real (e ativo no Painel Subrinho). */
import { db } from "@/server/db";
import { activeSupplierCodes } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import type { Category } from "@/server/db/schema";
import { STORE_CATEGORIES } from "../_components/category";

export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export async function storeCategories(): Promise<{ live: StoreCategory[]; soon: StoreCategory[] }> {
  const active = await activeSupplierCodes(db).catch(() => new Set<string>());
  const has = (c: Category) => adaptersFor(c, active).length > 0;
  return { live: STORE_CATEGORIES.filter((c) => has(c.category)), soon: STORE_CATEGORIES.filter((c) => !has(c.category)) };
}

export async function categoryAvailable(category: Category): Promise<boolean> {
  return (await storeCategories()).live.some((c) => c.category === category);
}
