"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { BrandingError, brandingFromForm, updateBranding } from "@/server/admin/branding";
import { requireAdminForAction } from "../../_lib/helpers";

/** Identidade (white-label) da loja — somente ADMIN da agência. "Tecnologia Subrinho" é definido pela Subrinho. */
export async function updateBrandingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate, user } = g.session;
  try {
    await db.transaction(async (tx) => {
      const input = await brandingFromForm(tx, fd, { type: "AFFILIATE", id: user.id }, { allowPoweredBy: false });
      await updateBranding(tx, affiliate.id, input);
    });
  } catch (e) {
    if (e instanceof BrandingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/afiliado", "layout");
  revalidatePath(`/loja/${affiliate.slug}`, "layout");
  return { ok: true, message: "Identidade da loja salva. Abra a loja para conferir." };
}
