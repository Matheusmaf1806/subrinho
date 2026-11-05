/**
 * robots.txt por endereço: cada loja (subdomínio ou domínio próprio) tem o seu, com o sitemap dela;
 * na plataforma, painéis e áreas privadas ficam de fora dos buscadores.
 */
import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { classifyHost, domainConfig, normalizeHost } from "@/lib/store-domains";

const PRIVATE = ["/carrinho", "/checkout", "/pedido", "/minha-conta", "/entrar", "/esqueci-senha", "/redefinir-senha", "/api/"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = normalizeHost((await headers()).get("host") ?? "");
  const kind = classifyHost(host, domainConfig());
  if (kind.kind === "platform") {
    const origin = (process.env.APP_URL ?? `https://${host}`).replace(/\/+$/, "");
    return {
      rules: [{ userAgent: "*", allow: "/", disallow: ["/afiliado", "/subrinho", "/api/", "/m/", ...PRIVATE.filter((p) => p !== "/api/").map((p) => `/loja/*${p}`)] }],
      sitemap: `${origin}/sitemap.xml`,
    };
  }
  return { rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE }], sitemap: `https://${host}/sitemap.xml`, host: `https://${host}` };
}
