import { and, eq, or, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { affiliates, cartItems, carts } from "@/server/db/schema";
import { storeViewer, type StoreViewer } from "@/server/auth/session";
import type { CartActor } from "@/server/cart/service";
import { loadPricingContext } from "@/server/pricing/context";
import { classifyHost, domainConfig, STORE_HOST_HEADER } from "@/lib/store-domains";
import { storePublicUrl } from "@/server/store-links";

export type Store = typeof affiliates.$inferSelect;

/**
 * Loja pela chave da rota: o slug (/loja/<slug>) ou o endereço com que ela foi aberta, que o proxy
 * põe no lugar do slug (viagensdaana.subrinho.com.br, viagensdaana.com.br…).
 */
export const getStore = cache(async (key: string): Promise<Store> => {
  const k = decodeURIComponent(key).toLowerCase();
  let a: Store | undefined;
  if (!k.includes(".")) {
    [a] = await db.select().from(affiliates).where(eq(affiliates.slug, k));
  } else {
    const kind = classifyHost(k, domainConfig());
    if (kind.kind === "subdomain") {
      // subdomínio cadastrado; reserva: o slug (link antigo /loja/<slug> levado ao subdomínio)
      const rows = await db.select().from(affiliates).where(or(eq(affiliates.subdomain, kind.subdomain), eq(affiliates.slug, kind.subdomain)));
      a = rows.find((r) => r.subdomain === kind.subdomain) ?? rows[0];
    } else if (kind.kind === "custom") {
      [a] = await db.select().from(affiliates).where(eq(affiliates.customDomain, kind.host));
    }
  }
  if (!a || !a.active) notFound();
  return a;
});

/** A página foi aberta pelo endereço próprio da loja (subdomínio ou domínio)? Então os links saem sem prefixo. */
export const storeHost = cache(async (): Promise<string | null> => (await headers()).get(STORE_HOST_HEADER));

/** Prefixo dos links da loja: "" no endereço próprio; "/loja/<slug>" no endereço da plataforma. */
export async function storeBase(store: Pick<Store, "slug">): Promise<string> {
  return (await storeHost()) ? "" : `/loja/${store.slug}`;
}

/** Endereço público da loja (absoluto), para compartilhar e para os painéis. */
export async function storeUrl(store: Store, path = ""): Promise<string> {
  const host = await storeHost();
  if (host) return `https://${host}${path}`;
  return storePublicUrl(store, path);
}

export { revalidateStore, storePublicUrl } from "@/server/store-links";

export const getStorePricing = cache(async (affiliateId: string) => loadPricingContext(db, affiliateId));

export const cartCookieName = (store: Store) => `sb_cart_${store.id.slice(0, 8)}`;

export async function currentCartToken(store: Store): Promise<string | null> {
  return (await cookies()).get(cartCookieName(store))?.value ?? null;
}

export async function setCurrentCartToken(store: Store, token: string) {
  (await cookies()).set(cartCookieName(store), token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export const cartBadgeCount = cache(async (store: Store) => {
  const token = await currentCartToken(store);
  if (!token) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(and(eq(carts.token, token), eq(carts.affiliateId, store.id), eq(carts.status, "OPEN"), eq(cartItems.status, "ACTIVE")));
  return row?.n ?? 0;
});

export function actorOf(v: StoreViewer | null): CartActor {
  if (!v) return { type: "ANONYMOUS" };
  if (v.kind === "CUSTOMER") return { type: "CUSTOMER", id: v.customer.id };
  return { type: "AFFILIATE", id: v.user.id, adminMode: v.adminMode };
}

export async function viewerFor(store: Store) {
  return storeViewer(store.id);
}

/** Caminho dentro da loja (com ou sem prefixo, conforme o endereço de acesso). */
export async function storePath(store: Pick<Store, "slug">, path = ""): Promise<string> {
  return `${await storeBase(store)}${path}` || "/";
}

/** Destino seguro depois do login: só caminhos desta loja. */
export async function safeNext(store: Store, next: string | null | undefined, fallback = ""): Promise<string> {
  const base = await storeBase(store);
  const ok = !!next && next.startsWith("/") && !next.startsWith("//") && (base ? next.startsWith(base) : !next.startsWith("/loja/"));
  return ok ? next! : `${base}${fallback}` || "/";
}

export { appUrl } from "@/server/store-links";

// ───────── White-label ─────────
import { DEFAULT_HERO_TITLE, DEFAULT_TAGLINE } from "@/lib/theme";
import { photo } from "@/lib/images";
import { noEmDash } from "@/lib/text";

/** Conteúdo de marca da loja, com padrões neutros quando o afiliado não personalizou. `base` = prefixo dos links. */
export function storeBrand(store: Store, base = `/loja/${store.slug}`) {
  return {
    heroLines: (noEmDash(store.heroTitle?.trim()) || DEFAULT_HERO_TITLE).split(/\r?\n/).filter(Boolean),
    heroImage: store.heroImageUrl || photo("heroWoman", 900, 1200),
    tagline: noEmDash(store.tagline?.trim()) || DEFAULT_TAGLINE,
    instagram: store.instagram?.replace(/^@/, "").trim() || null,
    favicon: store.faviconUrl || `${base}/icone`,
  };
}
