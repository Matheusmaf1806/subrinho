import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { coupons, type CouponIssuer, type DiscountType } from "@/server/db/schema";
import { d } from "@/server/pricing/money";
import { ACTIVE_CATEGORIES, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { parseBrNumber } from "@/lib/br";

export class CouponAdminError extends Error {}

export type CouponInput = {
  code: string;
  description?: string | null;
  discountType: DiscountType;
  percentOff?: string | null;
  amountOff?: string | null;
  stepAmount?: string | null;
  maxDiscount?: string | null;
  minSubtotal?: string | null;
  categories?: string[];
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxRedemptions?: number | null;
  active?: boolean;
  /** Para cupom da Subrinho: restringe a uma loja (opcional). */
  affiliateId?: string | null;
};

const num = (v: string | null | undefined) => {
  const p = parseBrNumber(v);
  return p === null ? null : d(p === "NaN" ? NaN : p);
};

function validate(input: CouponInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new CouponAdminError("Código deve ter de 3 a 30 caracteres (letras, números, - ou _)");
  const allowed = new Set<string>([...ACTIVE_CATEGORIES, ...FUTURE_CATEGORIES]);
  for (const c of input.categories ?? []) if (!allowed.has(c)) throw new CouponAdminError(`Categoria inválida: ${c}`);
  const percentOff = num(input.percentOff);
  const amountOff = num(input.amountOff);
  const stepAmount = num(input.stepAmount);
  const maxDiscount = num(input.maxDiscount);
  const minSubtotal = num(input.minSubtotal);
  for (const [k, v] of Object.entries({ percentOff, amountOff, stepAmount, maxDiscount, minSubtotal }))
    if (v && (v.isNaN() || v.lt(0))) throw new CouponAdminError(`Valor inválido em ${k}`);
  switch (input.discountType) {
    case "PERCENT":
      if (!percentOff || percentOff.lte(0) || percentOff.gt(100)) throw new CouponAdminError("Percentual deve ser entre 0 e 100");
      break;
    case "FIXED":
      if (!amountOff || amountOff.lte(0)) throw new CouponAdminError("Informe o valor do desconto");
      break;
    case "CONDITIONAL":
      if (!amountOff || amountOff.lte(0) || !stepAmount || stepAmount.lte(0))
        throw new CouponAdminError("Informe R$ de desconto e a cada quantos R$ em compras");
      break;
  }
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) throw new CouponAdminError("Fim da validade antes do início");
  return {
    code,
    description: input.description ?? null,
    discountType: input.discountType,
    percentOff: input.discountType === "PERCENT" ? percentOff!.toFixed(4) : null,
    amountOff: input.discountType !== "PERCENT" ? amountOff!.toFixed(2) : null,
    stepAmount: input.discountType === "CONDITIONAL" ? stepAmount!.toFixed(2) : null,
    maxDiscount: maxDiscount ? maxDiscount.toFixed(2) : null,
    minSubtotal: minSubtotal ? minSubtotal.toFixed(2) : null,
    categories: input.categories ?? [],
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    maxRedemptions: input.maxRedemptions ?? null,
    active: input.active,
  };
}

async function assertNoCollision(tx: Tx, code: string, issuer: CouponIssuer, affiliateId: string | null, ignoreId?: string) {
  const rows = await tx.select().from(coupons).where(eq(coupons.code, code));
  const others = rows.filter((r) => r.id !== ignoreId);
  const clash = others.find((r) => {
    if (issuer === "AFFILIATE") return r.scopeKey === affiliateId || (r.issuer === "SUBRINHO" && (!r.affiliateId || r.affiliateId === affiliateId));
    // Subrinho
    if (r.issuer === "SUBRINHO") return true;
    return !affiliateId || r.affiliateId === affiliateId;
  });
  if (clash) throw new CouponAdminError("Já existe um cupom com este código para esta loja");
}

export async function createCoupon(
  tx: Tx,
  issuer: CouponIssuer,
  input: CouponInput,
  actor: { type: "SUBRINHO" | "AFFILIATE"; id: string; affiliateId?: string | null },
) {
  const v = validate(input);
  const affiliateId = issuer === "AFFILIATE" ? actor.affiliateId! : input.affiliateId ?? null;
  if (issuer === "AFFILIATE" && !affiliateId) throw new CouponAdminError("Afiliado obrigatório");
  await assertNoCollision(tx, v.code, issuer, affiliateId);
  const [c] = await tx
    .insert(coupons)
    .values({ ...v, active: v.active ?? true, issuer, affiliateId, scopeKey: issuer === "SUBRINHO" ? "SUBRINHO" : affiliateId!, createdByType: actor.type, createdById: actor.id })
    .returning();
  return c;
}

export async function updateCoupon(tx: Tx, id: string, owner: { issuer: CouponIssuer; affiliateId?: string | null }, input: CouponInput) {
  const current = await getOwnedCoupon(tx, id, owner);
  const v = validate(input);
  const affiliateId = owner.issuer === "AFFILIATE" ? owner.affiliateId! : input.affiliateId ?? null;
  await assertNoCollision(tx, v.code, owner.issuer, affiliateId, current.id);
  // `active` ausente mantém o estado atual (não reativa cupom sem querer).
  const [c] = await tx.update(coupons).set({ ...v, active: v.active ?? current.active, affiliateId }).where(eq(coupons.id, id)).returning();
  return c;
}

export async function setCouponActive(tx: Tx, id: string, owner: { issuer: CouponIssuer; affiliateId?: string | null }, active: boolean) {
  await getOwnedCoupon(tx, id, owner);
  await tx.update(coupons).set({ active }).where(eq(coupons.id, id));
}

export async function getOwnedCoupon(tx: Tx, id: string, owner: { issuer: CouponIssuer; affiliateId?: string | null }) {
  const conds = [eq(coupons.id, id), eq(coupons.issuer, owner.issuer)];
  if (owner.issuer === "AFFILIATE") conds.push(eq(coupons.affiliateId, owner.affiliateId!));
  const [c] = await tx.select().from(coupons).where(and(...conds));
  if (!c) throw new CouponAdminError("Cupom não encontrado");
  return c;
}

export async function listCoupons(tx: Tx, owner: { issuer: CouponIssuer; affiliateId?: string | null }) {
  return tx
    .select()
    .from(coupons)
    .where(owner.issuer === "SUBRINHO" ? eq(coupons.issuer, "SUBRINHO") : and(eq(coupons.issuer, "AFFILIATE"), eq(coupons.affiliateId, owner.affiliateId!)))
    .orderBy(desc(coupons.createdAt));
}

/** Cupons da Subrinho válidos numa loja (para o afiliado saber o que existe). */
export async function subrinhoCouponsForStore(tx: Tx, affiliateId: string) {
  return tx
    .select()
    .from(coupons)
    .where(and(eq(coupons.issuer, "SUBRINHO"), eq(coupons.active, true), or(isNull(coupons.affiliateId), eq(coupons.affiliateId, affiliateId))));
}

export { inArray };
