"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { createCoupon, setCouponActive, updateCoupon, type CouponInput } from "@/server/admin/coupons";
import { actionError, checkbox, decimal, FormError, oneOf, optInt, optText, optUuid, text, uuid } from "../../_lib/form";
import { fromLocalInput } from "../../_lib/dates";
import { PERMS } from "../../_lib/labels";

async function couponInput(fd: FormData): Promise<CouponInput> {
  const affiliateId = optUuid(fd, "affiliateId");
  if (affiliateId) {
    const [a] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId));
    if (!a) throw new FormError("Loja não encontrada");
  }
  return {
    code: text(fd, "code"),
    description: optText(fd, "description")?.slice(0, 300) ?? null,
    discountType: oneOf(text(fd, "discountType"), ["PERCENT", "FIXED", "CONDITIONAL"] as const, "Tipo de desconto"),
    percentOff: decimal(fd, "percentOff", "Percentual"),
    amountOff: decimal(fd, "amountOff", "Valor do desconto"),
    stepAmount: decimal(fd, "stepAmount", "A cada R$"),
    maxDiscount: decimal(fd, "maxDiscount", "Desconto máximo"),
    minSubtotal: decimal(fd, "minSubtotal", "Compra mínima"),
    categories: [...new Set(fd.getAll("categories").map(String))],
    startsAt: fromLocalInput(text(fd, "startsAt"), "Início da validade"),
    endsAt: fromLocalInput(text(fd, "endsAt"), "Fim da validade"),
    maxRedemptions: optInt(fd, "maxRedemptions", "Limite de usos", { min: 1, max: 1_000_000 }),
    active: checkbox(fd, "active"),
    affiliateId,
  };
}

export async function createSubrinhoCouponAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireSubrinhoUser(PERMS.coupons);
    const input = await couponInput(fd);
    const c = await db.transaction((tx) => createCoupon(tx, "SUBRINHO", input, { type: "SUBRINHO", id: user.id }));
    id = c.id;
    revalidatePath("/subrinho/cupons");
  } catch (e) {
    return actionError(e);
  }
  redirect(`/subrinho/cupons/${id}?novo=1`);
}

export async function updateSubrinhoCouponAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.coupons);
    const id = uuid(fd, "id", "Cupom");
    const input = await couponInput(fd);
    const c = await db.transaction((tx) => updateCoupon(tx, id, { issuer: "SUBRINHO" }, input));
    revalidatePath("/subrinho/cupons");
    revalidatePath(`/subrinho/cupons/${id}`);
    return { ok: true, message: `Cupom ${c.code} salvo.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleSubrinhoCouponAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.coupons);
    const id = uuid(fd, "id", "Cupom");
    const active = text(fd, "active") === "1";
    await db.transaction((tx) => setCouponActive(tx, id, { issuer: "SUBRINHO" }, active));
    revalidatePath("/subrinho/cupons");
    revalidatePath(`/subrinho/cupons/${id}`);
    return { ok: true, message: active ? "Cupom ativado" : "Cupom desativado" };
  } catch (e) {
    return actionError(e);
  }
}
