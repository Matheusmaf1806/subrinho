/**
 * Cada loja no próprio endereço (ver src/lib/store-domains.ts):
 *  - viagensdaana.subrinho.com.br/hospedagem  → rota interna /loja/viagensdaana.subrinho.com.br/hospedagem
 *  - viagensdaana.com.br/carrinho/…           → /loja/viagensdaana.com.br/carrinho/…
 * A URL do cliente nunca mostra /loja/<slug>. O cabeçalho STORE_HOST_HEADER avisa a aplicação que os
 * links devem sair sem prefixo; vindo de fora ele é sempre descartado.
 *
 * No endereço da plataforma, /loja/<slug>/… ainda funciona e, com os subdomínios ligados
 * (STORE_ROOT_DOMAIN), quem abre a página no navegador é levado ao subdomínio da loja.
 */
import { NextResponse, type NextRequest } from "next/server";
import { classifyHost, domainConfig, normalizeHost, STORE_HOST_HEADER } from "@/lib/store-domains";

/** Caminhos que nunca são da loja: arquivos do Next, rotas de API, mídia da loja e arquivos públicos. */
const PASSTHROUGH = /^\/(?:_next\/|api\/|m\/|favicon\.ico$|robots\.txt$|sitemap\.xml$|\.well-known\/)/;
const FILE = /\.[a-z0-9]{2,5}$/i;
const PANEL = /^\/(?:afiliado|subrinho)(?:\/|$)/;

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(STORE_HOST_HEADER);
  const cfg = domainConfig();
  const host = normalizeHost(request.headers.get("host") || request.nextUrl.host);
  const kind = classifyHost(host, cfg);
  const { pathname, search } = request.nextUrl;

  if (kind.kind === "platform") {
    // página aberta no navegador (não navegação interna nem ação): leva ao endereço próprio da loja
    const m = pathname.match(/^\/loja\/([a-z0-9-]+)(\/.*)?$/);
    const document = request.method === "GET" && !request.headers.get("rsc") && !request.headers.get("next-action") && !request.headers.get("next-router-prefetch");
    if (m && cfg.root && document) return NextResponse.redirect(`https://${m[1]}.${cfg.root}${m[2] ?? ""}${search}`, 308);
    return NextResponse.next({ request: { headers } });
  }

  if (PASSTHROUGH.test(pathname) || FILE.test(pathname)) return NextResponse.next({ request: { headers } });
  // painéis ficam no endereço da plataforma
  if (PANEL.test(pathname)) {
    const app = process.env.APP_URL?.replace(/\/+$/, "");
    return app ? NextResponse.redirect(`${app}${pathname}${search}`, 307) : NextResponse.next({ request: { headers } });
  }

  const key = kind.kind === "subdomain" ? `${kind.subdomain}.${cfg.root}` : kind.host;
  headers.set(STORE_HOST_HEADER, key);
  const url = request.nextUrl.clone();
  url.pathname = `/loja/${key}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // tudo menos os arquivos estáticos do Next (o resto é filtrado acima)
  matcher: ["/((?!_next/static|_next/image).*)"],
};
