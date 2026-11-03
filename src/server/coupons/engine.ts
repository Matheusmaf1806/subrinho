/**
 * Motor de cupons.
 *
 * - Cupom pode ser criado pela SUBRINHO (desconta da margem Subrinho) ou pelo AFILIADO
 *   (desconta da margem do afiliado). Cada um mexe SOMENTE na sua margem, que nunca fica < 0%.
 * - Pode ser restrito por categoria (Ingressos, Hospedagem, Casas, ...). Vazio = todas.
 * - Tipos: PERCENT (% sobre o preço PIX dos itens elegíveis), FIXED (R$ fixo) ou
 *   CONDITIONAL (R$ X a cada R$ Y em compras elegíveis — ex.: R$ 100 a cada R$ 10.000).
 * - Uma camada = um cupom por carrinho (1 da Subrinho + 1 do afiliado podem coexistir).
 * - O desconto total é distribuído entre os itens elegíveis proporcionalmente ao preço,
 *   respeitando o teto de margem disponível de cada item (water-filling em centavos).
 */
import type { Category, CouponIssuer, DiscountType } from "@/server/db/schema";
import { Decimal, d, fromCents, round2, sum, toCents, ZERO, HUNDRED } from "@/server/pricing/money";

export type CouponDef = {
  id: string;
  code: string;
  issuer: CouponIssuer;
  affiliateId: string | null;
  discountType: DiscountType;
  percentOff: string | null;
  amountOff: string | null;
  stepAmount: string | null;
  maxDiscount: string | null;
  minSubtotal: string | null;
  categories: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptions: number;
  active: boolean;
  description?: string | null;
};

export type CouponItem = {
  id: string;
  category: Category;
  /** Preço PIX (NET Afiliado) do item — base do desconto. */
  price: Decimal;
  /** Margem disponível na camada do cupom (teto de desconto do item). */
  cap: Decimal;
};

export type CouponCheck = { ok: true } | { ok: false; reason: string };

export function checkCouponValidity(c: CouponDef, ctx: { affiliateId: string; now: Date }): CouponCheck {
  if (!c.active) return { ok: false, reason: "Cupom inativo" };
  if (c.startsAt && ctx.now < c.startsAt) return { ok: false, reason: "Cupom ainda não está válido" };
  if (c.endsAt && ctx.now > c.endsAt) return { ok: false, reason: "Cupom expirado" };
  if (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions)
    return { ok: false, reason: "Cupom esgotado" };
  if (c.issuer === "AFFILIATE" && c.affiliateId !== ctx.affiliateId)
    return { ok: false, reason: "Cupom não pertence a esta loja" };
  if (c.issuer === "SUBRINHO" && c.affiliateId && c.affiliateId !== ctx.affiliateId)
    return { ok: false, reason: "Cupom não válido nesta loja" };
  return { ok: true };
}

export type CouponResult = {
  coupon: CouponDef;
  eligibleSubtotal: Decimal;
  /** Desconto bruto pela regra (antes do teto de margem). */
  requested: Decimal;
  /** Desconto efetivamente aplicado. */
  total: Decimal;
  limitedByMargin: boolean;
  allocations: Map<string, Decimal>;
  /** Motivo de não aplicar (ex.: nenhum item elegível / subtotal mínimo). */
  notApplied?: string;
};

export function isEligible(c: Pick<CouponDef, "categories">, category: Category): boolean {
  return c.categories.length === 0 || c.categories.includes(category);
}

export function requestedDiscount(c: CouponDef, eligibleSubtotal: Decimal): Decimal {
  let v: Decimal;
  switch (c.discountType) {
    case "PERCENT":
      v = round2(eligibleSubtotal.times(d(c.percentOff)).div(HUNDRED));
      break;
    case "FIXED":
      v = round2(d(c.amountOff));
      break;
    case "CONDITIONAL": {
      const step = d(c.stepAmount);
      if (step.lte(0)) return ZERO;
      const times = eligibleSubtotal.div(step).floor();
      v = round2(times.times(d(c.amountOff)));
      break;
    }
  }
  if (c.maxDiscount !== null && c.maxDiscount !== undefined && d(c.maxDiscount).gt(0)) {
    v = Decimal.min(v, d(c.maxDiscount));
  }
  return Decimal.min(v, eligibleSubtotal);
}

/**
 * Distribui `totalCents` entre itens proporcionalmente a `weight`, sem passar de `cap` de cada um.
 * Retorna centavos por item. Soma exata = min(total, Σcaps).
 */
export function allocateCapped(
  items: { id: string; weight: number; cap: number }[],
  totalCents: number,
): Map<string, number> {
  const alloc = new Map<string, number>(items.map((i) => [i.id, 0]));
  let remaining = Math.min(
    totalCents,
    items.reduce((s, i) => s + Math.max(0, i.cap), 0),
  );
  let active = items.filter((i) => i.cap > 0);

  while (remaining > 0 && active.length > 0) {
    const W = active.reduce((s, i) => s + Math.max(i.weight, 0), 0);
    const share = (i: { weight: number }) =>
      W > 0 ? (remaining * Math.max(i.weight, 0)) / W : remaining / active.length;
    const saturated = active.filter((i) => i.cap - alloc.get(i.id)! <= share(i));
    if (saturated.length > 0) {
      for (const i of saturated) {
        const room = i.cap - alloc.get(i.id)!;
        alloc.set(i.id, i.cap);
        remaining -= room;
      }
      active = active.filter((i) => !saturated.includes(i));
      continue;
    }
    // Nenhum satura: distribui por maior resto.
    const parts = active.map((i) => {
      const s = share(i);
      return { i, floor: Math.floor(s), frac: s - Math.floor(s) };
    });
    let given = 0;
    for (const p of parts) {
      alloc.set(p.i.id, alloc.get(p.i.id)! + p.floor);
      given += p.floor;
    }
    let leftover = remaining - given;
    parts.sort((a, b) => b.frac - a.frac || a.i.id.localeCompare(b.i.id));
    for (const p of parts) {
      if (leftover <= 0) break;
      if (alloc.get(p.i.id)! < p.i.cap) {
        alloc.set(p.i.id, alloc.get(p.i.id)! + 1);
        leftover--;
      }
    }
    remaining = leftover;
    if (remaining > 0) active = active.filter((i) => alloc.get(i.id)! < i.cap);
  }
  return alloc;
}

export function computeCoupon(c: CouponDef, items: CouponItem[]): CouponResult {
  const eligible = items.filter((i) => isEligible(c, i.category));
  const eligibleSubtotal = sum(eligible.map((i) => i.price));
  const empty = (reason: string): CouponResult => ({
    coupon: c,
    eligibleSubtotal,
    requested: ZERO,
    total: ZERO,
    limitedByMargin: false,
    allocations: new Map(),
    notApplied: reason,
  });

  if (eligible.length === 0) return empty("Nenhum item do carrinho é elegível para este cupom");
  if (c.minSubtotal && eligibleSubtotal.lt(d(c.minSubtotal)))
    return empty(`Compra mínima de ${d(c.minSubtotal).toNumber().toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} nos itens elegíveis`);

  const requested = requestedDiscount(c, eligibleSubtotal);
  if (requested.lte(0)) {
    if (c.discountType === "CONDITIONAL")
      return empty(
        `Desconto a partir de ${d(c.stepAmount).toNumber().toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em itens elegíveis`,
      );
    return empty("Cupom sem desconto aplicável");
  }

  const centsMap = allocateCapped(
    eligible.map((i) => ({ id: i.id, weight: toCents(i.price), cap: Math.max(0, toCents(i.cap)) })),
    toCents(requested),
  );
  const allocations = new Map<string, Decimal>();
  let totalCents = 0;
  for (const [id, cents] of centsMap) {
    if (cents > 0) allocations.set(id, fromCents(cents));
    totalCents += cents;
  }
  const total = fromCents(totalCents);
  return {
    coupon: c,
    eligibleSubtotal,
    requested,
    total,
    limitedByMargin: total.lt(requested),
    allocations,
    notApplied: total.isZero() ? "Não há margem disponível para aplicar o desconto" : undefined,
  };
}

export function describeCoupon(c: Pick<CouponDef, "discountType" | "percentOff" | "amountOff" | "stepAmount">): string {
  const brl = (v: string | null) => d(v).toNumber().toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  switch (c.discountType) {
    case "PERCENT":
      return `${d(c.percentOff).toNumber().toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% de desconto`;
    case "FIXED":
      return `${brl(c.amountOff)} de desconto`;
    case "CONDITIONAL":
      return `${brl(c.amountOff)} a cada ${brl(c.stepAmount)}`;
  }
}
