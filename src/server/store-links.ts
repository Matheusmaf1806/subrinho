/**
 * Endereço oficial de cada loja fora das páginas da loja (painéis, links compartilhados, revalidação).
 * Domínio próprio verificado > subdomínio da plataforma (com STORE_ROOT_DOMAIN) > /loja/<slug>.
 */
import { revalidatePath } from "next/cache";
import { domainConfig, storeOrigin, type StoreAddress } from "@/lib/store-domains";

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** URL absoluta da loja (com o caminho, ex.: "/carrinho/<token>"). */
export function storePublicUrl(store: StoreAddress, path = ""): string {
  const origin = storeOrigin(store, domainConfig());
  return origin ? `${origin}${path}` : `${appUrl()}/loja/${store.slug}${path}`;
}

/**
 * Revalida as páginas da loja nas rotas internas /loja/<slug> e /loja/<endereço> (subdomínio ou
 * domínio próprio), que é para onde o proxy reescreve quando ela é aberta pelo próprio endereço.
 */
export function revalidateStore(store: Pick<StoreAddress, "slug" | "subdomain" | "customDomain">, path = "", type?: "layout" | "page") {
  const cfg = domainConfig();
  const keys = [store.slug, cfg.root && store.subdomain ? `${store.subdomain}.${cfg.root}` : null, store.customDomain].filter((k): k is string => !!k);
  for (const k of keys) revalidatePath(`/loja/${k}${path}`, type);
}
