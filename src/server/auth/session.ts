/**
 * Sessões dos 3 tipos de usuário:
 *  - "subrinho": equipe Subrinho (Painel Subrinho)
 *  - "afiliado": usuários do afiliado (Painel do Afiliado)
 *  - "loja": cliente da loja OU usuário do afiliado logado na loja (modo ADMIN)
 */
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { affiliates, affiliateUsers, customers, sessions, subrinhoUsers, type UserType } from "@/server/db/schema";
import { randomToken, sha256 } from "@/lib/random";

export type Realm = "subrinho" | "afiliado" | "loja";

const COOKIE: Record<Realm, string> = { subrinho: "sb_subrinho", afiliado: "sb_afiliado", loja: "sb_loja" };
const TTL_DAYS: Record<Realm, number> = { subrinho: 7, afiliado: 14, loja: 60 };

export async function requestMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

export async function startSession(
  realm: Realm,
  data: { userType: UserType; userId: string; storeAffiliateId?: string | null; adminMode?: boolean },
) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_DAYS[realm] * 86400_000);
  const meta = await requestMeta();
  await db.insert(sessions).values({
    id: sha256(token),
    userType: data.userType,
    userId: data.userId,
    storeAffiliateId: data.storeAffiliateId ?? null,
    adminMode: data.adminMode ?? false,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  (await cookies()).set(COOKIE[realm], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(realm: Realm) {
  const jar = await cookies();
  const token = jar.get(COOKIE[realm])?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(COOKIE[realm]);
}

export const readSession = cache(async (realm: Realm) => {
  const token = (await cookies()).get(COOKIE[realm])?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
});

// ───────────── Subrinho ─────────────

export const currentSubrinhoUser = cache(async () => {
  const s = await readSession("subrinho");
  if (!s || s.userType !== "SUBRINHO") return null;
  const [u] = await db.select().from(subrinhoUsers).where(and(eq(subrinhoUsers.id, s.userId), eq(subrinhoUsers.active, true)));
  return u ?? null;
});

export type SubrinhoUser = NonNullable<Awaited<ReturnType<typeof currentSubrinhoUser>>>;

export async function requireSubrinhoUser(roles?: SubrinhoUser["role"][]) {
  const u = await currentSubrinhoUser();
  if (!u) redirect("/subrinho/login");
  if (roles && !roles.includes(u.role) && u.role !== "OWNER") throw new Error("Sem permissão para esta ação");
  return u;
}

// ───────────── Afiliado ─────────────

export const currentAffiliateUser = cache(async () => {
  const s = await readSession("afiliado");
  if (!s || s.userType !== "AFFILIATE") return null;
  const [row] = await db
    .select({ user: affiliateUsers, affiliate: affiliates })
    .from(affiliateUsers)
    .innerJoin(affiliates, eq(affiliates.id, affiliateUsers.affiliateId))
    .where(and(eq(affiliateUsers.id, s.userId), eq(affiliateUsers.active, true), eq(affiliates.active, true)));
  return row ?? null;
});

export type AffiliateSession = NonNullable<Awaited<ReturnType<typeof currentAffiliateUser>>>;

export async function requireAffiliateUser(opts: { adminOnly?: boolean } = {}) {
  const r = await currentAffiliateUser();
  if (!r) redirect("/afiliado/login");
  if (opts.adminOnly && r.user.role !== "ADMIN") throw new Error("Apenas usuários ADMIN da agência podem fazer isso");
  return r;
}

// ───────────── Loja ─────────────

export type StoreViewer =
  | { kind: "CUSTOMER"; sessionId: string; customer: typeof customers.$inferSelect }
  | { kind: "AFFILIATE"; sessionId: string; user: typeof affiliateUsers.$inferSelect; adminMode: boolean; canAdmin: boolean };

export const storeViewer = cache(async (affiliateId: string): Promise<StoreViewer | null> => {
  const s = await readSession("loja");
  if (!s || s.storeAffiliateId !== affiliateId) return null;
  if (s.userType === "CUSTOMER") {
    const [c] = await db.select().from(customers).where(and(eq(customers.id, s.userId), eq(customers.affiliateId, affiliateId)));
    return c ? { kind: "CUSTOMER", sessionId: s.id, customer: c } : null;
  }
  if (s.userType === "AFFILIATE") {
    const [u] = await db
      .select()
      .from(affiliateUsers)
      .where(and(eq(affiliateUsers.id, s.userId), eq(affiliateUsers.affiliateId, affiliateId), eq(affiliateUsers.active, true)));
    if (!u) return null;
    const canAdmin = u.role === "ADMIN";
    return { kind: "AFFILIATE", sessionId: s.id, user: u, adminMode: canAdmin && s.adminMode, canAdmin };
  }
  return null;
});

export async function setStoreAdminMode(sessionId: string, on: boolean) {
  await db.update(sessions).set({ adminMode: on }).where(eq(sessions.id, sessionId));
}

/** Visitante anônimo (para contar acessos ao carrinho). */
export async function visitorId(): Promise<string | null> {
  return (await cookies()).get("sb_vid")?.value ?? null;
}

export async function ensureVisitorId(): Promise<string> {
  const jar = await cookies();
  let v = jar.get("sb_vid")?.value;
  if (!v) {
    v = randomToken(12);
    jar.set("sb_vid", v, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 * 2 });
  }
  return v;
}
