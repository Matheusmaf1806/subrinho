/**
 * sitemap.xml por endereço: no domínio/subdomínio da loja, as páginas públicas dela; na plataforma,
 * as lojas que ainda abrem em /loja/<slug> (sem endereço próprio).
 */
import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { classifyHost, domainConfig, normalizeHost } from "@/lib/store-domains";
import { appUrl, storePublicUrl } from "@/server/store-links";
import { storeCategories } from "./loja/[slug]/_lib/categories";

export const dynamic = "force-dynamic";

const PAGES = ["/termos", "/privacidade", "/cancelamento"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = normalizeHost((await headers()).get("host") ?? "");
  const cfg = domainConfig();
  const kind = classifyHost(host, cfg);
  const cats = (await storeCategories()).live.map((c) => `/${c.slug}`);
  const now = new Date();
  const entries = (origin: string) => [
    { url: origin || "/", lastModified: now, changeFrequency: "daily" as const, priority: 1 },
    ...cats.map((c) => ({ url: `${origin}${c}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 })),
    ...PAGES.map((p) => ({ url: `${origin}${p}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.2 })),
  ];
  if (kind.kind !== "platform") {
    const where = kind.kind === "custom" ? eq(affiliates.customDomain, kind.host) : or(eq(affiliates.subdomain, kind.subdomain), eq(affiliates.slug, kind.subdomain));
    const [a] = await db.select({ active: affiliates.active }).from(affiliates).where(where);
    return a?.active ? entries(`https://${host}`) : [];
  }
  const stores = await db.select().from(affiliates).where(eq(affiliates.active, true));
  return stores.filter((s) => storePublicUrl(s).startsWith(`${appUrl()}/loja/`)).flatMap((s) => entries(storePublicUrl(s)));
}
