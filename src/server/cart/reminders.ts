/**
 * Carrinho abandonado: um lembrete por e-mail por carrinho, quando o cliente é conhecido (montou o
 * carrinho logado ou chegou a gerar um pedido sem pagar) e ficou parado entre 20 horas e 7 dias.
 * Carrinho montado pela agência para o cliente não recebe e-mail automático: a agência lembra pelo
 * WhatsApp (botão pronto em Painel do Afiliado › Carrinhos).
 */
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/server/db";
import { affiliates, cartItems, carts, customers, orders } from "@/server/db/schema";
import { sendCartReminder } from "@/server/email/notify";
import { isEmail } from "@/server/email/outbox";

export const REMINDER_AFTER_H = 20;
export const REMINDER_UNTIL_D = 7;

export async function sendAbandonedCartReminders(db: DB, now = new Date(), limit = 200) {
  const rows = await db
    .select({ cart: carts, store: affiliates, customer: customers })
    .from(carts)
    .innerJoin(affiliates, eq(affiliates.id, carts.affiliateId))
    .leftJoin(customers, eq(customers.id, carts.createdByCustomerId))
    .where(
      and(
        eq(carts.status, "OPEN"),
        isNull(carts.reminderSentAt),
        eq(affiliates.active, true),
        lte(carts.updatedAt, new Date(now.getTime() - REMINDER_AFTER_H * 3600_000)),
        gte(carts.updatedAt, new Date(now.getTime() - REMINDER_UNTIL_D * 86400_000)),
        sql`exists (select 1 from ${cartItems} ci where ci.cart_id = ${carts.id} and ci.status = 'ACTIVE' and (ci.service_date is null or ci.service_date >= ${now.toISOString().slice(0, 10)}))`,
      ),
    )
    .orderBy(carts.updatedAt)
    .limit(limit);

  let sent = 0;
  for (const { cart, store, customer } of rows) {
    if (cart.createdByType === "AFFILIATE") continue;
    let to = customer && !customer.deletedAt ? customer.email : null;
    let name = customer?.name ?? null;
    if (!isEmail(to)) {
      // sem conta: o pedido não pago guardou o e-mail de quem tentou pagar
      const [o] = await db.select({ data: orders.customerData }).from(orders).where(eq(orders.cartId, cart.id)).orderBy(desc(orders.createdAt)).limit(1);
      to = o?.data?.email ?? null;
      name = o?.data?.name ?? name;
    }
    if (!isEmail(to)) continue;
    const items = await db
      .select({ title: cartItems.title, subtitle: cartItems.subtitle, category: cartItems.category, serviceDate: cartItems.serviceDate, serviceEndDate: cartItems.serviceEndDate })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.status, "ACTIVE")));
    await db.transaction(async (tx) => {
      // trava: só um lembrete por carrinho, mesmo com dois crons ao mesmo tempo
      const [claimed] = await tx.update(carts).set({ reminderSentAt: now }).where(and(eq(carts.id, cart.id), isNull(carts.reminderSentAt))).returning({ id: carts.id });
      if (!claimed) return;
      await sendCartReminder(tx, { store, cart, to: to!, name, items });
      sent++;
    });
  }
  return { checked: rows.length, sent };
}

/** Mensagem pronta de WhatsApp para a agência lembrar o cliente do carrinho. */
export function cartWhatsappText(p: { storeName: string; customerName?: string | null; link: string }) {
  const hi = p.customerName?.trim() ? `Oi, ${p.customerName.trim().split(/\s+/)[0]}!` : "Oi!";
  return `${hi} Aqui é da ${p.storeName}. Seu carrinho continua salvo: ${p.link}\nQuer ajuda para finalizar ou ajustar alguma coisa?`;
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const intl = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
