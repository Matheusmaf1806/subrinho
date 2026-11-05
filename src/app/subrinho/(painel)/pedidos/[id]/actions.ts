"use server";

import { audited, recordAudit } from "@/server/audit";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { cancelPendingOrder, confirmPaymentManually } from "@/server/subrinho/orders";
import { autoIssueOrder, cancelItemBooking, issueItemBooking, refreshItemBooking, registerManualBooking } from "@/server/bookings/service";
import { after } from "next/server";
import { date, orderNumber } from "@/lib/format";
import { actionError, optText, uuid } from "../../../_lib/form";
import { PERMS } from "../../../_lib/labels";

function revalidateOrder(id: string) {
  revalidatePath(`/subrinho/pedidos/${id}`);
  revalidatePath("/subrinho/pedidos");
  revalidatePath("/subrinho");
}

export async function confirmPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const orderId = uuid(fd, "orderId", "Pedido");
    const note = optText(fd, "note")?.slice(0, 500) ?? null;
    const paid = await db.transaction((tx) => confirmPaymentManually(tx, orderId, { id: user.id, name: user.name }, note));
    after(() => autoIssueOrder(orderId));
    revalidateOrder(orderId);
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "order.manual_payment", { ok: true, message: `Pagamento do pedido ${orderNumber(paid.number)} confirmado. Repasse previsto para ${date(paid.payoutDate)}.` }, { affiliateId: paid.affiliateId, entity: "order", entityId: paid.id });
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const orderId = uuid(fd, "orderId", "Pedido");
    const reason = optText(fd, "reason")?.slice(0, 500) ?? null;
    await db.transaction((tx) => cancelPendingOrder(tx, orderId, { id: user.id, name: user.name }, reason));
    revalidateOrder(orderId);
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "order.cancel", { ok: true, message: "Pedido cancelado." }, { entity: "order" });
  } catch (e) {
    return actionError(e);
  }
}

export async function issueBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const itemId = uuid(fd, "itemId", "Item");
    const orderId = uuid(fd, "orderId", "Pedido");
    const r = await issueItemBooking(itemId, { type: "SUBRINHO", id: user.id, name: user.name });
    revalidateOrder(orderId);
    await recordAudit(db, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, action: "booking.issue", entity: "order_item", entityId: itemId, summary: `Emissão: ${r.message}`, data: { orderId, status: r.status } });
    return r.status === "CONFIRMED" || r.status === "PENDING" ? { ok: true, message: r.message } : { error: r.message };
  } catch (e) {
    return actionError(e);
  }
}

export async function registerManualBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const itemId = uuid(fd, "itemId", "Item");
    const orderId = uuid(fd, "orderId", "Pedido");
    const r = await registerManualBooking(itemId, { id: user.id, name: user.name }, {
      bookingRef: optText(fd, "bookingRef") ?? "",
      bookedCost: optText(fd, "bookedCost"),
      note: optText(fd, "note"),
    });
    revalidateOrder(orderId);
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "booking.manual", { ok: true, message: r.message }, { entity: "order_item", entityId: r.itemId });
  } catch (e) {
    return actionError(e);
  }
}

export async function refreshBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.orders);
    const itemId = uuid(fd, "itemId", "Item");
    const orderId = uuid(fd, "orderId", "Pedido");
    const r = await refreshItemBooking(itemId);
    revalidateOrder(orderId);
    return { ok: true, message: r.message };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelBookingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const itemId = uuid(fd, "itemId", "Item");
    const orderId = uuid(fd, "orderId", "Pedido");
    const simulate = fd.get("simulate") === "1";
    const r = await cancelItemBooking(itemId, { id: user.id, name: user.name }, { simulate });
    if (!simulate) revalidateOrder(orderId);
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "booking.cancel", { ok: true, message: r.message }, { entity: "order_item" });
  } catch (e) {
    return actionError(e);
  }
}
