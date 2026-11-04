/**
 * Contexto do "Adicionar ao carrinho" rápido dos cards: ações presas à loja + padrões (datas e pessoas
 * do carrinho; sem carrinho, os da busca atual). Os padrões ficam em quick-defaults.ts.
 */
import "server-only";
import type { SearchDefaults } from "../_components/search-forms";
import type { Store } from "./store";
import { addToCartAction, quickOptionsAction } from "../actions";
import type { QuickCtx } from "../_components/quick-add";
import { quickDefaults, type Explicit } from "./quick-defaults";

export type { QuickDefaults } from "./quick-defaults";

/** O que a busca da página definiu de fato (datas na URL), para o adicionar rápido abrir já com preços. */
export function explicitFrom(raw: Record<string, string | string[] | undefined>): Explicit {
  const has = (k: string) => typeof raw[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw[k] as string);
  return { date: has("data"), stay: has("checkin") && has("checkout") };
}

/** Tudo que o card precisa para o adicionar rápido (ações já presas à loja + padrões). */
export async function quickContext(store: Store, d: Required<SearchDefaults>, minDate: string, explicit: Explicit = {}): Promise<QuickCtx> {
  return { add: addToCartAction.bind(null, store.slug), options: quickOptionsAction.bind(null, store.slug), defaults: await quickDefaults(store, d, minDate, { explicit }), minDate };
}
