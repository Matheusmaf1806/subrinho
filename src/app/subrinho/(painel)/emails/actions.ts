"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { requeueEmail } from "@/server/email/outbox";
import { recordAudit } from "@/server/audit";
import { actionError, text } from "../../_lib/form";

export async function resendEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(["ADMIN", "SUPPORT"]);
    const id = text(fd, "id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "E-mail não encontrado" };
    const copy = await requeueEmail(db, id);
    if (!copy) return { error: "E-mail não encontrado" };
    await recordAudit(db, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, action: "email.resend", entity: "email", entityId: id, summary: "Reenviou um e-mail" });
    revalidatePath("/subrinho/emails");
    return { ok: true, message: "E-mail colocado na fila de novo" };
  } catch (e) {
    return actionError(e);
  }
}
