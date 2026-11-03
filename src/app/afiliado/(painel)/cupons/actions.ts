"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { addDays, startOfLocalDay } from "@/lib/tz";
import { db } from "@/server/db";
import type { DiscountType } from "@/server/db/schema";
import { createCoupon, setCouponActive, updateCoupon, type CouponInput } from "@/server/admin/coupons";
import { ACTIVE_CATEGORIES, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { decimalField, isIsoDate, isUuid, moneyField, optStr, requireAdminForAction, serviceErrorMessage, str } from "../../_lib/helpers";

const TYPES: DiscountType[] = ["PERCENT", "FIXED", "CONDITIONAL"];
const ALLOWED_CATEGORIES = new Set<string>([...ACTIVE_CATEGORIES, ...FUTURE_CATEGORIES]);

function revalidate(slug: string) {
  revalidatePath("/afiliado", "layout");
  revalidatePath(`/loja/${slug}`, "layout");
}

function parseCoupon(fd: FormData): CouponInput | { error: string } {
  const discountType = str(fd, "discountType") as DiscountType;
  if (!TYPES.includes(discountType)) return { error: "Escolha o tipo de desconto." };

  const startsRaw = str(fd, "startsAt");
  const endsRaw = str(fd, "endsAt");
  if (startsRaw && !isIsoDate(startsRaw)) return { error: "Data de início inválida." };
  if (endsRaw && !isIsoDate(endsRaw)) return { error: "Data de fim inválida." };

  const maxRaw = str(fd, "maxRedemptions");
  let maxRedemptions: number | null = null;
  if (maxRaw) {
    const n = Number(maxRaw);
    if (!Number.isInteger(n) || n < 1) return { error: "O limite de usos deve ser um número inteiro maior que zero." };
    maxRedemptions = n;
  }

  return {
    code: str(fd, "code"),
    description: optStr(fd, "description"),
    discountType,
    percentOff: discountType === "PERCENT" ? decimalField(fd, "percentOff") : null,
    amountOff: discountType !== "PERCENT" ? moneyField(fd, "amountOff") : null,
    stepAmount: discountType === "CONDITIONAL" ? moneyField(fd, "stepAmount") : null,
    maxDiscount: discountType !== "FIXED" ? moneyField(fd, "maxDiscount") : null,
    minSubtotal: moneyField(fd, "minSubtotal"),
    categories: [...new Set(fd.getAll("categories").map(String))].filter((c) => ALLOWED_CATEGORIES.has(c)),
    // Validade no fuso do negócio: do início do dia inicial ao fim do dia final.
    startsAt: startsRaw ? startOfLocalDay(startsRaw) : null,
    endsAt: endsRaw ? new Date(startOfLocalDay(addDays(endsRaw, 1)).getTime() - 1) : null,
    maxRedemptions,
    active: fd.get("active") === "on",
  };
}

export async function createCouponAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { user, affiliate } = g.session;
  const input = parseCoupon(fd);
  if ("error" in input) return input;
  let code: string;
  try {
    const c = await createCoupon(db, "AFFILIATE", input, { type: "AFFILIATE", id: user.id, affiliateId: affiliate.id });
    code = c.code;
  } catch (e) {
    return { error: serviceErrorMessage(e, "Não foi possível criar o cupom.") };
  }
  revalidate(affiliate.slug);
  return { ok: true, message: `Cupom ${code} criado.` };
}

export async function updateCouponAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate } = g.session;
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Cupom não encontrado." };
  const input = parseCoupon(fd);
  if ("error" in input) return input;
  try {
    // updateCoupon garante que o cupom pertence a ESTE afiliado.
    await updateCoupon(db, id, { issuer: "AFFILIATE", affiliateId: affiliate.id }, input);
  } catch (e) {
    return { error: serviceErrorMessage(e, "Não foi possível salvar o cupom.") };
  }
  revalidate(affiliate.slug);
  return { ok: true, message: "Cupom atualizado." };
}

export async function setCouponActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate } = g.session;
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Cupom não encontrado." };
  const active = str(fd, "active") === "1";
  try {
    await setCouponActive(db, id, { issuer: "AFFILIATE", affiliateId: affiliate.id }, active);
  } catch (e) {
    return { error: serviceErrorMessage(e, "Não foi possível alterar o cupom.") };
  }
  revalidate(affiliate.slug);
  return { ok: true, message: active ? "Cupom ativado." : "Cupom desativado." };
}
