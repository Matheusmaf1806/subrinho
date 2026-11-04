/**
 * Contexto do "Adicionar ao carrinho" rápido dos cards: ações presas à loja + padrões (datas e pessoas
 * do carrinho; sem carrinho, os da busca atual). Os padrões ficam em quick-defaults.ts.
 */
import "server-only";
import type { SearchDefaults } from "../_components/search-forms";
import type { Store } from "./store";
import { addToCartAction, quickOptionsAction } from "../actions";
import type { QuickCtx } from "../_components/quick-add";
import { quickDefaults } from "./quick-defaults";

export type { QuickDefaults } from "./quick-defaults";

/** Tudo que o card precisa para o adicionar rápido (ações já presas à loja + padrões). */
export async function quickContext(store: Store, d: Required<SearchDefaults>, minDate: string): Promise<QuickCtx> {
  return { add: addToCartAction.bind(null, store.slug), options: quickOptionsAction.bind(null, store.slug), defaults: await quickDefaults(store, d, minDate), minDate };
}
