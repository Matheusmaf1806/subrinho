"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { fortnightOf, lastClosedFortnight } from "@/server/payouts/calendar";
import { closeFortnight } from "@/server/payouts/service";
import { addDays, todayLocal } from "@/lib/tz";
import { date } from "@/lib/format";
import { actionError, FormError, text } from "../../_lib/form";
import { isIsoDate, periodLabel } from "../../_lib/dates";
import { PERMS } from "../../_lib/labels";

/**
 * Fecha (ou regera) a quinzena que contém a data informada. Sem data: última quinzena encerrada.
 * Idempotente — rodar de novo atualiza o relatório e os repasses ainda não pagos.
 */
export async function closeFortnightAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.reports);
    const raw = text(fd, "date");
    const today = todayLocal();
    if (raw && !isIsoDate(raw)) throw new FormError("Data inválida");
    const period = raw ? fortnightOf(raw) : lastClosedFortnight(today);
    if (period.end >= today) throw new FormError(`A quinzena ${periodLabel(period.start, period.end)} ainda não terminou — só é possível fechá-la a partir de ${date(addDays(period.end, 1))}.`);

    const r = await db.transaction((tx) => closeFortnight(tx, period, { type: "SUBRINHO", id: user.id }));
    revalidatePath("/subrinho", "layout");
    return {
      ok: true,
      message: `Quinzena ${periodLabel(period.start, period.end)} fechada: ${r.summary.totals.orders} pedido(s), ${r.payouts.length} repasse(s) com pagamento previsto para ${date(r.summary.payoutDate)}.`,
    };
  } catch (e) {
    return actionError(e);
  }
}
