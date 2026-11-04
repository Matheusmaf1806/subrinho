/**
 * Emissão das reservas nos fornecedores REAIS (hotéis da GGT e da Hotelbeds).
 *
 * Regras de segurança:
 *  - a reserva só é feita depois do pagamento confirmado (pedido PAID);
 *  - com pagamento simulado (PAYMENT_PROVIDER=mock) NUNCA há emissão automática: o item fica
 *    "Aguardando emissão" e a equipe Subrinho emite pelo painel, conferindo antes;
 *  - emissão automática só com SUPPLIER_BOOKING=auto e gateway de pagamento real;
 *  - a chamada ao fornecedor acontece FORA de transação, com o item travado em "ISSUING" — duas
 *    pessoas/abas não emitem o mesmo item; e o adaptador procura a reserva pela nossa referência
 *    antes de reservar (se a resposta anterior se perdeu, recupera em vez de reservar de novo);
 *  - nunca reserva se o fornecedor pedir mais do que o custo vendido.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DB } from "@/server/db";
import { orderEvents, orderItems, orders } from "@/server/db/schema";
import { isMockPayments } from "@/server/payments/provider";
import { getAdapter, isLiveSupplier } from "@/server/suppliers/registry";
import { SupplierError, SupplierIntegrationError } from "@/server/suppliers/types";

export const BOOKING_STATUS = {
  AWAITING_ISSUE: "AWAITING_ISSUE",
  ISSUING: "ISSUING",
  CONFIRMED: "CONFIRMED",
  PENDING: "PENDING",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  BOOKING_FAILED: "BOOKING_FAILED",
  ISSUE_UNKNOWN: "ISSUE_UNKNOWN",
} as const;

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  AWAITING_ISSUE: "Aguardando emissão",
  ISSUING: "Emitindo…",
  CONFIRMED: "Reserva confirmada",
  PENDING: "Pedido enviado, aguardando confirmação do fornecedor",
  CANCEL_REQUESTED: "Cancelamento solicitado",
  SIMULATED: "Simulação",
  REJECTED: "Recusada pelo fornecedor",
  CANCELLED: "Cancelada no fornecedor",
  BOOKING_FAILED: "Falha na emissão",
  ISSUE_UNKNOWN: "Sem resposta do fornecedor, verificar",
};

const RETRYABLE = new Set<string>([BOOKING_STATUS.AWAITING_ISSUE, BOOKING_STATUS.BOOKING_FAILED, BOOKING_STATUS.ISSUE_UNKNOWN, BOOKING_STATUS.REJECTED]);
const STALE_ISSUING_MS = 3 * 60_000;

export class BookingIssueError extends Error {}

export function autoIssueEnabled(): boolean {
  return process.env.SUPPLIER_BOOKING?.trim().toLowerCase() === "auto" && !isMockPayments();
}

/** Referência única do item no fornecedor (curta: a Hotelbeds aceita até 20 caracteres). */
export function bookingReference(orderNumber: number, position: number): string {
  return `SUB${orderNumber}-${position}`;
}

/** O item precisa de emissão controlada? (fornecedor real) */
export function needsControlledIssue(supplierCode: string): boolean {
  try {
    return isLiveSupplier(supplierCode);
  } catch {
    return false;
  }
}

/** Pagamento marcado pelo botão "Simular pagamento" (somente ambiente de testes). */
export function isSimulatedPayment(paymentData: unknown): boolean {
  return (paymentData as { simulated?: boolean } | null)?.simulated === true;
}

type IssueOutcome = { itemId: string; status: string; bookingRef: string | null; message: string };

/**
 * Emite a reserva de um item já pago. `actor` = quem pediu (para o histórico).
 * Pode ser chamada de novo após falha: é idempotente.
 */
export async function issueItemBooking(
  itemId: string,
  actor: { type: "SUBRINHO" | "SYSTEM"; id?: string | null; name?: string | null },
  db: DB = getDb(),
): Promise<IssueOutcome> {
  const [row] = await db
    .select({ item: orderItems, order: orders })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.id, itemId));
  if (!row) throw new BookingIssueError("Item não encontrado");
  const { item, order } = row;
  if (order.status !== "PAID") throw new BookingIssueError("O pedido ainda não está pago. A reserva só é emitida depois do pagamento");
  // Pagamento simulado (ambiente sem gateway) não é dinheiro de verdade: nunca vira reserva real com custo.
  if (isSimulatedPayment(order.paymentData) && process.env.ALLOW_SIMULATED_ISSUE !== "1")
    throw new BookingIssueError("Pagamento simulado (teste): não é dinheiro real, então nenhuma reserva é emitida no fornecedor. Confirme um pagamento real antes.");
  if (item.supplierStatus === BOOKING_STATUS.CONFIRMED || item.supplierStatus === BOOKING_STATUS.PENDING)
    return { itemId, status: item.supplierStatus, bookingRef: item.supplierBookingRef, message: "Este item já tem reserva no fornecedor" };

  // posição do item no pedido (estável) → referência
  const siblings = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  const position = siblings.findIndex((s) => s.id === itemId) + 1;
  const reference = (item.supplierPayload as { reference?: string } | null)?.reference ?? bookingReference(order.number, position);

  // trava: só um emissor por vez
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_ISSUING_MS).toISOString();
  const locked = await db
    .update(orderItems)
    .set({
      supplierStatus: BOOKING_STATUS.ISSUING,
      supplierPayload: sql`coalesce(${orderItems.supplierPayload}, '{}'::jsonb) || ${JSON.stringify({ reference, issuingSince: now.toISOString(), issuingBy: actor.name ?? actor.type })}::jsonb`,
    })
    .where(
      and(
        eq(orderItems.id, itemId),
        sql`(${orderItems.supplierStatus} is null or ${orderItems.supplierStatus} in (${sql.join([...RETRYABLE].map((s) => sql`${s}`), sql`, `)}) or (${orderItems.supplierStatus} = ${BOOKING_STATUS.ISSUING} and coalesce(${orderItems.supplierPayload}->>'issuingSince', '') < ${staleBefore}))`,
      ),
    )
    .returning({ id: orderItems.id });
  if (!locked.length) throw new BookingIssueError("Este item já está sendo emitido. Aguarde alguns instantes e atualize a página.");

  await db.insert(orderEvents).values({ orderId: order.id, type: "BOOKING_REQUESTED", data: { itemId, reference, by: actor.id ?? null, byName: actor.name ?? actor.type } });

  const travelers = order.travelers ?? [];
  // titular da reserva = viajante principal (exigência dos fornecedores); pagador como reserva
  const holder = travelers.find((t) => t.type !== "CHILD" && t.name?.trim()) ?? order.payerData ?? null;
  // depois de uma falha, a nova tentativa refaz a consulta no fornecedor (não repete a chamada recusada)
  const retry = item.supplierStatus === BOOKING_STATUS.BOOKING_FAILED || item.supplierStatus === BOOKING_STATUS.REJECTED;
  let status: string;
  let bookingRef: string | null = null;
  let payload: Record<string, unknown>;
  let message: string;
  try {
    const adapter = getAdapter(item.supplierCode);
    const r = await adapter.book(
      {
        quoteRef: item.supplierQuoteRef,
        productId: item.productId,
        optionId: item.optionId,
        pax: item.pax,
        serviceDate: item.serviceDate,
        serviceEndDate: item.serviceEndDate,
        details: item.details,
        reference,
        maxCost: { currency: item.costCurrency, amount: item.costForeign },
      },
      {
        travelers,
        holder,
        retry,
        remark: order.specialRequests,
        contact: {
          email: order.customerData?.email ?? order.payerData?.email ?? null,
          phone: order.customerData?.phone ?? order.payerData?.phone ?? null,
          state: order.payerData?.address?.state ?? order.customerData?.address?.state ?? null,
        },
      },
    );
    status = r.status === "CONFIRMED" || r.status === "PENDING" || r.status === "REJECTED" || r.status === "CANCELLED" ? r.status : BOOKING_STATUS.PENDING;
    bookingRef = r.bookingRef || null;
    payload = { ...r.payload, reference, issuedAt: new Date().toISOString(), issuedBy: actor.name ?? actor.type };
    if (status === "CONFIRMED" && bookingRef && adapter.voucher) {
      const voucher = await adapter.voucher(bookingRef, payload).catch(() => null);
      if (voucher) payload.voucher = voucher;
    }
    message = status === "CONFIRMED" ? `Reserva confirmada (${bookingRef})` : status === "PENDING" ? `Pedido enviado ao fornecedor (${bookingRef}), aguardando confirmação` : `Fornecedor respondeu: ${BOOKING_STATUS_LABEL[status] ?? status}`;
  } catch (e) {
    const timeout = e instanceof SupplierIntegrationError && e.detail?.timeout === true;
    status = timeout ? BOOKING_STATUS.ISSUE_UNKNOWN : BOOKING_STATUS.BOOKING_FAILED;
    message = e instanceof SupplierError ? e.message : `Erro inesperado: ${e instanceof Error ? e.message : String(e)}`;
    payload = { reference, error: message, failedAt: new Date().toISOString(), ...(e instanceof SupplierIntegrationError && e.detail ? { errorDetail: e.detail } : {}) };
  }
  await db.update(orderItems).set({ supplierStatus: status, supplierBookingRef: bookingRef, supplierPayload: payload }).where(eq(orderItems.id, itemId));
  await db.insert(orderEvents).values({
    orderId: order.id,
    type: status === BOOKING_STATUS.CONFIRMED || status === BOOKING_STATUS.PENDING ? "BOOKING_CONFIRMED" : "BOOKING_FAILED",
    data: { itemId, reference, status, bookingRef, message },
  });
  return { itemId, status, bookingRef, message };
}

/** Consulta o status atual da reserva no fornecedor. */
export async function refreshItemBooking(itemId: string, db: DB = getDb()): Promise<IssueOutcome> {
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
  if (!item) throw new BookingIssueError("Item não encontrado");
  const adapter = getAdapter(item.supplierCode);
  const prev = (item.supplierPayload ?? {}) as Record<string, unknown>;
  // Sem localizador (ex.: resposta perdida): procura pela nossa referência.
  if (!item.supplierBookingRef) {
    if (!adapter.findBooking || !prev.reference) throw new BookingIssueError("Este item ainda não tem reserva no fornecedor");
    const found = await adapter.findBooking({
      quoteRef: item.supplierQuoteRef,
      productId: item.productId,
      optionId: item.optionId,
      pax: item.pax,
      serviceDate: item.serviceDate,
      serviceEndDate: item.serviceEndDate,
      details: item.details,
      reference: String(prev.reference),
    });
    if (!found) return { itemId, status: item.supplierStatus ?? "", bookingRef: null, message: "Nenhuma reserva encontrada no fornecedor com esta referência" };
    await db.update(orderItems).set({ supplierStatus: found.status, supplierBookingRef: found.bookingRef, supplierPayload: { ...prev, ...found.payload, recoveredAt: new Date().toISOString() } }).where(eq(orderItems.id, itemId));
    await db.insert(orderEvents).values({ orderId: item.orderId, type: "BOOKING_RECOVERED", data: { itemId, bookingRef: found.bookingRef, status: found.status } });
    return { itemId, status: found.status, bookingRef: found.bookingRef, message: `Reserva encontrada no fornecedor (${found.bookingRef})` };
  }
  if (!adapter.bookingStatus) throw new BookingIssueError("Este fornecedor não informa status");
  const r = await adapter.bookingStatus(item.supplierBookingRef, prev);
  const next: Record<string, unknown> = { ...prev, ...r.payload, checkedAt: new Date().toISOString() };
  if (r.status === "CONFIRMED" && adapter.voucher && !(prev.voucher as { voucherUrl?: string } | undefined)?.voucherUrl) {
    const voucher = await adapter.voucher(item.supplierBookingRef, next).catch(() => null);
    if (voucher) next.voucher = voucher;
  }
  await db.update(orderItems).set({ supplierStatus: r.status, supplierPayload: next }).where(eq(orderItems.id, itemId));
  if (r.status !== item.supplierStatus) await db.insert(orderEvents).values({ orderId: item.orderId, type: "BOOKING_STATUS_CHANGED", data: { itemId, from: item.supplierStatus, to: r.status } });
  return { itemId, status: r.status, bookingRef: item.supplierBookingRef, message: `Status no fornecedor: ${BOOKING_STATUS_LABEL[r.status] ?? r.status}` };
}

/** Depois do pagamento: emite automaticamente os itens pendentes (se habilitado). Nunca lança. */
export async function autoIssueOrder(orderId: string, db?: DB): Promise<void> {
  if (!autoIssueEnabled()) return;
  try {
    db ??= getDb();
    const [order] = await db.select({ status: orders.status, paymentData: orders.paymentData }).from(orders).where(eq(orders.id, orderId));
    if (order?.status !== "PAID" || isSimulatedPayment(order.paymentData)) return;
    const items = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), inArray(orderItems.supplierStatus, [BOOKING_STATUS.AWAITING_ISSUE])));
    for (const it of items) await issueItemBooking(it.id, { type: "SYSTEM", name: "Emissão automática" }, db).catch(() => null);
  } catch {
    /* a equipe ainda pode emitir pelo painel */
  }
}

/**
 * Cancela a reserva no fornecedor. Com `simulate`, só consulta a multa (Hotelbeds); a GGT não
 * simula — a multa segue a política gravada na cotação. O estorno ao cliente é feito pelo financeiro.
 */
export async function cancelItemBooking(
  itemId: string,
  actor: { id?: string | null; name?: string | null },
  opts: { simulate: boolean },
  db: DB = getDb(),
): Promise<{ status: string; message: string; penalty: { amount: string; currency: string } | null }> {
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
  if (!item) throw new BookingIssueError("Item não encontrado");
  if (!item.supplierBookingRef) throw new BookingIssueError("Este item não tem reserva no fornecedor");
  if (item.supplierStatus === BOOKING_STATUS.CANCELLED) throw new BookingIssueError("A reserva já está cancelada");
  const adapter = getAdapter(item.supplierCode);
  if (!adapter.cancelBooking) throw new BookingIssueError("Este fornecedor não permite cancelar pelo sistema");
  const r = await adapter.cancelBooking(item.supplierBookingRef, { ...opts, stored: (item.supplierPayload ?? {}) as Record<string, unknown> });
  const money = r.penalty ? `${r.penalty.currency} ${Number(r.penalty.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null;
  if (opts.simulate) {
    return { status: "SIMULATED", penalty: r.penalty, message: money ? `Se cancelar agora, a multa do fornecedor é de ${money}.` : "Sem multa informada pelo fornecedor para cancelar agora." };
  }
  const prev = (item.supplierPayload ?? {}) as Record<string, unknown>;
  const status = r.status === "CANCELLED" ? BOOKING_STATUS.CANCELLED : r.status;
  await db
    .update(orderItems)
    .set({ supplierStatus: status, supplierPayload: { ...prev, cancellation: { at: new Date().toISOString(), by: actor.name ?? null, penalty: r.penalty, reference: r.reference, ...r.payload } } })
    .where(eq(orderItems.id, itemId));
  await db.insert(orderEvents).values({ orderId: item.orderId, type: "BOOKING_CANCELLED", data: { itemId, status, penalty: r.penalty, reference: r.reference, by: actor.id ?? null, byName: actor.name ?? null } });
  return {
    status,
    penalty: r.penalty,
    message: status === BOOKING_STATUS.CANCELLED ? `Reserva cancelada no fornecedor${money ? ` (multa ${money})` : ""}. Faça o estorno ao cliente pelo financeiro.` : `Cancelamento solicitado ao fornecedor (${BOOKING_STATUS_LABEL[status] ?? status}).`,
  };
}

/** Itens pagos que precisam de ação da equipe (emitir / resolver falha / conferir). */
export async function bookingsNeedingAction(db: DB = getDb(), limit = 6) {
  const rows = await db
    .select({ itemId: orderItems.id, orderId: orders.id, number: orders.number, title: orderItems.title, status: orderItems.supplierStatus, serviceDate: orderItems.serviceDate })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.status, "PAID"),
        inArray(orderItems.supplierStatus, [BOOKING_STATUS.AWAITING_ISSUE, BOOKING_STATUS.BOOKING_FAILED, BOOKING_STATUS.ISSUE_UNKNOWN, BOOKING_STATUS.REJECTED]),
        // pedidos com pagamento simulado não pedem ação (não são emitidos)
        sql`coalesce(${orders.paymentData}->>'simulated', 'false') <> 'true'`,
      ),
    )
    .orderBy(asc(orderItems.serviceDate))
    .limit(100);
  return { total: rows.length, items: rows.slice(0, limit) };
}
