/**
 * Link de acesso ao pedido enviado por e-mail: /pedido/<id>?k=<chave>. A chave é um HMAC do id do
 * pedido (só o servidor sabe gerar), então quem tem o link vê aquele pedido e os vouchers dele sem
 * precisar entrar na conta. Nenhuma ação de conta (dados pessoais, outros pedidos) fica liberada.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => `subrinho-order|${process.env.ORDER_LINK_SECRET ?? process.env.MEDIA_SECRET ?? process.env.CRON_SECRET ?? process.env.DATABASE_URL ?? "subrinho"}`;

export function orderAccessKey(orderId: string): string {
  return createHmac("sha256", secret()).update(orderId).digest("base64url").slice(0, 32);
}

export function validOrderAccessKey(orderId: string, key: string | null | undefined): boolean {
  if (!key || key.length !== 32) return false;
  const a = Buffer.from(orderAccessKey(orderId));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
