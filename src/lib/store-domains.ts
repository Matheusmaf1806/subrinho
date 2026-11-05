/**
 * Endereço de cada loja, sem "/loja/<slug>" na URL:
 *  - subdomínio da plataforma: <subdominio>.<STORE_ROOT_DOMAIN> (ex.: viagensdaana.subrinho.com.br);
 *  - domínio próprio da agência: viagensdaana.com.br ou loja.viagensdaana.com.br (vale depois de verificado).
 *
 * O proxy (src/proxy.ts) reconhece o endereço e reescreve para a rota interna /loja/<endereço>/…;
 * os links da loja saem sem prefixo quando ela é aberta pelo próprio domínio.
 * Funções puras (sem banco): usadas no proxy, nas páginas e nos testes.
 */

/** Cabeçalho que o proxy põe quando a loja foi aberta pelo próprio endereço (vindo de fora, é descartado). */
export const STORE_HOST_HEADER = "x-subrinho-store-host";

export type DomainConfig = {
  /** Domínio dos subdomínios das lojas (ex.: subrinho.com.br). null = subdomínios desligados. */
  root: string | null;
  /** Endereços da própria plataforma (painéis e /loja/<slug>). */
  platformHosts: string[];
};

export function normalizeHost(h: string | null | undefined): string {
  return (h ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

const hostOf = (url: string | undefined) => {
  try {
    return url ? normalizeHost(new URL(url).host) : "";
  } catch {
    return "";
  }
};

export function domainConfig(env: NodeJS.ProcessEnv = process.env): DomainConfig {
  const root = normalizeHost(env.STORE_ROOT_DOMAIN) || null;
  const extra = (env.PLATFORM_HOSTS ?? "")
    .split(",")
    .map((x) => normalizeHost(x))
    .filter(Boolean);
  const hosts = [hostOf(env.APP_URL), ...extra, ...(root ? [root, `www.${root}`, `app.${root}`] : [])].filter(Boolean);
  return { root, platformHosts: [...new Set(hosts)] };
}

/** Subdomínios que nunca viram loja (ficam com a plataforma). */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "painel", "afiliado", "afiliados", "subrinho", "loja", "lojas", "mail", "email", "smtp", "imap", "pop",
  "ftp", "cdn", "static", "assets", "img", "media", "blog", "ajuda", "suporte", "help", "status", "docs", "dev", "staging", "teste", "test", "preview", "vercel",
]);

export type HostKind = { kind: "platform" } | { kind: "subdomain"; subdomain: string } | { kind: "custom"; host: string };

/** Quem responde por este endereço: a plataforma, uma loja pelo subdomínio ou uma loja pelo domínio próprio. */
export function classifyHost(rawHost: string | null | undefined, cfg: DomainConfig): HostKind {
  const host = normalizeHost(rawHost);
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return { kind: "platform" };
  if (cfg.platformHosts.includes(host) || host.endsWith(".vercel.app")) return { kind: "platform" };
  if (cfg.root && host.endsWith(`.${cfg.root}`)) {
    const sub = host.slice(0, -(cfg.root.length + 1));
    return !sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub) && isValidSubdomain(sub) ? { kind: "subdomain", subdomain: sub } : { kind: "platform" };
  }
  if (cfg.root && host === cfg.root) return { kind: "platform" };
  // www.viagensdaana.com.br e viagensdaana.com.br são a mesma loja
  return { kind: "custom", host: host.replace(/^www\./, "") };
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSubdomain(s: string): boolean {
  return s.length >= 2 && s.length <= 40 && LABEL.test(s) && !s.includes("--");
}

/** Normaliza e valida o subdomínio digitado no painel. Devolve o erro em português, se houver. */
export function checkSubdomain(input: string): { value: string } | { error: string } {
  const v = normalizeHost(input).replace(/\..*$/, "");
  if (!v) return { error: "Informe o subdomínio" };
  if (!isValidSubdomain(v)) return { error: "Use de 2 a 40 letras, números ou hífen (sem acento, espaço ou hífen nas pontas)" };
  if (RESERVED_SUBDOMAINS.has(v)) return { error: `"${v}" é reservado, escolha outro` };
  return { value: v };
}

/** Normaliza e valida o domínio próprio (aceita colar com https:// ou barra no fim). */
export function checkCustomDomain(input: string, cfg: DomainConfig): { value: string | null } | { error: string } {
  const v = normalizeHost(input).replace(/^www\./, "");
  if (!v) return { value: null };
  const labels = v.split(".");
  if (v.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !/^[a-z]{2,24}$/.test(labels[labels.length - 1]))
    return { error: "Domínio inválido. Exemplos: viagensdaana.com.br ou loja.viagensdaana.com.br" };
  if (v.endsWith(".vercel.app") || cfg.platformHosts.includes(v) || (cfg.root && (v === cfg.root || v.endsWith(`.${cfg.root}`))))
    return { error: "Este endereço é da plataforma. Para usar o subdomínio, preencha o campo acima" };
  return { value: v };
}

/** O domínio próprio é um apex (viagensdaana.com.br) ou um subdomínio (loja.viagensdaana.com.br)? Muda o registro de DNS. */
export function isApexDomain(domain: string): boolean {
  const labels = domain.split(".");
  // apex = nome + sufixo público (com.br, net.br, co.uk… têm dois rótulos de sufixo)
  const twoPartSuffix = labels.length >= 3 && /^(com|net|org|gov|edu|art|blog|tur|eco|app|dev|tv|adv|eng|med)$/.test(labels[labels.length - 2]) && labels[labels.length - 1].length === 2;
  return labels.length === (twoPartSuffix ? 3 : 2);
}

export type StoreAddress = { slug: string; subdomain: string | null; customDomain: string | null; customDomainVerifiedAt: Date | null };

/** Origem pública da loja (https://…), ou null quando ela ainda só existe em /loja/<slug>. */
export function storeOrigin(store: StoreAddress, cfg: DomainConfig): string | null {
  if (store.customDomain && store.customDomainVerifiedAt) return `https://${store.customDomain}`;
  if (cfg.root && store.subdomain) return `https://${store.subdomain}.${cfg.root}`;
  return null;
}

/** Endereço do subdomínio na plataforma (mesmo antes de ser o oficial). */
export function subdomainHost(store: Pick<StoreAddress, "subdomain">, cfg: DomainConfig): string | null {
  return cfg.root && store.subdomain ? `${store.subdomain}.${cfg.root}` : null;
}
