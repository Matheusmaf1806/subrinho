"use server";

import { audited } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { revalidateStore } from "@/server/store-links";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { updateAffiliate } from "@/server/admin/affiliates";
import { parseStoreLegal, StoreLegalError, updateStoreLegal } from "@/server/admin/store-legal";
import { requireAdminForAction, serviceErrorMessage, str } from "../../_lib/helpers";

const optional = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

const StoreSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja.").max(80, "Nome muito longo (máx. 80)."),
  email: z.union([z.literal(""), z.email("E-mail de contato inválido.")]),
  phone: optional(30),
  whatsapp: optional(20),
  pixKey: optional(140),
  bankName: optional(80),
  bankAgency: optional(20),
  bankAccount: optional(30),
});

export async function updateStoreAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate } = g.session;

  const parsed = StoreSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    phone: str(fd, "phone"),
    whatsapp: str(fd, "whatsapp").replace(/\D/g, ""),
    pixKey: str(fd, "pixKey"),
    bankName: str(fd, "bankName"),
    bankAgency: str(fd, "bankAgency"),
    bankAccount: str(fd, "bankAccount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;

  try {
    await updateAffiliate(db, affiliate.id, {
      ...v,
      // Campos que só a Subrinho altera: mantidos como estão.
      slug: affiliate.slug,
      legalName: affiliate.legalName,
      document: affiliate.document,
      active: affiliate.active,
    });
  } catch (e) {
    return { error: serviceErrorMessage(e, "Não foi possível salvar os dados da loja.") };
  }
  revalidatePath("/afiliado", "layout");
  revalidateStore(affiliate, "", "layout");
  return audited(db, { type: "AFFILIATE", id: g.session.user.id, name: g.session.user.name }, "store.update", { ok: true, message: "Dados da loja salvos." }, { affiliateId: g.session.affiliate.id });
}

export async function updateStoreLegalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await requireAdminForAction();
  if ("error" in g) return g;
  const { affiliate, user } = g.session;
  try {
    const after = await updateStoreLegal(db, affiliate.id, parseStoreLegal(fd), { type: "AFFILIATE", id: user.id, name: user.name });
    revalidatePath("/afiliado/loja");
    revalidateStore(after, "", "layout");
    return { ok: true, message: "Dados salvos. O rodapé e as páginas legais da loja já foram atualizados." };
  } catch (e) {
    if (e instanceof StoreLegalError) return { error: e.message };
    return { error: serviceErrorMessage(e, "Não foi possível salvar.") };
  }
}
