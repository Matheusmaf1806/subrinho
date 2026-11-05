/**
 * Notas fiscais registradas na plataforma (a emissão em si é feita no emissor da prefeitura ou no
 * sistema fiscal da empresa; aqui ficam o número, o valor e os arquivos PDF/XML):
 *  - ORDER: nota do pedido para o cliente. Registrada pela equipe Subrinho (ou pela agência, se ela
 *    for a emissora). O cliente baixa na página do pedido e recebe o aviso por e-mail.
 *  - PAYOUT: nota da agência para a Subrinho pela comissão do repasse. A agência envia no Painel do
 *    Afiliado › Financeiro; a equipe confere em Repasses e em Notas fiscais.
 */
import { and, desc, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import type { DB, Tx } from "@/server/db";
import { affiliates, files, invoices, orders, payouts } from "@/server/db/schema";
import { recordAudit, type AuditActor } from "@/server/audit";
import { brl, orderNumber } from "@/lib/format";
import { renderEmail } from "@/server/email/render";
import { orderLink, storeBrand } from "@/server/email/notify";
import { isEmail, queueEmail } from "@/server/email/outbox";

export class InvoiceError extends Error {}

export const INVOICE_MAX_BYTES = 8 * 1024 * 1024;
const PDF = ["application/pdf"];
const XML = ["application/xml", "text/xml"];

export type InvoiceUpload = { filename: string; mimeType: string; data: Buffer };

/** Lê os arquivos "pdf" e "xml" do formulário (opcionais, até 8 MB cada). */
export async function readInvoiceFiles(fd: FormData): Promise<{ pdf: InvoiceUpload | null; xml: InvoiceUpload | null }> {
  const one = async (field: string, allowed: string[], ext: string): Promise<InvoiceUpload | null> => {
    const f = fd.get(field);
    if (!f || typeof f !== "object" || !("arrayBuffer" in f) || (f as File).size === 0) return null;
    const file = f as File;
    const name = file.name.toLowerCase();
    const mimeType = allowed.includes(file.type) ? file.type : name.endsWith(`.${ext}`) ? allowed[0] : file.type;
    if (!allowed.includes(mimeType)) throw new InvoiceError(`${file.name}: envie um arquivo ${ext.toUpperCase()}`);
    if (file.size > INVOICE_MAX_BYTES) throw new InvoiceError(`${file.name}: arquivo maior que 8 MB`);
    return { filename: file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200) || `nota.${ext}`, mimeType, data: Buffer.from(await file.arrayBuffer()) };
  };
  return { pdf: await one("pdf", PDF, "pdf"), xml: await one("xml", XML, "xml") };
}

export type InvoiceInput = {
  number: string;
  series?: string | null;
  issuedAt: string;
  amount: string;
  url?: string | null;
  notes?: string | null;
  pdf?: InvoiceUpload | null;
  xml?: InvoiceUpload | null;
};

function validate(i: InvoiceInput) {
  const number = i.number.trim();
  if (!/^[\w./ -]{1,40}$/.test(number)) throw new InvoiceError("Informe o número da nota (até 40 caracteres)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.issuedAt)) throw new InvoiceError("Data de emissão inválida");
  const amount = i.amount.trim().replace(/\./g, (m, off: number, all: string) => (all.includes(",") ? "" : m)).replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) throw new InvoiceError("Valor da nota inválido (ex.: 1234,56)");
  const url = i.url?.trim() || null;
  if (url && !/^https:\/\/\S{4,500}$/.test(url)) throw new InvoiceError("O link da nota precisa começar com https://");
  if (!i.pdf && !url) throw new InvoiceError("Anexe o PDF da nota ou informe o link de consulta");
  return { number, series: i.series?.trim().slice(0, 10) || null, issuedAt: i.issuedAt, amount: Number(amount).toFixed(2), url, notes: i.notes?.trim().slice(0, 500) || null };
}

async function saveFile(tx: Tx, f: InvoiceUpload, actor: AuditActor) {
  const [row] = await tx
    .insert(files)
    .values({ filename: f.filename, mimeType: f.mimeType, size: f.data.length, data: f.data, uploadedByType: actor.type === "AFFILIATE" ? "AFFILIATE" : "SUBRINHO", uploadedById: actor.id ?? null })
    .returning({ id: files.id });
  return row.id;
}

/** Nota do pedido (para o cliente). Avisa o cliente por e-mail. */
export async function registerOrderInvoice(db: DB, orderId: string, input: InvoiceInput, actor: AuditActor, issuer: "SUBRINHO" | "AFFILIATE" = "SUBRINHO") {
  const v = validate(input);
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ order: orders, store: affiliates }).from(orders).innerJoin(affiliates, eq(affiliates.id, orders.affiliateId)).where(eq(orders.id, orderId));
    if (!row) throw new InvoiceError("Pedido não encontrado");
    if (row.order.status !== "PAID" && row.order.status !== "REFUNDED") throw new InvoiceError("Só dá para registrar nota de pedido pago");
    if (actor.type === "AFFILIATE" && row.order.affiliateId !== actor.affiliateId) throw new InvoiceError("Pedido não encontrado");
    const fileId = input.pdf ? await saveFile(tx, input.pdf, actor) : null;
    const xmlFileId = input.xml ? await saveFile(tx, input.xml, actor) : null;
    const [inv] = await tx
      .insert(invoices)
      .values({ kind: "ORDER", affiliateId: row.order.affiliateId, orderId, issuer, ...v, fileId, xmlFileId, createdByType: actor.type, createdById: actor.id ?? null })
      .returning();
    await recordAudit(tx, { actor, affiliateId: row.order.affiliateId, action: "invoice.order", entity: "order", entityId: orderId, summary: `Registrou a nota fiscal ${v.number} do pedido ${orderNumber(row.order.number)} (${brl(v.amount)})` });
    const to = row.order.customerData?.email ?? row.order.payerData?.email;
    if (isEmail(to)) {
      const content = {
        title: `Nota fiscal do pedido ${orderNumber(row.order.number)}`,
        paragraphs: [`A nota fiscal nº ${v.number} do seu pedido na ${row.store.name} já está disponível.`],
        rows: [
          { label: "Número", value: v.series ? `${v.number} (série ${v.series})` : v.number },
          { label: "Valor", value: brl(v.amount) },
        ],
        cta: { label: "Ver a nota no pedido", url: orderLink(row.store, orderId) },
      };
      const { html, text } = renderEmail(storeBrand(row.store), content);
      await queueEmail(tx, { kind: "invoice.order", to: to!, toName: row.order.customerData?.name, fromName: row.store.name, replyTo: row.store.email, subject: content.title, html, text, affiliateId: row.store.id, orderId, dedupeKey: `invoice:${inv.id}` });
    }
    return inv;
  });
}

/** Nota da agência pela comissão do repasse. */
export async function registerPayoutInvoice(db: DB, payoutId: string, input: InvoiceInput, actor: AuditActor) {
  const v = validate(input);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payouts).where(eq(payouts.id, payoutId));
    if (!p || (actor.type === "AFFILIATE" && p.affiliateId !== actor.affiliateId)) throw new InvoiceError("Repasse não encontrado");
    if (p.status === "CANCELLED") throw new InvoiceError("Repasse cancelado não recebe nota");
    const fileId = input.pdf ? await saveFile(tx, input.pdf, actor) : null;
    const xmlFileId = input.xml ? await saveFile(tx, input.xml, actor) : null;
    const [inv] = await tx
      .insert(invoices)
      .values({ kind: "PAYOUT", affiliateId: p.affiliateId, payoutId, issuer: "AFFILIATE", ...v, fileId, xmlFileId, createdByType: actor.type, createdById: actor.id ?? null })
      .returning();
    await recordAudit(tx, { actor, affiliateId: p.affiliateId, action: "invoice.payout", entity: "payout", entityId: payoutId, summary: `Enviou a nota fiscal ${v.number} da comissão (${brl(v.amount)})` });
    return inv;
  });
}

export async function cancelInvoice(db: DB, invoiceId: string, actor: AuditActor) {
  const [inv] = await db
    .update(invoices)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "ISSUED"), ...(actor.type === "AFFILIATE" && actor.affiliateId ? [eq(invoices.affiliateId, actor.affiliateId)] : [])))
    .returning();
  if (!inv) throw new InvoiceError("Nota não encontrada");
  await recordAudit(db, { actor, affiliateId: inv.affiliateId, action: "invoice.cancel", entity: "invoice", entityId: inv.id, summary: `Marcou a nota fiscal ${inv.number} como cancelada` });
  return inv;
}

export async function invoicesForOrder(db: DB, orderId: string) {
  return db.select().from(invoices).where(eq(invoices.orderId, orderId)).orderBy(desc(invoices.createdAt));
}

export async function invoicesForPayouts(db: DB, payoutIds: string[]) {
  if (!payoutIds.length) return [];
  return db.select().from(invoices).where(inArray(invoices.payoutId, payoutIds)).orderBy(desc(invoices.createdAt));
}

/** Pedidos pagos (dinheiro real) ainda sem nota registrada. */
export async function ordersWithoutInvoice(db: DB, limit = 100) {
  return db
    .select({ id: orders.id, number: orders.number, paidAt: orders.paidAt, amount: orders.amountCharged, revenue: orders.subrinhoRevenue, commission: orders.affiliateCommission, store: affiliates.name, customer: orders.customerData })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(
      and(
        eq(orders.status, "PAID"),
        sql`coalesce(${orders.paymentData}->>'simulated', 'false') <> 'true'`,
        notExists(db.select({ x: sql`1` }).from(invoices).where(and(eq(invoices.orderId, orders.id), eq(invoices.status, "ISSUED")))),
      ),
    )
    .orderBy(desc(orders.paidAt))
    .limit(limit);
}

/** Repasses (previstos ou pagos) sem a nota da agência. */
export async function payoutsWithoutInvoice(db: DB, limit = 100) {
  return db
    .select({ id: payouts.id, periodStart: payouts.periodStart, periodEnd: payouts.periodEnd, amount: payouts.amount, status: payouts.status, scheduledDate: payouts.scheduledDate, store: affiliates.name })
    .from(payouts)
    .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
    .where(
      and(
        or(eq(payouts.status, "SCHEDULED"), eq(payouts.status, "PAID")),
        sql`${payouts.amount} > 0`,
        notExists(db.select({ x: sql`1` }).from(invoices).where(and(eq(invoices.payoutId, payouts.id), eq(invoices.status, "ISSUED")))),
      ),
    )
    .orderBy(desc(payouts.periodStart))
    .limit(limit);
}

export async function recentInvoices(db: DB, limit = 100) {
  return db
    .select({ inv: invoices, store: affiliates.name, orderNumber: orders.number })
    .from(invoices)
    .innerJoin(affiliates, eq(affiliates.id, invoices.affiliateId))
    .leftJoin(orders, eq(orders.id, invoices.orderId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

/** O arquivo pertence a uma nota desta loja? (download no Painel do Afiliado) */
export async function invoiceFileOwner(db: DB, fileId: string) {
  const [r] = await db
    .select({ affiliateId: invoices.affiliateId, orderId: invoices.orderId, kind: invoices.kind })
    .from(invoices)
    .where(and(or(eq(invoices.fileId, fileId), eq(invoices.xmlFileId, fileId)), isNull(invoices.cancelledAt)));
  return r ?? null;
}
