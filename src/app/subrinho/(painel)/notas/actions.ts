"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { cancelInvoice, InvoiceError, readInvoiceFiles, registerOrderInvoice, registerPayoutInvoice } from "@/server/invoices";
import { actionError, text, uuid } from "../../_lib/form";
import { PERMS } from "../../_lib/labels";

async function input(fd: FormData) {
  const { pdf, xml } = await readInvoiceFiles(fd);
  return { number: text(fd, "number"), series: text(fd, "series"), issuedAt: text(fd, "issuedAt"), amount: text(fd, "amount"), url: text(fd, "url"), notes: text(fd, "notes"), pdf, xml };
}

export async function registerOrderInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const orderId = uuid(fd, "orderId", "Pedido");
    const inv = await registerOrderInvoice(db, orderId, await input(fd), { type: "SUBRINHO", id: user.id, name: user.name });
    revalidatePath(`/subrinho/pedidos/${orderId}`);
    revalidatePath("/subrinho/notas");
    return { ok: true, message: `Nota ${inv.number} registrada. O cliente recebe o aviso por e-mail.` };
  } catch (e) {
    if (e instanceof InvoiceError) return { error: e.message };
    return actionError(e);
  }
}

export async function registerPayoutInvoiceSubrinhoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.payouts);
    const payoutId = uuid(fd, "payoutId", "Repasse");
    const inv = await registerPayoutInvoice(db, payoutId, await input(fd), { type: "SUBRINHO", id: user.id, name: user.name });
    revalidatePath("/subrinho/notas");
    revalidatePath("/subrinho/repasses");
    return { ok: true, message: `Nota ${inv.number} da comissão registrada.` };
  } catch (e) {
    if (e instanceof InvoiceError) return { error: e.message };
    return actionError(e);
  }
}

export async function cancelInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.orders);
    const inv = await cancelInvoice(db, uuid(fd, "id", "Nota"), { type: "SUBRINHO", id: user.id, name: user.name });
    if (inv.orderId) revalidatePath(`/subrinho/pedidos/${inv.orderId}`);
    revalidatePath("/subrinho/notas");
    return { ok: true, message: `Nota ${inv.number} marcada como cancelada.` };
  } catch (e) {
    if (e instanceof InvoiceError) return { error: e.message };
    return actionError(e);
  }
}
