"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { setSupplierActive } from "@/server/subrinho/admin";
import { SUPPLIERS } from "@/server/suppliers/registry";
import { actionError, FormError, text } from "../../_lib/form";
import { PERMS } from "../../_lib/labels";

export async function toggleSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.suppliers);
    const code = text(fd, "code");
    if (!/^[A-Z0-9_]{2,40}$/.test(code)) throw new FormError("Fornecedor inválido");
    const active = text(fd, "active") === "1";
    await db.transaction((tx) => setSupplierActive(tx, code, active));
    revalidatePath("/subrinho/fornecedores");
    const name = SUPPLIERS.find((s) => s.code === code)?.name ?? code;
    return { ok: true, message: `${name} ${active ? "ativado" : "desativado"}` };
  } catch (e) {
    return actionError(e);
  }
}
