"use server";

import { audited } from "@/server/audit";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { setSupplierActive } from "@/server/subrinho/admin";
import { SUPPLIERS } from "@/server/suppliers/registry";
import { actionError, FormError, text } from "../../_lib/form";
import { syncHotelDestinations, testHotelIntegration } from "@/server/suppliers/hotels/admin";
import { PERMS } from "../../_lib/labels";

export async function toggleSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.suppliers);
    const code = text(fd, "code");
    if (!/^[A-Z0-9_]{2,40}$/.test(code)) throw new FormError("Fornecedor inválido");
    const active = text(fd, "active") === "1";
    await db.transaction((tx) => setSupplierActive(tx, code, active));
    revalidatePath("/subrinho/fornecedores");
    const name = SUPPLIERS.find((s) => s.code === code)?.name ?? code;
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "supplier.toggle", { ok: true, message: `${name} ${active ? "ativado" : "desativado"}` }, { entity: "supplier" });
  } catch (e) {
    return actionError(e);
  }
}

export async function testIntegrationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.suppliers);
    const code = text(fd, "code");
    const r = await testHotelIntegration(code);
    return r.ok ? { ok: true, message: `${r.message} (${r.ms} ms)` } : { error: r.message };
  } catch (e) {
    return actionError(e);
  }
}

export async function syncDestinationsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.suppliers);
    const code = text(fd, "code");
    const n = await syncHotelDestinations(code);
    revalidatePath("/subrinho/fornecedores");
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "supplier.sync", { ok: true, message: `${n.toLocaleString("pt-BR")} destinos atualizados` }, { entity: "supplier" });
  } catch (e) {
    return actionError(e);
  }
}
