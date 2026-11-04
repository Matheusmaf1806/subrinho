/** Evento que abre o carrinho flutuante (separado da gaveta para não criar import circular). */
export const OPEN_CART_EVENT = "store:open-cart";

/** Abre o carrinho flutuante (ex.: depois de adicionar um item). */
export function openCartDrawer(detail: { added?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT, { detail }));
}
