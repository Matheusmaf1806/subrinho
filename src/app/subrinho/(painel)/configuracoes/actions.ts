"use server";

import { audited } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { createSubrinhoUser } from "@/server/admin/affiliates";
import { getCompanyInfo, getSettings, updateCompanyInfo, updateSettings, type PlatformSettings } from "@/server/settings";
import { changes, recordAudit } from "@/server/audit";
import { deleteHoliday, setSubrinhoUserActive, upsertHoliday } from "@/server/subrinho/admin";
import { d } from "@/server/pricing/money";
import { date } from "@/lib/format";
import { actionError, FormError, optInt, requiredDecimal, text, uuid } from "../../_lib/form";
import { isIsoDate } from "../../_lib/dates";
import { PERMS, ROLE_LABEL, type SubrinhoRole } from "../../_lib/labels";

function percent(fd: FormData, key: string, label: string): string {
  const n = d(requiredDecimal(fd, key, label));
  if (n.lt(0)) throw new FormError(`${label} não pode ser negativa`);
  if (n.gte(100)) throw new FormError(`${label} precisa ser menor que 100%`);
  return n.toDecimalPlaces(4).toString();
}

function int(fd: FormData, key: string, label: string, min: number, max: number): number {
  const v = optInt(fd, key, label, { min, max });
  if (v === null) throw new FormError(`Informe ${label.toLowerCase()}`);
  return v;
}

export async function updateSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.settings);
    const patch: PlatformSettings = {
      installmentFeePct: percent(fd, "installmentFeePct", "Taxa do parcelado"),
      maxInstallments: int(fd, "maxInstallments", "Nº máximo de parcelas", 1, 24),
      fallbackSubrinhoMarginPct: percent(fd, "fallbackSubrinhoMarginPct", "Margem Subrinho padrão do sistema"),
      fallbackAffiliateMarginPct: percent(fd, "fallbackAffiliateMarginPct", "Margem do afiliado padrão"),
      maxAffiliateMarginPct: percent(fd, "maxAffiliateMarginPct", "Margem máxima do afiliado"),
      payoutBusinessDays: int(fd, "payoutBusinessDays", "Dias úteis para o repasse", 1, 30),
      pixExpirationMinutes: int(fd, "pixExpirationMinutes", "Validade do Pix", 5, 1440),
    };
    if (d(patch.fallbackAffiliateMarginPct).gt(d(patch.maxAffiliateMarginPct)))
      throw new FormError("A margem padrão do afiliado não pode ser maior que a margem máxima do afiliado");
    const before = await getSettings(db);
    await db.transaction(async (tx) => {
      await updateSettings(tx, patch);
      const diff = changes(before, patch);
      if (Object.keys(diff).length)
        await recordAudit(tx, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, action: "settings.update", entity: "settings", summary: `Alterou parâmetros da plataforma: ${Object.keys(diff).join(", ")}`, data: diff });
    });
    revalidatePath("/subrinho", "layout");
    return { ok: true, message: "Configurações salvas. Novos preços e carrinhos já usam os novos valores." };
  } catch (e) {
    return actionError(e);
  }
}

export async function addHolidayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.settings);
    const day = text(fd, "date");
    if (!isIsoDate(day)) throw new FormError("Data inválida");
    const name = text(fd, "name").slice(0, 120);
    await db.transaction((tx) => upsertHoliday(tx, day, name));
    revalidatePath("/subrinho/configuracoes");
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "holiday.add", { ok: true, message: `Feriado ${date(day)} salvo. Datas de repasse calculadas daqui em diante consideram este dia.` }, { entity: "holiday", entityId: day });
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteHolidayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.settings);
    const day = text(fd, "date");
    if (!isIsoDate(day)) throw new FormError("Data inválida");
    await db.transaction((tx) => deleteHoliday(tx, day));
    revalidatePath("/subrinho/configuracoes");
    return audited(db, { type: "SUBRINHO", id: user.id, name: user.name }, "holiday.delete", { ok: true, message: "Feriado removido" }, { entity: "holiday" });
  } catch (e) {
    return actionError(e);
  }
}

const ROLES = ["OWNER", "ADMIN", "FINANCE", "SUPPORT"] as const;
const NewUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z.email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(200),
  role: z.enum(ROLES, { error: "Perfil inválido" }),
});

export async function createSubrinhoUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await requireSubrinhoUser(PERMS.settings);
    const parsed = NewUserSchema.safeParse({
      name: text(fd, "name"),
      email: text(fd, "email").toLowerCase(),
      password: String(fd.get("password") ?? ""),
      role: text(fd, "role"),
    });
    if (!parsed.success) throw new FormError(parsed.error.issues[0]?.message ?? "Dados inválidos");
    if (parsed.data.role === "OWNER" && actor.role !== "OWNER") throw new FormError("Somente um Proprietário pode criar outro Proprietário");
    const u = await db.transaction((tx) => createSubrinhoUser(tx, parsed.data));
    revalidatePath("/subrinho/configuracoes");
    return audited(db, { type: "SUBRINHO", id: actor.id, name: actor.name }, "subrinho_user.create", { ok: true, message: `${u.name} agora tem acesso ao Painel Subrinho como ${ROLE_LABEL[u.role as SubrinhoRole]}.` }, { entity: "subrinho_user", entityId: u.id });
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleSubrinhoUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await requireSubrinhoUser(PERMS.settings);
    const id = uuid(fd, "id", "Usuário");
    const active = text(fd, "active") === "1";
    await db.transaction((tx) => setSubrinhoUserActive(tx, id, active, { id: actor.id, role: actor.role }));
    revalidatePath("/subrinho/configuracoes");
    return audited(db, { type: "SUBRINHO", id: actor.id, name: actor.name }, "subrinho_user.toggle", { ok: true, message: active ? "Acesso reativado" : "Acesso desativado" }, { entity: "subrinho_user" });
  } catch (e) {
    return actionError(e);
  }
}

export async function updateCompanyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.settings);
    const info = {
      legalName: text(fd, "legalName").slice(0, 160),
      document: text(fd, "document").slice(0, 30),
      address: text(fd, "address").slice(0, 300),
      privacyEmail: text(fd, "privacyEmail").toLowerCase().slice(0, 160),
    };
    if (info.privacyEmail && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(info.privacyEmail)) throw new FormError("E-mail de privacidade inválido");
    const before = await getCompanyInfo(db);
    await db.transaction(async (tx) => {
      await updateCompanyInfo(tx, info);
      await recordAudit(tx, { actor: { type: "SUBRINHO", id: user.id, name: user.name }, action: "settings.company", entity: "settings", summary: "Alterou os dados da empresa (páginas legais)", data: changes(before, info) });
    });
    return { ok: true, message: "Dados da empresa salvos. As páginas legais das lojas já mostram os novos dados." };
  } catch (e) {
    return actionError(e);
  }
}
