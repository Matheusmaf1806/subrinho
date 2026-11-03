/**
 * Fechamento de quinzena, repasses aos afiliados e comprovantes.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import {
  affiliates,
  files,
  fortnightReports,
  holidays,
  orderItems,
  orders,
  payoutProofs,
  payouts,
} from "@/server/db/schema";
import { addDays, startOfLocalDay } from "@/lib/tz";
import { d, money, sum } from "@/server/pricing/money";
import { getSettings } from "@/server/settings";
import { BusinessCalendar, payoutDateForFortnight, payoutDateForSale, type Fortnight } from "./calendar";
import { CATEGORY_LABEL } from "@/server/suppliers/types";

export async function loadCalendar(tx: Tx): Promise<BusinessCalendar> {
  const rows = await tx.select({ date: holidays.date }).from(holidays);
  return new BusinessCalendar({ extra: rows.map((r) => r.date) });
}

export async function payoutDateFor(tx: Tx, paidAt: Date): Promise<string> {
  const [cal, s] = await Promise.all([loadCalendar(tx), getSettings(tx)]);
  return payoutDateForSale(paidAt, cal, s.payoutBusinessDays);
}

export async function payoutDateForPeriod(tx: Tx, f: Fortnight): Promise<string> {
  const [cal, s] = await Promise.all([loadCalendar(tx), getSettings(tx)]);
  return payoutDateForFortnight(f, cal, s.payoutBusinessDays);
}

function periodRange(f: Fortnight) {
  return { from: startOfLocalDay(f.start), to: startOfLocalDay(addDays(f.end, 1)) };
}

async function paidOrdersIn(tx: Tx, f: Fortnight, affiliateId?: string) {
  const { from, to } = periodRange(f);
  const conds = [eq(orders.status, "PAID"), gte(orders.paidAt, from), lt(orders.paidAt, to)];
  if (affiliateId) conds.push(eq(orders.affiliateId, affiliateId));
  return tx.select().from(orders).where(and(...conds)).orderBy(asc(orders.paidAt));
}

export type FortnightSummary = {
  period: Fortnight;
  payoutDate: string;
  totals: {
    orders: number;
    items: number;
    amountCharged: string;
    totalPix: string;
    costBrl: string;
    subrinhoRevenue: string;
    affiliateCommission: string;
    subrinhoDiscount: string;
    affiliateDiscount: string;
    installmentFees: string;
  };
  byAffiliate: { affiliateId: string; name: string; orders: number; amountCharged: string; commission: string }[];
  byCategory: { category: string; label: string; items: number; finalPix: string; subrinhoRevenue: string; affiliateCommission: string }[];
  bySupplier: { supplierCode: string; items: number; costBrl: string }[];
};

/**
 * Fecha a quinzena: consolida as vendas pagas no período, gera o relatório e agenda o repasse
 * de cada afiliado. Idempotente: pode ser executado de novo (atualiza repasses ainda não pagos).
 */
export async function closeFortnight(tx: Tx, f: Fortnight, by: { type: "CRON" | "SUBRINHO"; id?: string | null }) {
  const payoutDate = await payoutDateForPeriod(tx, f);
  const list = await paidOrdersIn(tx, f);
  const orderIds = list.map((o) => o.id);
  const items = orderIds.length ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
  const affRows = await tx.select({ id: affiliates.id, name: affiliates.name }).from(affiliates);
  const affName = new Map(affRows.map((a) => [a.id, a.name]));

  const byAff = new Map<string, typeof list>();
  for (const o of list) byAff.set(o.affiliateId, [...(byAff.get(o.affiliateId) ?? []), o]);

  const byCat = new Map<string, typeof items>();
  const bySup = new Map<string, typeof items>();
  for (const it of items) {
    byCat.set(it.category, [...(byCat.get(it.category) ?? []), it]);
    bySup.set(it.supplierCode, [...(bySup.get(it.supplierCode) ?? []), it]);
  }

  const summary: FortnightSummary = {
    period: f,
    payoutDate,
    totals: {
      orders: list.length,
      items: items.length,
      amountCharged: money(sum(list.map((o) => o.amountCharged))),
      totalPix: money(sum(list.map((o) => o.totalPix))),
      costBrl: money(sum(list.map((o) => o.totalCostBrl))),
      subrinhoRevenue: money(sum(list.map((o) => o.subrinhoRevenue))),
      affiliateCommission: money(sum(list.map((o) => o.affiliateCommission))),
      subrinhoDiscount: money(sum(list.map((o) => o.totalSubrinhoDiscount))),
      affiliateDiscount: money(sum(list.map((o) => o.totalAffiliateDiscount))),
      installmentFees: money(sum(list.map((o) => d(o.amountCharged).minus(d(o.totalPix))))),
    },
    byAffiliate: [...byAff.entries()].map(([affiliateId, os]) => ({
      affiliateId,
      name: affName.get(affiliateId) ?? affiliateId,
      orders: os.length,
      amountCharged: money(sum(os.map((o) => o.amountCharged))),
      commission: money(sum(os.map((o) => o.affiliateCommission))),
    })),
    byCategory: [...byCat.entries()].map(([category, its]) => ({
      category,
      label: CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? category,
      items: its.length,
      finalPix: money(sum(its.map((i) => i.finalPix))),
      subrinhoRevenue: money(sum(its.map((i) => i.subrinhoRevenue))),
      affiliateCommission: money(sum(its.map((i) => i.affiliateCommission))),
    })),
    bySupplier: [...bySup.entries()].map(([supplierCode, its]) => ({
      supplierCode,
      items: its.length,
      costBrl: money(sum(its.map((i) => i.costBrl))),
    })),
  };

  const [existing] = await tx.select().from(fortnightReports).where(eq(fortnightReports.periodStart, f.start));
  let reportId: string;
  if (existing) {
    reportId = existing.id;
    await tx
      .update(fortnightReports)
      .set({ summary: summary as never, payoutDate, generatedAt: new Date(), generatedByType: by.type, generatedById: by.id ?? null })
      .where(eq(fortnightReports.id, existing.id));
  } else {
    const [r] = await tx
      .insert(fortnightReports)
      .values({ periodStart: f.start, periodEnd: f.end, payoutDate, summary: summary as never, generatedByType: by.type, generatedById: by.id ?? null })
      .returning();
    reportId = r.id;
  }

  const created: (typeof payouts.$inferSelect)[] = [];
  for (const [affiliateId, os] of byAff) {
    const amount = money(sum(os.map((o) => o.affiliateCommission)));
    const gross = money(sum(os.map((o) => o.amountCharged)));
    const [cur] = await tx.select().from(payouts).where(and(eq(payouts.affiliateId, affiliateId), eq(payouts.periodStart, f.start)));
    let payout = cur;
    if (!cur) {
      [payout] = await tx
        .insert(payouts)
        .values({ affiliateId, reportId, periodStart: f.start, periodEnd: f.end, scheduledDate: payoutDate, ordersCount: os.length, grossSales: gross, amount })
        .returning();
    } else if (cur.status === "SCHEDULED") {
      [payout] = await tx
        .update(payouts)
        .set({ reportId, scheduledDate: payoutDate, ordersCount: os.length, grossSales: gross, amount })
        .where(eq(payouts.id, cur.id))
        .returning();
    }
    if (payout.status !== "PAID") {
      await tx.update(orders).set({ payoutId: payout.id }).where(inArray(orders.id, os.map((o) => o.id)));
    }
    created.push(payout);
  }
  return { reportId, summary, payouts: created };
}

// ───────────── Relatórios (CSV) ─────────────

const brNum = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : d(v).toFixed(2).replace(".", ","));
const brPct = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : d(v).toFixed(2).replace(".", ","));
const brDate = (v: Date | string | null | undefined) => {
  if (!v) return "";
  const s = typeof v === "string" ? v : v.toISOString();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

/** Relatório completo da quinzena (Painel Subrinho): toda a conta de cada item. */
export async function fortnightCsvForSubrinho(tx: Tx, f: Fortnight): Promise<string> {
  const list = await paidOrdersIn(tx, f);
  const ids = list.map((o) => o.id);
  const items = ids.length ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
  const affRows = await tx.select({ id: affiliates.id, name: affiliates.name }).from(affiliates);
  const affName = new Map(affRows.map((a) => [a.id, a.name]));
  const byId = new Map(list.map((o) => [o.id, o]));
  const header = [
    "Pedido", "Pago em", "Afiliado", "Cliente (conta)", "Pagador", "CPF/CNPJ pagador", "Item", "Opção", "Categoria", "Fornecedor",
    "Data do serviço", "Moeda", "Custo na moeda", "Câmbio", "Custo R$", "Margem Subrinho %", "Margem Subrinho R$", "NET Subrinho",
    "Margem Afiliado %", "Origem margem afiliado", "Margem Afiliado R$", "NET Afiliado", "Desconto Subrinho", "Desconto Afiliado",
    "Preço PIX", "Taxa parcelado %", "Preço parcelado", "Forma de pagamento", "Parcelas", "Valor cobrado", "Receita Subrinho",
    "Comissão Afiliado", "Margem Subrinho efetiva %", "Margem Afiliado efetiva %", "Data do repasse", "Reserva fornecedor",
  ];
  const rows = items.map((i) => {
    const o = byId.get(i.orderId)!;
    return [
      o.number, brDate(o.paidAt), affName.get(o.affiliateId), o.customerData.name, o.payerData.name, o.payerData.document,
      i.title, i.subtitle, CATEGORY_LABEL[i.category], i.supplierCode, brDate(i.serviceDate), i.costCurrency, brNum(i.costForeign),
      d(i.fxRate).toFixed(4).replace(".", ","), brNum(i.costBrl), brPct(i.subrinhoMarginPct), brNum(i.subrinhoMarginAmount),
      brNum(i.netSubrinho), brPct(i.affiliateMarginPct), i.affiliateMarginSource, brNum(i.affiliateMarginAmount), brNum(i.netAffiliate),
      brNum(i.subrinhoDiscount), brNum(i.affiliateDiscount), brNum(i.finalPix), brPct(i.installmentFeePct), brNum(i.finalInstallment),
      o.paymentMethod === "PIX" ? "PIX" : "Cartão", o.installments, brNum(i.chargedAmount), brNum(i.subrinhoRevenue),
      brNum(i.affiliateCommission), brPct(i.effectiveSubrinhoMarginPct), brPct(i.effectiveAffiliateMarginPct), brDate(o.payoutDate),
      i.supplierBookingRef,
    ];
  });
  return toCsv(header, rows);
}

/** Relatório da quinzena para o afiliado: sem custo, câmbio ou margem Subrinho. */
export async function fortnightCsvForAffiliate(tx: Tx, f: Fortnight, affiliateId: string): Promise<string> {
  const list = await paidOrdersIn(tx, f, affiliateId);
  const ids = list.map((o) => o.id);
  const items = ids.length ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
  const byId = new Map(list.map((o) => [o.id, o]));
  const header = [
    "Pedido", "Pago em", "Cliente (conta)", "Pagador", "Item", "Opção", "Categoria", "Data do serviço", "Forma de pagamento",
    "Valor pago", "Margem afiliado %", "Desconto do afiliado", "Comissão", "Data do repasse",
  ];
  const rows = items.map((i) => {
    const o = byId.get(i.orderId)!;
    return [
      o.number, brDate(o.paidAt), o.customerData.name, o.payerData.name, i.title, i.subtitle, CATEGORY_LABEL[i.category],
      brDate(i.serviceDate), o.paymentMethod === "PIX" ? "PIX" : `Cartão ${o.installments}x`, brNum(i.chargedAmount),
      brPct(i.effectiveAffiliateMarginPct), brNum(i.affiliateDiscount), brNum(i.affiliateCommission), brDate(o.payoutDate),
    ];
  });
  return toCsv(header, rows);
}

// ───────────── Repasses ─────────────

export async function markPayoutPaid(tx: Tx, payoutId: string, userId: string, notes?: string | null) {
  const [p] = await tx.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p) throw new Error("Repasse não encontrado");
  if (p.status === "PAID") return p;
  const [u] = await tx
    .update(payouts)
    .set({ status: "PAID", paidAt: new Date(), paidById: userId, notes: notes ?? p.notes })
    .where(eq(payouts.id, payoutId))
    .returning();
  return u;
}

export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
export const PROOF_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export async function attachPayoutProof(
  tx: Tx,
  payoutId: string,
  file: { filename: string; mimeType: string; data: Buffer },
  userId: string,
  note?: string | null,
) {
  if (!PROOF_MIME.includes(file.mimeType)) throw new Error("Envie PDF, PNG, JPG ou WEBP");
  if (file.data.length > MAX_PROOF_BYTES) throw new Error("Arquivo maior que 8 MB");
  const [p] = await tx.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p) throw new Error("Repasse não encontrado");
  const [f] = await tx
    .insert(files)
    .values({ filename: file.filename.slice(0, 200), mimeType: file.mimeType, size: file.data.length, data: file.data, uploadedByType: "SUBRINHO", uploadedById: userId })
    .returning({ id: files.id });
  await tx.insert(payoutProofs).values({ payoutId, fileId: f.id, uploadedById: userId, note: note ?? null });
  return f.id;
}

export async function listPayoutProofs(tx: Tx, payoutIds: string[]) {
  if (!payoutIds.length) return [];
  return tx
    .select({ id: payoutProofs.id, payoutId: payoutProofs.payoutId, fileId: files.id, filename: files.filename, size: files.size, createdAt: payoutProofs.createdAt, note: payoutProofs.note })
    .from(payoutProofs)
    .innerJoin(files, eq(files.id, payoutProofs.fileId))
    .where(inArray(payoutProofs.payoutId, payoutIds))
    .orderBy(desc(payoutProofs.createdAt));
}

/** Financeiro do afiliado: a receber (repasses agendados + vendas da quinzena aberta) e recebido. */
export async function affiliateFinancials(tx: Tx, affiliateId: string) {
  const all = await tx.select().from(payouts).where(eq(payouts.affiliateId, affiliateId)).orderBy(desc(payouts.periodStart));
  const scheduled = all.filter((p) => p.status === "SCHEDULED");
  const paid = all.filter((p) => p.status === "PAID");
  const open = await tx
    .select({
      payoutDate: orders.payoutDate,
      orders: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${orders.affiliateCommission}), 0)::text`,
      gross: sql<string>`coalesce(sum(${orders.amountCharged}), 0)::text`,
    })
    .from(orders)
    .where(and(eq(orders.affiliateId, affiliateId), eq(orders.status, "PAID"), isNull(orders.payoutId)))
    .groupBy(orders.payoutDate)
    .orderBy(asc(orders.payoutDate));
  const proofs = await listPayoutProofs(tx, paid.map((p) => p.id));
  const toReceive = sum([...scheduled.map((p) => p.amount), ...open.map((o) => o.amount)]);
  const received = sum(paid.map((p) => p.amount));
  return { scheduled, paid, open, proofs, toReceive, received };
}
