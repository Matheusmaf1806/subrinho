import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { affiliates, cartItems, carts } from "@/server/db/schema";
import { storeViewer, type StoreViewer } from "@/server/auth/session";
import type { CartActor } from "@/server/cart/service";
import { loadPricingContext } from "@/server/pricing/context";

export type Store = typeof affiliates.$inferSelect;

export const getStore = cache(async (slug: string): Promise<Store> => {
  const [a] = await db.select().from(affiliates).where(eq(affiliates.slug, slug));
  if (!a || !a.active) notFound();
  return a;
});

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

export const storePath = (store: Pick<Store, "slug">, path = "") => `/loja/${store.slug}${path}`;

export function safeNext(store: Store, next: string | null | undefined, fallback = "") {
  const base = `/loja/${store.slug}`;
  return next && next.startsWith(base) && !next.startsWith("//") ? next : base + fallback;
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// ───────── White-label ─────────
import { DEFAULT_HERO_TITLE, DEFAULT_TAGLINE } from "@/lib/theme";
import { photo } from "@/lib/images";

/** Conteúdo de marca da loja, com padrões neutros quando o afiliado não personalizou. */
export function storeBrand(store: Store) {
  return {
    heroLines: (store.heroTitle?.trim() || DEFAULT_HERO_TITLE).split(/\r?\n/).filter(Boolean),
    heroSubtitle: store.heroSubtitle?.trim() || `Ingressos, hotéis, casas, seguro viagem e chip no mesmo carrinho — com o atendimento da ${store.name}.`,
    heroImage: store.heroImageUrl || photo("heroWoman", 900, 1200),
    heroImage2: store.heroImage2Url || photo("travelerCity", 700, 800),
    tagline: store.tagline?.trim() || DEFAULT_TAGLINE,
    instagram: store.instagram?.replace(/^@/, "").trim() || null,
    favicon: store.faviconUrl || `/loja/${store.slug}/icone`,
  };
}
