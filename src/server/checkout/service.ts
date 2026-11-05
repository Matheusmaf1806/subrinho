/**
 * Checkout → Pedido → Pagamento.
 * Todo pedido grava TODOS os dados: pessoas (conta x pagador x viajantes), carrinho (criação,
 * acessos, quem gerou), conta completa de cada item (custo, câmbio, margens, descontos, parcelado),
 * cupons, câmbio usado, pagamento e data de repasse.
 */
import { notifyItemReady, notifyOrderPaid, notifyOrderPlaced, notifySafely } from "@/server/email/notify";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { carts, cartItems, coupons, customers, orderEvents, orderItems, orders, type PaymentMethod, type PersonData } from "@/server/db/schema";
import { CartError, loadCartView, priceCartById, sweepExpiredItems, type Cart } from "@/server/cart/service";
import { money } from "@/server/pricing/money";
import { getSettings } from "@/server/settings";
import { getAdapter } from "@/server/suppliers/registry";
import { SupplierError, SupplierIntegrationError } from "@/server/suppliers/types";
import { minSellPriceOf } from "@/server/pricing/cart-pricing";
import { payoutDateFor } from "@/server/payouts/service";
import { paymentProvider, type CardInput } from "@/server/payments/provider";
import { hashPassword } from "@/server/auth/password";
import { randomToken } from "@/lib/random";
import { describeCoupon } from "@/server/coupons/engine";
import { getCurrentFx } from "@/server/fx";
import { needsControlledIssue } from "@/server/bookings/service";

export class CheckoutError extends Error {}

export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;

/** Encontra/cria a conta do cliente na loja (usado quando a agência finaliza pelo cliente). */
export async function findOrCreateCustomer(tx: Tx, affiliateId: string, data: { name: string; email: string; phone?: string | null; document?: string | null; birthDate?: string | null; password?: string | null }) {
  const email = data.email.trim().toLowerCase();
  const [existing] = await tx.select().from(customers).where(and(eq(customers.affiliateId, affiliateId), eq(customers.email, email)));
  if (existing) return { customer: existing, created: false };
  const [c] = await tx
    .insert(customers)
    .values({
      affiliateId,
      name: data.name.trim(),
      email,
      phone: data.phone ?? null,
      document: data.document ?? null,
      birthDate: data.birthDate || null,
      passwordHash: await hashPassword(data.password || randomToken(16)),
    })
    .returning();
  return { customer: c, created: true };
}

/** Assinatura estável das linhas de custo (JSONB não preserva a ordem das chaves). */
export function linesSignature(lines: { type: string; label: string; unitCost: string | number; quantity: number }[]): string {
  return lines.map((l) => `${l.type}|${l.label}|${Number(l.unitCost).toFixed(4)}|${l.quantity}`).join("\n");
}

/** Confere preço/disponibilidade com o fornecedor antes de cobrar. */
async function revalidateItems(tx: Tx, cart: Cart) {
  const items = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.status, "ACTIVE")));
  const changed: string[] = [];
  for (const it of items) {
    let q;
    try {
      q = await getAdapter(it.supplierCode).quote({
        productId: it.productId,
        optionId: it.optionId,
        date: it.serviceDate ?? undefined,
        checkIn: it.serviceDate ?? undefined,
        checkOut: it.serviceEndDate ?? undefined,
        startDate: it.serviceDate ?? undefined,
        endDate: it.serviceEndDate ?? undefined,
        pax: it.pax,
      });
    } catch (e) {
      // Fornecedor fora do ar / erro técnico: NÃO remove o item — só não deixa pagar agora.
      if (e instanceof SupplierIntegrationError) {
        console.error(`[checkout] fornecedor ${it.supplierCode}:`, e.message, e.detail ?? "");
        throw new CheckoutError(`Não conseguimos confirmar o preço de “${it.title}” com o fornecedor agora. Tente novamente em instantes.`);
      }
      if (!(e instanceof SupplierError)) throw e;
      await tx
        .update(cartItems)
        .set({ status: "UNAVAILABLE", statusReason: e.message, statusChangedAt: new Date(), noticeAcknowledged: false })
        .where(eq(cartItems.id, it.id));
      changed.push(it.title);
      continue;
    }
    const details = { ...q.details, paxRules: q.paxRules };
    const priceChanged =
      linesSignature(q.lines) !== linesSignature(it.lines) ||
      q.currency !== it.costCurrency ||
      JSON.stringify(minSellPriceOf(details)) !== JSON.stringify(minSellPriceOf(it.details));
    if (priceChanged) {
      console.warn(`[checkout] preço mudou no fornecedor ${it.supplierCode} (${it.title}): ${it.costCurrency} ${linesSignature(it.lines)} → ${q.currency} ${linesSignature(q.lines)}`);
      changed.push(it.title);
    }
    // Sempre guarda a cotação mais recente (ex.: novas chaves de tarifa), mesmo com o preço igual.
    await tx
      .update(cartItems)
      .set({ lines: q.lines, costCurrency: q.currency, details, supplierQuoteRef: q.quoteRef, quotedAt: new Date() })
      .where(eq(cartItems.id, it.id));
  }
  if (changed.length) throw new CheckoutError(`O fornecedor atualizou preço/disponibilidade de: ${changed.join(", ")}. Revise o carrinho antes de pagar.`);
}

export type PlaceOrderInput = {
  cart: Cart;
  customer: Customer;
  payer: PersonData;
  travelers: PersonData[];
  paymentMethod: PaymentMethod;
  installments: number;
  card?: CardInput;
  placedByAffiliateUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Pedido especial ao hotel (ex.: chegada tarde) — vai na reserva. */
  specialRequests?: string | null;
  /** Desligue para testes que não querem consultar o fornecedor. */
  revalidate?: boolean;
  /** Relógio (para seed/testes). */
  now?: Date;
  /** Seed de demonstração: o cartão simulado conta como pago de verdade (nunca em produção). */
  demoPayment?: boolean;
};

export async function placeOrder(tx: Tx, input: PlaceOrderInput) {
  const { cart } = input;
  if (cart.status !== "OPEN") throw new CheckoutError("Este carrinho já foi pago");
  if (input.customer.affiliateId !== cart.affiliateId) throw new CheckoutError("Conta de cliente inválida para esta loja");

  const expired = await sweepExpiredItems(tx, cart.id);
  if (expired.length)
    throw new CheckoutError(`${expired.length} item(ns) foram removidos porque a data já passou. Revise o carrinho.`);
  if (input.revalidate !== false) await revalidateItems(tx, cart);

  const s = await getSettings(tx);
  const priced = await priceCartById(tx, cart);
  if (!priced.items.length) throw new CheckoutError("O carrinho está vazio");
  const t = priced.cart.totals;

  const provider = paymentProvider();
  if (input.paymentMethod === "PIX" && !provider.pixAvailable) throw new CheckoutError("Pix indisponível no momento. Pague com cartão ou PayPal.");
  if (input.paymentMethod === "CARD" && provider.cardCheckout === "inline" && !input.card) throw new CheckoutError("Informe os dados do cartão");
  // PayPal: o cliente escolhe as parcelas no PayPal (até o limite da loja); o valor é o mesmo
  const installments =
    input.paymentMethod === "PIX" ? 1 : provider.cardCheckout === "paypal" ? s.maxInstallments : Math.min(Math.max(1, Math.floor(input.installments || 1)), s.maxInstallments);
  const amountCharged = input.paymentMethod === "PIX" ? t.pix : t.installment;

  // Pedidos pendentes anteriores deste carrinho deixam de valer.
  await tx
    .update(orders)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(and(eq(orders.cartId, cart.id), eq(orders.status, "PENDING_PAYMENT")));

  const [freshCart] = await tx.select().from(carts).where(eq(carts.id, cart.id));
  const ctxFx = await getCurrentFx(tx);
  const couponsSnapshot = (["SUBRINHO", "AFFILIATE"] as const)
    .map((layer) => priced.cart.coupons[layer])
    .filter((r) => r && r.total.gt(0))
    .map((r) => ({
      id: r!.coupon.id,
      code: r!.coupon.code,
      layer: r!.coupon.issuer,
      rule: describeCoupon(r!.coupon),
      discountType: r!.coupon.discountType,
      percentOff: r!.coupon.percentOff,
      amountOff: r!.coupon.amountOff,
      stepAmount: r!.coupon.stepAmount,
      categories: r!.coupon.categories,
      eligibleSubtotal: money(r!.eligibleSubtotal),
      requested: money(r!.requested),
      applied: money(r!.total),
      limitedByMargin: r!.limitedByMargin,
    }));

  const [order] = await tx
    .insert(orders)
    .values({
      cartId: cart.id,
      affiliateId: cart.affiliateId,
      customerId: input.customer.id,
      placedByAffiliateUserId: input.placedByAffiliateUserId ?? null,
      paymentMethod: input.paymentMethod,
      installments,
      cartCreatedAt: freshCart.createdAt,
      cartCreatedByType: freshCart.createdByType,
      cartCreatedById: freshCart.createdByCustomerId ?? freshCart.createdByAffiliateUserId,
      cartViewCountAtOrder: freshCart.viewCount,
      customerData: {
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
        document: input.customer.document,
        birthDate: input.customer.birthDate,
      },
      payerData: input.payer,
      travelers: input.travelers,
      specialRequests: input.specialRequests?.trim().slice(0, 500) || null,
      totalCostBrl: money(t.costBrl),
      totalSubrinhoMargin: money(t.subrinhoMargin),
      totalNetSubrinho: money(t.netSubrinho),
      totalAffiliateMargin: money(t.affiliateMargin),
      totalNetAffiliate: money(t.netAffiliate),
      totalSubrinhoDiscount: money(t.subrinhoDiscount),
      totalAffiliateDiscount: money(t.affiliateDiscount),
      totalPix: money(t.pix),
      totalInstallment: money(t.installment),
      installmentFeePct: s.installmentFeePct,
      amountCharged: money(amountCharged),
      subrinhoRevenue: money(t.subrinhoRevenue),
      affiliateCommission: money(t.affiliateCommission),
      fxSnapshot: ctxFx as never,
      couponsSnapshot,
      paymentProvider: provider.name,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();

  const itemById = new Map(priced.items.map((i) => [i.id, i]));
  await tx.insert(orderItems).values(
    priced.cart.items.map((p) => {
      const it = itemById.get(p.id)!;
      const f = p.final;
      return {
        orderId: order.id,
        cartItemId: it.id,
        category: it.category,
        supplierCode: it.supplierCode,
        productId: it.productId,
        optionId: it.optionId,
        title: it.title,
        subtitle: it.subtitle,
        location: it.location,
        serviceDate: it.serviceDate,
        serviceEndDate: it.serviceEndDate,
        pax: it.pax,
        lines: it.lines,
        details: it.details,
        costCurrency: f.costCurrency,
        costForeign: f.costForeign.toFixed(4),
        fxRate: f.fxRate.toFixed(6),
        costBrl: money(f.costBrl),
        subrinhoMarginPct: f.subrinhoMarginPct.toFixed(4),
        subrinhoMarginRuleId: p.subrinhoMargin.ruleId,
        subrinhoMarginAmount: money(f.subrinhoMarginAmount),
        netSubrinho: money(f.netSubrinho),
        affiliateMarginPct: f.affiliateMarginPct.toFixed(4),
        affiliateMarginSource: p.affiliateMargin.source,
        affiliateMarginRuleId: p.affiliateMargin.ruleId,
        affiliateMarginAmount: money(f.affiliateMarginAmount),
        netAffiliate: money(f.netAffiliate),
        subrinhoDiscount: money(f.subrinhoDiscount),
        affiliateDiscount: money(f.affiliateDiscount),
        finalPix: money(f.finalPix),
        installmentFeePct: f.installmentFeePct.toFixed(4),
        finalInstallment: money(f.finalInstallment),
        chargedAmount: money(input.paymentMethod === "PIX" ? f.finalPix : f.finalInstallment),
        effectiveSubrinhoMarginPct: f.effectiveSubrinhoMarginPct.toFixed(4),
        effectiveAffiliateMarginPct: f.effectiveAffiliateMarginPct.toFixed(4),
        affiliateCommission: money(f.affiliateCommission),
        subrinhoRevenue: money(f.subrinhoRevenue),
        supplierQuoteRef: it.supplierQuoteRef,
        ...(p.floor
          ? {
              details: {
                ...it.details,
                priceFloor: { minPixBrl: money(p.floor.minPix), ruleSubrinhoPct: p.floor.ruleSubrinhoPct?.toFixed(4) ?? null, applied: !!p.floor.ruleSubrinhoPct },
              },
            }
          : {}),
      };
    }),
  );
  await tx.insert(orderEvents).values({
    orderId: order.id,
    type: "ORDER_CREATED",
    data: { paymentMethod: input.paymentMethod, installments, amountCharged: money(amountCharged), placedByAffiliateUserId: input.placedByAffiliateUserId ?? null },
  });

  if (input.paymentMethod === "PIX") {
    const pix = await provider.createPix({ orderNumber: order.number, amount: money(amountCharged), expiresInMinutes: s.pixExpirationMinutes });
    const [o] = await tx.update(orders).set({ paymentRef: pix.txid, paymentData: { pix } }).where(eq(orders.id, order.id)).returning();
    await tx.insert(orderEvents).values({ orderId: order.id, type: "PIX_CREATED", data: { txid: pix.txid, expiresAt: pix.expiresAt } });
    await notifySafely(tx, "pedido com Pix", (t) => notifyOrderPlaced(t, order.id));
    return { order: o, approved: false as const };
  }

  if (provider.cardCheckout === "paypal") {
    // o pagamento acontece nos botões do PayPal na página do pedido (createPaypalCheckout → capturePaypalCheckout)
    const [o] = await tx.update(orders).set({ paymentData: { paypal: { status: "AWAITING_BUYER" } } }).where(eq(orders.id, order.id)).returning();
    return { order: o, approved: false as const };
  }

  if (!input.card || !provider.chargeCard) throw new CheckoutError("Informe os dados do cartão");
  const res = await provider.chargeCard({ orderNumber: order.number, amount: money(amountCharged), card: { ...input.card, installments } });
  // cartão do ambiente de testes: aprovado, mas simulado (não emite reserva real nem gera repasse)
  const simulated = provider.name === "mock" && !input.demoPayment;
  const cardData = { brand: res.brand, last4: res.last4, holder: input.card.holder, installments, message: res.message, ref: res.ref };
  if (!res.approved) {
    const [o] = await tx.update(orders).set({ paymentRef: res.ref, paymentData: { card: cardData, declined: true } }).where(eq(orders.id, order.id)).returning();
    await tx.insert(orderEvents).values({ orderId: order.id, type: "PAYMENT_DECLINED", data: cardData });
    return { order: o, approved: false as const, declined: res.message };
  }
  await tx.update(orders).set({ paymentRef: res.ref, paymentData: { card: cardData } }).where(eq(orders.id, order.id));
  const paid = await markOrderPaid(tx, order.id, { paidAt: input.now ?? new Date(), ref: res.ref, data: { card: cardData, ...(simulated ? { simulated: true } : {}) } });
  return { order: paid, approved: true as const };
}

/** Confirma o pagamento (webhook do gateway / mock). Idempotente. */
export async function markOrderPaid(tx: Tx, orderId: string, p: { paidAt: Date; ref?: string | null; data?: Record<string, unknown> }) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new CheckoutError("Pedido não encontrado");
  if (order.status === "PAID") return order;

  const payoutDate = await payoutDateFor(tx, p.paidAt);
  const [updated] = await tx
    .update(orders)
    .set({
      status: "PAID",
      paidAt: p.paidAt,
      payoutDate,
      paymentRef: p.ref ?? order.paymentRef,
      paymentData: { ...order.paymentData, ...(p.data ?? {}), confirmedAt: p.paidAt.toISOString() },
    })
    .where(eq(orders.id, orderId))
    .returning();
  if (order.status === "CANCELLED")
    await tx.insert(orderEvents).values({ orderId, type: "PAID_AFTER_CANCEL", data: { note: "Pagamento recebido após o pedido ter sido substituído, verificar estorno" } });

  await tx.update(carts).set({ status: "CONVERTED", convertedOrderId: orderId, convertedAt: p.paidAt }).where(eq(carts.id, order.cartId));

  const couponIds = (order.couponsSnapshot as { id: string }[]).map((c) => c.id);
  if (couponIds.length) await tx.update(coupons).set({ redemptions: sql`${coupons.redemptions} + 1` }).where(inArray(coupons.id, couponIds));

  await tx.insert(orderEvents).values({ orderId, type: "PAID", data: { paidAt: p.paidAt.toISOString(), payoutDate, ref: p.ref ?? null } });

  // Emissão/reserva nos fornecedores.
  // Fornecedor real: o item fica "Aguardando emissão" e a reserva é feita fora desta transação
  // (src/server/bookings/service.ts — painel Subrinho ou emissão automática com gateway real).
  // Catálogo simulado: "reserva" instantânea, sem efeito externo.
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const it of items) {
    if (needsControlledIssue(it.supplierCode)) {
      await tx.update(orderItems).set({ supplierStatus: "AWAITING_ISSUE" }).where(eq(orderItems.id, it.id));
      await tx.insert(orderEvents).values({ orderId, type: "BOOKING_PENDING", data: { itemId: it.id, supplier: it.supplierCode } });
      continue;
    }
    try {
      const b = await getAdapter(it.supplierCode).book(
        { quoteRef: it.supplierQuoteRef, productId: it.productId, optionId: it.optionId, pax: it.pax, serviceDate: it.serviceDate, serviceEndDate: it.serviceEndDate, details: it.details },
        { travelers: updated.travelers, holder: updated.payerData },
      );
      await tx.update(orderItems).set({ supplierBookingRef: b.bookingRef, supplierStatus: b.status, supplierPayload: b.payload }).where(eq(orderItems.id, it.id));
    } catch (e) {
      await tx.update(orderItems).set({ supplierStatus: "BOOKING_FAILED", supplierPayload: { error: String(e) } }).where(eq(orderItems.id, it.id));
      await tx.insert(orderEvents).values({ orderId, type: "BOOKING_FAILED", data: { itemId: it.id, error: String(e) } });
    }
  }
  // e-mails: cliente (pagamento + vouchers já prontos), agência (nova venda) e equipe (emitir)
  await notifySafely(tx, "pagamento confirmado", async (t) => {
    await notifyOrderPaid(t, orderId, { paidAfterCancel: order.status === "CANCELLED" });
    const ready = await t.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.supplierStatus, "CONFIRMED")));
    for (const r of ready) await notifyItemReady(t, r.id);
  });
  return updated;
}

export { loadCartView };
