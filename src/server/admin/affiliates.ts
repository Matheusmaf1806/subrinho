import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, affiliateUsers, subrinhoUsers } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";

export class AffiliateAdminError extends Error {}

export type AffiliateInput = {
  name: string;
  slug: string;
  legalName?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  pixKey?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  active?: boolean;
};

export function normalizeSlug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function clean(input: AffiliateInput) {
  const slug = normalizeSlug(input.slug || input.name);
  if (!input.name.trim()) throw new AffiliateAdminError("Informe o nome da agência");
  if (slug.length < 3) throw new AffiliateAdminError("Endereço da loja (slug) muito curto");
  if (input.brandColor && !/^#[0-9a-fA-F]{6}$/.test(input.brandColor)) throw new AffiliateAdminError("Cor inválida (use #RRGGBB)");
  return {
    name: input.name.trim(),
    slug,
    legalName: input.legalName || null,
    document: input.document || null,
    email: input.email || null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl || null } : {}),
    ...(input.brandColor !== undefined ? { brandColor: input.brandColor || "#E4113F" } : {}),
    pixKey: input.pixKey || null,
    bankName: input.bankName || null,
    bankAgency: input.bankAgency || null,
    bankAccount: input.bankAccount || null,
    active: input.active ?? true,
  };
}

export async function createAffiliate(tx: Tx, input: AffiliateInput, admin: { name: string; email: string; password: string }) {
  const v = clean(input);
  const [exists] = await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.slug, v.slug));
  if (exists) throw new AffiliateAdminError("Já existe uma loja com este endereço");
  const [a] = await tx.insert(affiliates).values(v).returning();
  await createAffiliateUser(tx, a.id, { ...admin, role: "ADMIN" });
  return a;
}

export async function updateAffiliate(tx: Tx, id: string, input: AffiliateInput) {
  const v = clean(input);
  const [clash] = await tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.slug, v.slug));
  if (clash && clash.id !== id) throw new AffiliateAdminError("Já existe uma loja com este endereço");
  const [a] = await tx.update(affiliates).set(v).where(eq(affiliates.id, id)).returning();
  return a;
}

export async function createAffiliateUser(tx: Tx, affiliateId: string, u: { name: string; email: string; password: string; role: "ADMIN" | "AGENT" }) {
  const email = u.email.trim().toLowerCase();
  const [exists] = await tx.select({ id: affiliateUsers.id }).from(affiliateUsers).where(eq(affiliateUsers.email, email));
  if (exists) throw new AffiliateAdminError("E-mail já cadastrado");
  const [row] = await tx
    .insert(affiliateUsers)
    .values({ affiliateId, name: u.name.trim(), email, passwordHash: await hashPassword(u.password), role: u.role })
    .returning();
  return row;
}

export async function listAffiliateUsers(tx: Tx, affiliateId: string) {
  return tx
    .select({ id: affiliateUsers.id, name: affiliateUsers.name, email: affiliateUsers.email, role: affiliateUsers.role, active: affiliateUsers.active, totpEnabledAt: affiliateUsers.totpEnabledAt, createdAt: affiliateUsers.createdAt })
    .from(affiliateUsers)
    .where(eq(affiliateUsers.affiliateId, affiliateId))
    .orderBy(asc(affiliateUsers.name));
}

export async function createSubrinhoUser(tx: Tx, u: { name: string; email: string; password: string; role: "OWNER" | "ADMIN" | "FINANCE" | "SUPPORT" }) {
  const email = u.email.trim().toLowerCase();
  const [exists] = await tx.select({ id: subrinhoUsers.id }).from(subrinhoUsers).where(eq(subrinhoUsers.email, email));
  if (exists) throw new AffiliateAdminError("E-mail já cadastrado");
  const [row] = await tx.insert(subrinhoUsers).values({ name: u.name.trim(), email, passwordHash: await hashPassword(u.password), role: u.role }).returning();
  return row;
}
