/**
 * Pagamento com PayPal na página do pedido.
 *
 * 1. createPaypalCheckout: cria (ou reaproveita) o pedido no PayPal com o valor do nosso pedido.
 * 2. O cliente aprova nos botões do PayPal (cartão ou conta PayPal, parcelado conforme a conta).
 * 3. capturePaypalCheckout: captura e confere pedido, moeda e valor antes de marcar como pago.
 * syncPaypalOrder repete a conferência a partir da API do PayPal (página do pedido e webhook):
 * se o cliente fechou o navegador depois de aprovar, a captura acontece mesmo assim.
 *
 * Nunca captura um pedido cancelado/substituído ou de carrinho já pago em outro pedido.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "@/server/db";
import { carts, orderEvents, orders } from "@/server/db/schema";
import { CheckoutError, markOrderPaid } from "@/server/checkout/service";
import { orderNumber } from "@/lib/format";
import { evaluatePaypalOrder, PaypalApiError, paypalClient, pendingReasonPt, type PaypalClient, type PaypalOrder, type PaypalOutcome } from "./paypal";

type Order = typeof orders.$inferSelect;
export type PaypalData = {
  orderId?: string;
  status?: string;
  captureId?: string | null;
  fee?: string | null;
  net?: string | null;
  payer?: string | null;
  method?: string | null;
  pendingReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CheckoutResult =
  | { state: "PAID"; order: Order }
  | { state: "PENDING"; message: string }
  | { state: "RETRY"; message: string }
  | { state: "DECLINED"; message: string }
  | { state: "CLOSED"; message: string }
  | { state: "WAITING"; message: string };

const paypalOf = (o: Order): PaypalData => ((o.paymentData as { paypal?: PaypalData } | null)?.paypal ?? {}) as PaypalData;

function clientOrThrow(client?: PaypalClient | null): PaypalClient {
  const c = client ?? paypalClient();
  if (!c) throw new CheckoutError("Pagamento com PayPal indisponível no momento");
  return c;
}

async function saveData(db: DB, o: Order, patch: PaypalData, event?: { type: string; data: Record<string, unknown> }) {
  await db.transaction(async (tx) => {
    const [cur] = await tx.select({ paymentData: orders.paymentData }).from(orders).where(eq(orders.id, o.id)).for("update");
    const pd = (cur?.paymentData ?? {}) as Record<string, unknown>;
    const paypal = { ...((pd.paypal as PaypalData) ?? {}), ...patch, updatedAt: new Date().toISOString() };
    await tx
      .update(orders)
      .set({ paymentData: { ...pd, paypal }, ...(patch.orderId ? { paymentRef: patch.orderId } : {}) })
      .where(eq(orders.id, o.id));
    if (event) await tx.insert(orderEvents).values({ orderId: o.id, type: event.type, data: event.data });
  });
}

/** O pedido pode receber pagamento pelo PayPal? (mensagem para o cliente quando não) */
async function payableError(db: DB, o: Order): Promise<string | null> {
  if (o.status === "PAID") return "Este pedido já está pago";
  if (o.status !== "PENDING_PAYMENT") return "Este pedido não aceita mais pagamento. Volte ao carrinho para gerar um novo.";
  if (o.paymentMethod !== "CARD" || o.paymentProvider !== "paypal") return "Este pedido não é pago pelo PayPal";
  const [cart] = await db.select({ status: carts.status, convertedOrderId: carts.convertedOrderId }).from(carts).where(eq(carts.id, o.cartId));
  if (cart?.status === "CONVERTED" && cart.convertedOrderId && cart.convertedOrderId !== o.id) return "Este carrinho já foi pago em outro pedido";
  return null;
}

/** Cria (ou reaproveita) o pedido no PayPal. Devolve o id para os botões do PayPal. */
export async function createPaypalCheckout(db: DB, o: Order, ctx: { brandName: string }, client?: PaypalClient | null): Promise<string> {
  const pp = clientOrThrow(client);
  const err = await payableError(db, o);
  if (err) throw new CheckoutError(err);
  const prev = paypalOf(o).orderId;
  if (prev) {
    // o mesmo pedido do PayPal serve enquanto não foi pago nem anulado (cliente fechou a janela e voltou)
    const cur = await pp.getOrder(prev).catch(() => null);
    const out = cur ? evaluatePaypalOrder(cur, { orderId: o.id, amount: o.amountCharged }) : null;
    if (out && (out.state === "AWAITING_BUYER" || out.state === "APPROVED") && cur?.status !== "VOIDED") return prev;
  }
  const created = await pp.createOrder({
    orderId: o.id,
    orderNumber: o.number,
    amount: Number(o.amountCharged).toFixed(2),
    description: `Pedido ${orderNumber(o.number)} · ${ctx.brandName}`,
    brandName: ctx.brandName,
  });
  if (!created.id) throw new CheckoutError("O PayPal não devolveu o pedido. Tente novamente.");
  await saveData(db, o, { orderId: created.id, status: created.status ?? "CREATED", createdAt: new Date().toISOString() }, { type: "PAYPAL_ORDER_CREATED", data: { paypalOrderId: created.id, amount: o.amountCharged } });
  return created.id;
}

/** Aplica o resultado do PayPal ao nosso pedido (pago, pendente, recusado…). */
async function apply(db: DB, o: Order, paypalOrderId: string, out: PaypalOutcome): Promise<CheckoutResult> {
  switch (out.state) {
    case "PAID": {
      const paid = await db.transaction(async (tx) => {
        const [cur] = await tx.select().from(orders).where(eq(orders.id, o.id)).for("update");
        if (cur.status === "PAID") return cur;
        const data: PaypalData = { ...paypalOf(cur), orderId: paypalOrderId, status: "COMPLETED", captureId: out.captureId, fee: out.fee, net: out.net, payer: out.payer, method: out.method, updatedAt: new Date().toISOString() };
        const r = await markOrderPaid(tx, o.id, { paidAt: new Date(), ref: out.captureId || paypalOrderId, data: { paypal: data } });
        await tx.insert(orderEvents).values({ orderId: o.id, type: "PAYPAL_CAPTURED", data: { paypalOrderId, captureId: out.captureId, amount: out.amount, fee: out.fee, net: out.net, method: out.method } });
        return r;
      });
      return { state: "PAID", order: paid };
    }
    case "PENDING": {
      if (paypalOf(o).status !== "PENDING") await saveData(db, o, { orderId: paypalOrderId, status: "PENDING", captureId: out.captureId, pendingReason: out.reason }, { type: "PAYMENT_PENDING", data: { paypalOrderId, captureId: out.captureId, reason: out.reason } });
      return { state: "PENDING", message: `Pagamento recebido e ${pendingReasonPt(out.reason)}. Assim que for liberado, o pedido é confirmado automaticamente.` };
    }
    case "DECLINED":
      await saveData(db, o, { orderId: paypalOrderId, status: out.status, captureId: out.captureId }, { type: "PAYMENT_DECLINED", data: { paypalOrderId, captureId: out.captureId, status: out.status } });
      return { state: "DECLINED", message: "O pagamento foi recusado. Tente outro cartão ou outra forma de pagamento." };
    case "MISMATCH":
      await saveData(db, o, { status: "MISMATCH" }, { type: "PAYMENT_MISMATCH", data: { paypalOrderId, reason: out.reason } });
      return { state: "CLOSED", message: "Não conseguimos confirmar este pagamento. Nossa equipe vai verificar e falar com você." };
    case "REFUNDED":
      return { state: "CLOSED", message: "Este pagamento foi estornado." };
    case "VOIDED":
      return { state: "WAITING", message: "O pagamento anterior expirou. Clique de novo para pagar." };
    default:
      return { state: "WAITING", message: "Aguardando o pagamento no PayPal." };
  }
}

/** Captura depois que o cliente aprovou nos botões do PayPal. */
export async function capturePaypalCheckout(db: DB, o: Order, paypalOrderId: string, client?: PaypalClient | null): Promise<CheckoutResult> {
  const pp = clientOrThrow(client);
  if (o.status === "PAID") return { state: "PAID", order: o };
  if (paypalOf(o).orderId !== paypalOrderId) throw new CheckoutError("Pagamento não corresponde a este pedido");
  const err = await payableError(db, o);
  if (err) return { state: "CLOSED", message: err };
  let result: PaypalOrder;
  try {
    result = await pp.captureOrder(paypalOrderId);
  } catch (e) {
    if (!(e instanceof PaypalApiError)) throw e;
    // cartão recusado: o PayPal deixa o cliente escolher outro meio na mesma janela
    if (e.issue === "INSTRUMENT_DECLINED") return { state: "RETRY", message: "O cartão foi recusado. Escolha outro cartão ou forma de pagamento." };
    if (e.issue === "PAYER_ACTION_REQUIRED") return { state: "RETRY", message: "O PayPal pediu uma confirmação. Conclua na janela do PayPal." };
    // já capturado (outra aba/webhook), não aprovado ainda ou falha de rede: confere o estado real
    const cur = await pp.getOrder(paypalOrderId).catch(() => null);
    if (!cur) throw new CheckoutError("Não conseguimos falar com o PayPal agora. Se o valor foi debitado, o pedido é confirmado automaticamente em instantes.");
    result = cur;
  }
  return apply(db, o, paypalOrderId, evaluatePaypalOrder(result, { orderId: o.id, amount: o.amountCharged }));
}

/**
 * Confere no PayPal o pedido que aguarda pagamento (página do pedido, webhook): captura se o
 * cliente aprovou e não voltou, confirma se já foi capturado. Sem pedido no PayPal, não faz nada.
 */
export async function syncPaypalOrder(db: DB, orderId: string, client?: PaypalClient | null): Promise<CheckoutResult | null> {
  const pp = client ?? paypalClient();
  if (!pp) return null;
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  const ref = o ? paypalOf(o).orderId : undefined;
  if (!o || !ref || o.status === "PAID" || o.paymentProvider !== "paypal") return null;
  const cur = await pp.getOrder(ref);
  const out = evaluatePaypalOrder(cur, { orderId: o.id, amount: o.amountCharged });
  if (out.state === "APPROVED") {
    if (await payableError(db, o)) return null; // pedido substituído: não captura (o PayPal anula sozinho)
    return capturePaypalCheckout(db, o, ref, pp);
  }
  return apply(db, o, ref, out);
}

/** Id do pedido no PayPal citado num evento de webhook. */
export function paypalOrderIdOf(event: { event_type?: string; resource?: Record<string, unknown> }): string | null {
  const r = event.resource ?? {};
  if ((event.event_type ?? "").startsWith("CHECKOUT.ORDER.")) return typeof r.id === "string" ? r.id : null;
  const related = (r.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id;
  return typeof related === "string" ? related : null;
}

/**
 * Webhook do PayPal. O conteúdo do evento só aponta o pedido: o estado é sempre relido da API do
 * PayPal com as nossas credenciais (um evento forjado não confirma nada).
 */
export async function handlePaypalWebhook(db: DB, event: { id?: string; event_type?: string; resource?: Record<string, unknown> }, client?: PaypalClient | null): Promise<{ handled: boolean; note: string; orderId?: string }> {
  const pp = clientOrThrow(client);
  const type = event.event_type ?? "";
  const ref = paypalOrderIdOf(event);
  if (!ref) return { handled: false, note: `evento ${type} sem pedido` };
  const cur = await pp.getOrder(ref).catch((e) => {
    if (e instanceof PaypalApiError && e.status === 404) return null;
    throw e;
  });
  if (!cur) return { handled: false, note: "pedido do PayPal não encontrado" };
  const ourId = cur.purchase_units?.[0]?.custom_id ?? cur.purchase_units?.[0]?.reference_id;
  if (!ourId || !/^[0-9a-f-]{36}$/i.test(ourId)) return { handled: false, note: "pedido sem referência nossa" };
  const [o] = await db.select().from(orders).where(and(eq(orders.id, ourId), eq(orders.paymentProvider, "paypal")));
  if (!o) return { handled: false, note: "pedido não encontrado" };
  if (/^PAYMENT\.CAPTURE\.(REFUNDED|REVERSED)$/.test(type)) {
    await db.insert(orderEvents).values({ orderId: o.id, type: type.endsWith("REVERSED") ? "PAYMENT_REVERSED" : "PAYMENT_REFUNDED", data: { paypalOrderId: ref, eventId: event.id ?? null, resourceId: event.resource?.id ?? null, amount: (event.resource?.amount as { value?: string } | undefined)?.value ?? null } });
    return { handled: true, note: "estorno registrado", orderId: o.id };
  }
  if (paypalOf(o).orderId !== ref) return { handled: false, note: "pedido do PayPal antigo deste pedido" };
  const r = await syncPaypalOrder(db, o.id, pp);
  return { handled: true, note: r?.state ?? "sem mudança", orderId: o.id };
}
