/** Configurações do Painel Subrinho: usuários da equipe, feriados extras e fornecedores. */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { holidays, orderItems, orders, subrinhoUsers, suppliers } from "@/server/db/schema";
import { SUPPLIERS } from "@/server/suppliers/registry";

export class SubrinhoAdminError extends Error {}

// ───────────── Usuários da equipe ─────────────

export async function listSubrinhoUsers(tx: Tx) {
  return tx
    .select({
      id: subrinhoUsers.id,
      name: subrinhoUsers.name,
      email: subrinhoUsers.email,
      role: subrinhoUsers.role,
      active: subrinhoUsers.active,
      createdAt: subrinhoUsers.createdAt,
    })
    .from(subrinhoUsers)
    .orderBy(asc(subrinhoUsers.name));
}

export async function setSubrinhoUserActive(tx: Tx, id: string, active: boolean, actor: { id: string; role: string }) {
  const [u] = await tx.select().from(subrinhoUsers).where(eq(subrinhoUsers.id, id));
  if (!u) throw new SubrinhoAdminError("Usuário não encontrado");
  if (u.id === actor.id && !active) throw new SubrinhoAdminError("Você não pode desativar o seu próprio acesso");
  if (u.role === "OWNER" && actor.role !== "OWNER") throw new SubrinhoAdminError("Somente um Proprietário pode alterar outro Proprietário");
  if (u.role === "OWNER" && !active) {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(subrinhoUsers)
      .where(sql`${subrinhoUsers.role} = 'OWNER' and ${subrinhoUsers.active} = true and ${subrinhoUsers.id} <> ${id}`);
    if (!r?.n) throw new SubrinhoAdminError("É preciso manter ao menos um Proprietário ativo");
  }
  await tx.update(subrinhoUsers).set({ active }).where(eq(subrinhoUsers.id, id));
  if (!active) await tx.execute(sql`delete from sessions where user_type = 'SUBRINHO' and user_id = ${id}::uuid`);
}

// ───────────── Feriados extras ─────────────

export async function listExtraHolidays(tx: Tx) {
  return tx.select().from(holidays).orderBy(asc(holidays.date));
}

export async function upsertHoliday(tx: Tx, date: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SubrinhoAdminError("Data inválida");
  const n = name.trim();
  if (n.length < 2) throw new SubrinhoAdminError("Informe o nome do feriado");
  await tx.insert(holidays).values({ date, name: n }).onConflictDoUpdate({ target: holidays.date, set: { name: n } });
}

export async function deleteHoliday(tx: Tx, date: string) {
  await tx.delete(holidays).where(eq(holidays.date, date));
}

// ───────────── Fornecedores ─────────────

/**
 * Variáveis de ambiente (credenciais) de cada integração — ver .env.example.
 * "A|B" = aceita qualquer um dos nomes (o primeiro é o recomendado).
 */
export const SUPPLIER_ENV: Record<string, string[]> = {
  TU_EXPERIENZA: ["TUEXPERIENCIA_DISTRIBUTOR_ID", "TUEXPERIENCIA_USERNAME", "TUEXPERIENCIA_PASSWORD"],
  NADIO: ["NADIO_API_KEY"],
  GGT_BEST_BUY: ["GGT_API_BASE_URL", "GGT_AGENCY_ID", "GGT_USER", "GGT_PASSWORD", "GGT_ENVIRONMENT"],
  RATEHAWK: ["RATEHAWK_KEY_ID", "RATEHAWK_API_KEY"],
  HOTELBEDS: [
    "HB_HOTEIS_API_KEY|HOTELBEDS_API_KEY|API_KEY_HH",
    "HB_HOTEIS_SECRET|HOTELBEDS_SECRET|SECRET_KEY_HH",
    "HB_HOTEIS_CLIENT_CRT",
    "HB_HOTEIS_CLIENT_KEY",
    "HB_HOTEIS_CA_CHAIN",
    "HOTELBEDS_ENVIRONMENT|HB_HOTEIS_ENVIRONMENT",
  ],
  MASTER_VACATION_HOME: ["MASTER_VACATION_HOME_API_KEY"],
  MAPRO: ["MAPRO_API_TOKEN|MAPRO_API_KEY"],
  INTERMAC: ["INTERMAC_API_KEY"],
  HERO: ["HERO_API_KEY"],
  ESIMX: ["ESIMX_API_KEY"],
};

/** Fornecedores: metadados do registro + estado no banco + volume vendido. Nunca expõe valores de credenciais. */
export async function listSuppliersForSubrinho(tx: Tx) {
  const [rows, sold] = await Promise.all([
    tx.select().from(suppliers),
    tx
      .select({
        code: orderItems.supplierCode,
        items: sql<number>`count(*)::int`,
        costBrl: sql<string>`coalesce(sum(${orderItems.costBrl}), 0)::text`,
      })
      .from(orderItems)
      .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.status, "PAID")))
      .groupBy(orderItems.supplierCode),
  ]);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const soldBy = new Map(sold.map((s) => [s.code, s]));
  const codes = [...new Set([...SUPPLIERS.map((s) => s.code), ...rows.map((r) => r.code)])];
  return codes.map((code) => {
    const meta = SUPPLIERS.find((s) => s.code === code);
    const row = byCode.get(code);
    const env = SUPPLIER_ENV[code] ?? [];
    return {
      code,
      name: row?.name ?? meta?.name ?? code,
      category: row?.category ?? meta?.category ?? null,
      currency: row?.defaultCurrency ?? meta?.defaultCurrency ?? null,
      notes: row?.notes ?? meta?.notes ?? null,
      registered: !!row,
      active: row?.active ?? false,
      env: env.map((spec) => {
        const names = spec.split("|");
        return { name: names[0], configured: names.some((n) => !!process.env[n]?.trim()) };
      }),
      itemsSold: soldBy.get(code)?.items ?? 0,
      costBrl: soldBy.get(code)?.costBrl ?? "0",
    };
  });
}

export async function setSupplierActive(tx: Tx, code: string, active: boolean) {
  const [row] = await tx.select().from(suppliers).where(eq(suppliers.code, code));
  if (row) {
    await tx.update(suppliers).set({ active }).where(eq(suppliers.code, code));
    return;
  }
  const meta = SUPPLIERS.find((s) => s.code === code);
  if (!meta) throw new SubrinhoAdminError("Fornecedor desconhecido");
  const { ref: _ref, ...fields } = meta;
  await tx.insert(suppliers).values({ ...fields, active });
}
