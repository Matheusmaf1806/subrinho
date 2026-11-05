/**
 * Direitos do titular (LGPD) para o cliente da loja: cópia dos dados (portabilidade) e exclusão da conta.
 * Na exclusão, os dados pessoais da conta são apagados e os pedidos ficam guardados com o mínimo
 * necessário, por obrigação fiscal e legal (5 anos), como explica a Política de privacidade.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/server/db";
import { authTokens, carts, customers, orderItems, orders, sessions } from "@/server/db/schema";
import { randomToken } from "@/lib/random";
import { hashPassword } from "@/server/auth/password";
import { recordAudit } from "@/server/audit";

export async function exportCustomerData(db: DB, customerId: string) {
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) return null;
  const list = await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt));
  const items = list.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map((o) => o.id))) : [];
  return {
    geradoEm: new Date().toISOString(),
    conta: { nome: c.name, email: c.email, telefone: c.phone, cpf: c.document, nascimento: c.birthDate, criadaEm: c.createdAt },
    pedidos: list.map((o) => ({
      numero: o.number,
      criadoEm: o.createdAt,
      status: o.status,
      pagamento: o.paymentMethod,
      totalCobrado: o.amountCharged,
      comprador: o.customerData,
      pagador: o.payerData,
      viajantes: o.travelers,
      pedidoEspecial: o.specialRequests,
      itens: items
        .filter((i) => i.orderId === o.id)
        .map((i) => ({ titulo: i.title, detalhe: i.subtitle, categoria: i.category, data: i.serviceDate, ate: i.serviceEndDate, valor: i.chargedAmount, localizador: i.supplierBookingRef })),
    })),
  };
}

export class AccountDeletionError extends Error {}

/** Apaga os dados pessoais da conta e encerra as sessões. Os pedidos continuam (obrigação legal). */
export async function deleteCustomerAccount(db: DB, customerId: string) {
  const anon = `excluida-${customerId.slice(0, 8)}-${Date.now().toString(36)}@contas.invalid`;
  const hash = await hashPassword(randomToken(24));
  await db.transaction(async (tx) => {
    const [c] = await tx
      .update(customers)
      .set({ name: "Conta excluída", email: anon, phone: null, document: null, birthDate: null, passwordHash: hash, deletedAt: new Date() })
      .where(and(eq(customers.id, customerId)))
      .returning({ id: customers.id, affiliateId: customers.affiliateId });
    if (!c) throw new AccountDeletionError("Conta não encontrada");
    await tx.delete(sessions).where(and(eq(sessions.userType, "CUSTOMER"), eq(sessions.userId, customerId)));
    // links de nova senha pedidos antes da exclusão deixam de valer
    await tx.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.userType, "CUSTOMER"), eq(authTokens.userId, customerId), isNull(authTokens.usedAt)));
    // carrinhos abertos deixam de apontar para a conta (não recebem mais lembrete)
    await tx.update(carts).set({ createdByCustomerId: null }).where(and(eq(carts.createdByCustomerId, customerId), eq(carts.status, "OPEN")));
    await recordAudit(tx, { actor: { type: "CUSTOMER", id: customerId, name: "Cliente" }, affiliateId: c.affiliateId, action: "customer.delete", entity: "customer", entityId: customerId, summary: "Cliente excluiu a própria conta (LGPD)" });
  });
}
