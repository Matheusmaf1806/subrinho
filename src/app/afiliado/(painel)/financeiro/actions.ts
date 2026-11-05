"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { InvoiceError, readInvoiceFiles, registerPayoutInvoice } from "@/server/invoices";
import { isUuid, requireAdminForAction, serviceErrorMessage, str } from "../../_lib/helpers";

/** A agência envia a nota fiscal da comissão de um repasse. */
export async function sendPayoutInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const payoutId = str(fd, "payoutId");
  if (!isUuid(payoutId)) return { error: "Repasse não encontrado." };
  try {
    const { pdf, xml } = await readInvoiceFiles(fd);
    const { user, affiliate } = g.session;
    const inv = await registerPayoutInvoice(
      db,
      payoutId,
      { number: str(fd, "number"), series: str(fd, "series"), issuedAt: str(fd, "issuedAt"), amount: str(fd, "amount"), url: str(fd, "url"), notes: str(fd, "notes"), pdf, xml },
      { type: "AFFILIATE", id: user.id, name: user.name, affiliateId: affiliate.id },
    );
    revalidatePath("/afiliado/financeiro");
    return { ok: true, message: `Nota ${inv.number} enviada. A equipe Subrinho já consegue ver.` };
  } catch (e) {
    if (e instanceof InvoiceError) return { error: e.message };
    return { error: serviceErrorMessage(e, "Não foi possível enviar a nota.") };
  }
}
