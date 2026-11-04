/**
 * Webhook do gateway de pagamento (PayPal).
 * O evento só aponta o pedido: o estado do pagamento é sempre relido da API do PayPal com as nossas
 * credenciais (handlePaypalWebhook) — um evento forjado não confirma nada. Com PAYPAL_WEBHOOK_ID,
 * a assinatura do PayPal também é conferida antes.
 *
 * Eventos úteis: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.PENDING,
 * PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED.
 */
import { after } from "next/server";
import { getDb } from "@/server/db";
import { autoIssueOrder } from "@/server/bookings/service";
import { paypalClient } from "@/server/payments/paypal";
import { handlePaypalWebhook } from "@/server/payments/paypal-checkout";

export const maxDuration = 60;

export async function POST(request: Request) {
  const client = paypalClient();
  if (!client) return Response.json({ error: "Gateway de pagamento não configurado" }, { status: 501 });
  const raw = await request.text();
  let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (client.cfg.webhookId) {
    const ok = await client.verifyWebhook(request.headers, event).catch(() => false);
    if (!ok) return Response.json({ error: "assinatura inválida" }, { status: 401 });
  }
  try {
    const r = await handlePaypalWebhook(getDb(), event, client);
    if (r.note === "PAID" && r.orderId) {
      const orderId = r.orderId;
      after(() => autoIssueOrder(orderId));
    }
    return Response.json({ ok: true, handled: r.handled, note: r.note });
  } catch (e) {
    console.error("[paypal] webhook:", event.event_type, e instanceof Error ? e.message : e);
    // 500: o PayPal reenvia o evento mais tarde
    return Response.json({ error: "falha ao processar" }, { status: 500 });
  }
}
