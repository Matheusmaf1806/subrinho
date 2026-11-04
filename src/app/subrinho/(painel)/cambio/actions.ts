"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { recordFxRate, refreshFxFromProvider } from "@/server/fx";
import { fxRate } from "@/lib/format";
import { actionError, FormError, oneOf, requiredDecimal, text } from "../../_lib/form";
import { PERMS } from "../../_lib/labels";

export async function recordManualFxAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.fx);
    const currency = oneOf(text(fd, "currency"), ["USD", "EUR"] as const, "Moeda");
    const rate = requiredDecimal(fd, "rate", "Cotação");
    const n = Number(rate);
    if (!(n > 0)) throw new FormError("A cotação precisa ser maior que zero");
    if (n > 100) throw new FormError("Cotação fora do esperado (acima de R$ 100), confira o valor");
    await recordFxRate(db, { currency, rate, source: "manual", createdBy: user.id });
    revalidatePath("/subrinho/cambio");
    revalidatePath("/subrinho");
    return { ok: true, message: `Cotação ${currency} → BRL registrada: R$ ${fxRate(rate)}. Novos preços já usam este valor.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function refreshFxAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  try {
    await requireSubrinhoUser(PERMS.fx);
    let r: { updated: number; provider: string };
    try {
      r = await db.transaction((tx) => refreshFxFromProvider(tx));
    } catch (e) {
      return {
        error: `Não foi possível consultar o provedor de câmbio (${e instanceof Error ? e.message : "erro desconhecido"}). As cotações atuais foram mantidas. Registre manualmente se necessário.`,
      };
    }
    if (r.provider === "manual")
      return {
        error:
          "Nenhum provedor de câmbio está configurado (FX_PROVIDER=manual). Registre a cotação manualmente ou configure FX_PROVIDER=poolvo (Dólar Poolvo) ou awesomeapi no servidor.",
      };
    revalidatePath("/subrinho/cambio");
    revalidatePath("/subrinho");
    return { ok: true, message: `Câmbio atualizado via ${r.provider}: ${r.updated} cotação(ões) registrada(s).` };
  } catch (e) {
    return actionError(e);
  }
}
