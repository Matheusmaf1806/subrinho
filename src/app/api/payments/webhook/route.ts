/**
 * Webhook do gateway de pagamento (a definir).
 * Ao integrar: valide a assinatura do gateway, localize o pedido por paymentRef/txid e chame
 * markOrderPaid(tx, order.id, { paidAt, ref, data }) dentro de db.transaction.
 */
export async function POST() {
  return Response.json({ error: "Gateway de pagamento não configurado (PAYMENT_PROVIDER=mock)" }, { status: 501 });
}
