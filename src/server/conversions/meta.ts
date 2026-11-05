/**
 * API de conversões da Meta (Conversions API): a compra vai do servidor para a Meta quando o pagamento
 * é confirmado, mesmo que o cliente nunca volte à página do pedido (ex.: pagou o Pix depois).
 *
 * - Só com o consentimento de cookies do cliente no checkout ("Aceitar todos"), como o Pixel (LGPD).
 * - Dados pessoais vão só como hash SHA-256 (e-mail, telefone, nome, cidade, CEP), como a Meta pede.
 * - event_id = "purchase-<nº do pedido>", o mesmo do Pixel do navegador: a Meta conta a compra uma vez.
 * - Fila no banco (conversion_events), como os e-mails: grava na transação do pagamento, envia logo
 *   depois e tenta de novo (1, 5, 30 e 120 min); o cron diário pega o que sobrou.
 * - Token por loja (Gerenciador de Eventos › Configurações › API de conversões), cifrado no banco.
 */
import { createHash } from "node:crypto";
import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, type DB, type Tx } from "@/server/db";
import { affiliates, conversionEvents, orderItems, orders } from "@/server/db/schema";
import { openSecret } from "@/server/auth/totp";
import { orderLink } from "@/server/email/notify";

export const META_GRAPH_VERSION = () => process.env.META_GRAPH_VERSION?.trim() || "v22.0";
const BACKOFF_MIN = [1, 5, 30, 120];
export const META_MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

type Store = typeof affiliates.$inferSelect;
type Order = typeof orders.$inferSelect;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const hashed = (v: string | null | undefined) => (norm(v) ? [sha(norm(v))] : undefined);
const plain = (v: string | null | undefined) => (norm(v) ? norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "") : "");

/** Telefone no formato da Meta: só dígitos, com o código do país (55 quando é número brasileiro). */
export function metaPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** Monta o evento Purchase (sem o token). */
export function buildPurchaseEvent(o: Order, items: Pick<typeof orderItems.$inferSelect, "productId" | "chargedAmount" | "category">[], url: string) {
  const person = o.customerData ?? o.payerData;
  const parts = (person?.name ?? "").trim().split(/\s+/);
  const addr = o.payerData?.address ?? o.customerData?.address ?? null;
  const t = o.tracking ?? {};
  const user_data: Record<string, unknown> = {
    em: hashed(person?.email ?? o.payerData?.email),
    ph: metaPhone(person?.phone ?? o.payerData?.phone) ? [sha(metaPhone(person?.phone ?? o.payerData?.phone))] : undefined,
    fn: plain(parts[0]) ? [sha(plain(parts[0]))] : undefined,
    ln: parts.length > 1 && plain(parts[parts.length - 1]) ? [sha(plain(parts[parts.length - 1]))] : undefined,
    ct: plain(addr?.city) ? [sha(plain(addr?.city))] : undefined,
    st: plain(addr?.state) ? [sha(plain(addr?.state).slice(0, 2))] : undefined,
    zp: (addr?.zip ?? "").replace(/\D/g, "") ? [sha((addr?.zip ?? "").replace(/\D/g, ""))] : undefined,
    country: [sha("br")],
    external_id: o.customerId ? [sha(o.customerId)] : undefined,
    client_ip_address: o.ip ?? undefined,
    client_user_agent: o.userAgent ?? undefined,
    fbp: t.fbp ?? undefined,
    fbc: t.fbc ?? undefined,
  };
  for (const k of Object.keys(user_data)) if (user_data[k] === undefined) delete user_data[k];
  return {
    event_name: "Purchase",
    event_time: Math.floor((o.paidAt ?? new Date()).getTime() / 1000),
    event_id: `purchase-${o.number}`,
    action_source: "website",
    event_source_url: t.url || url,
    user_data,
    custom_data: {
      currency: "BRL",
      value: Number(o.amountCharged),
      order_id: String(o.number),
      num_items: items.length,
      content_type: "product",
      contents: items.map((i) => ({ id: i.productId, quantity: 1, item_price: Number(i.chargedAmount), category: i.category })),
    },
  };
}

export function metaReady(store: Pick<Store, "metaPixelId" | "metaCapiToken">) {
  return !!(store.metaPixelId && openSecret(store.metaCapiToken));
}

/** Pagamento confirmado: coloca a compra na fila (se a loja usa a API e o cliente consentiu). */
export async function queueMetaPurchase(tx: Tx, orderId: string) {
  const [row] = await tx.select({ order: orders, store: affiliates }).from(orders).innerJoin(affiliates, eq(affiliates.id, orders.affiliateId)).where(eq(orders.id, orderId));
  if (!row || row.order.status !== "PAID") return null;
  const { order: o, store } = row;
  if (!metaReady(store)) return null;
  if (!o.tracking?.consent) return null; // sem "Aceitar todos" no checkout: não vai nada para a Meta
  if ((o.paymentData as { simulated?: boolean }).simulated) return null; // pagamento de teste não é venda
  const items = await tx.select({ productId: orderItems.productId, chargedAmount: orderItems.chargedAmount, category: orderItems.category }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const event = buildPurchaseEvent(o, items, orderLink(store, o.id).replace(/\?k=.*/, ""));
  const [ins] = await tx
    .insert(conversionEvents)
    .values({ provider: "META", event: "Purchase", affiliateId: store.id, orderId, eventId: event.event_id, payload: event })
    .onConflictDoNothing()
    .returning({ id: conversionEvents.id });
  if (ins) scheduleConversions();
  return ins?.id ?? null;
}

export function scheduleConversions() {
  try {
    after(() => flushConversions(getDb()).catch((e) => console.error("[meta] envio:", e)));
  } catch {
    /* fora de uma requisição: o cron diário envia */
  }
}

export type MetaTransport = (req: { url: string; body: string }) => Promise<{ status: number; body: string }>;

const fetchTransport: MetaTransport = async (req) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(req.url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Subrinho/1.0" }, body: req.body, signal: ctrl.signal, cache: "no-store" });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
};

/** Envia um lote de eventos para o Pixel da loja. */
export async function sendMetaEvents(store: Pick<Store, "metaPixelId" | "metaCapiToken" | "metaTestEventCode">, events: unknown[], transport: MetaTransport = fetchTransport, opts: { testCode?: string | null } = {}) {
  const token = openSecret(store.metaCapiToken);
  if (!store.metaPixelId || !token) return { ok: false as const, retry: false, error: "Loja sem Pixel ou sem token da API de conversões" };
  // o código de teste só vale para o botão "Testar": compra de verdade nunca vai como teste
  const testCode = opts.testCode ?? null;
  let res: { status: number; body: string };
  try {
    res = await transport({
      url: `https://graph.facebook.com/${META_GRAPH_VERSION()}/${encodeURIComponent(store.metaPixelId)}/events`,
      body: JSON.stringify({ data: events, access_token: token, ...(testCode ? { test_event_code: testCode } : {}) }),
    });
  } catch (e) {
    return { ok: false as const, retry: true, error: `Meta: ${(e as Error).name === "AbortError" ? "sem resposta em 15 s" : (e as Error).message}` };
  }
  let body: { events_received?: number; fbtrace_id?: string; error?: { message?: string; code?: number; error_subcode?: number } } = {};
  try {
    body = JSON.parse(res.body);
  } catch {
    /* corpo não é JSON */
  }
  if (res.status === 200 && (body.events_received ?? 0) >= events.length) return { ok: true as const, response: { events_received: body.events_received, fbtrace_id: body.fbtrace_id } };
  const msg = body.error?.message ?? `HTTP ${res.status}`;
  // 190 = token inválido/vencido; 100 = parâmetro inválido: tentar de novo não resolve
  const retry = res.status === 429 || res.status >= 500 || body.error?.code === 2 || body.error?.code === 4;
  return { ok: false as const, retry, error: `Meta ${res.status}: ${msg}${body.error?.code ? ` (código ${body.error.code})` : ""}` };
}

type Claimed = { id: string; affiliate_id: string; payload: unknown; attempts: number };

export async function flushConversions(db: DB, opts: { transport?: MetaTransport; limit?: number } = {}) {
  const res = await db.execute(sql`
    UPDATE ${conversionEvents} SET status = 'SENDING', claimed_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM ${conversionEvents}
      WHERE (status = 'PENDING' AND next_attempt_at <= now())
         OR (status = 'SENDING' AND claimed_at < now() - interval '10 minutes')
      ORDER BY created_at
      LIMIT ${opts.limit ?? 50}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, affiliate_id, payload, attempts`);
  const rows = (res as unknown as { rows: Claimed[] }).rows ?? [];
  let sent = 0;
  for (const r of rows) {
    const [store] = await db.select().from(affiliates).where(eq(affiliates.id, r.affiliate_id));
    if (!store || !metaReady(store)) {
      await db.update(conversionEvents).set({ status: "SKIPPED", lastError: "A loja tirou o Pixel ou o token da API de conversões" }).where(eq(conversionEvents.id, r.id));
      continue;
    }
    const out = await sendMetaEvents(store, [r.payload], opts.transport);
    if (out.ok) {
      sent++;
      await db.update(conversionEvents).set({ status: "SENT", sentAt: new Date(), lastError: null, response: out.response }).where(eq(conversionEvents.id, r.id));
      continue;
    }
    const giveUp = !out.retry || r.attempts >= META_MAX_ATTEMPTS;
    await db
      .update(conversionEvents)
      .set({ status: giveUp ? "FAILED" : "PENDING", lastError: out.error.slice(0, 500), nextAttemptAt: new Date(Date.now() + (BACKOFF_MIN[Math.min(r.attempts - 1, BACKOFF_MIN.length - 1)] ?? 120) * 60_000) })
      .where(eq(conversionEvents.id, r.id));
    if (giveUp) {
      const { recordError } = await import("@/server/monitoring");
      await recordError(db, { source: "conversion", key: `META:${store.name}`, code: "META", message: `Compra não enviada à Meta: ${out.error}` });
    }
  }
  return { claimed: rows.length, sent };
}

/** Botão "Testar" do painel: um evento de teste (só aparece em Eventos de teste, não conta nas campanhas). */
export async function testMetaConnection(store: Pick<Store, "metaPixelId" | "metaCapiToken" | "metaTestEventCode">, transport?: MetaTransport) {
  if (!store.metaTestEventCode) return { ok: false as const, error: "Informe o código de teste (Gerenciador de Eventos › Eventos de teste) para testar sem afetar as campanhas" };
  const event = {
    event_name: "PageView",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `teste-${Date.now()}`,
    action_source: "website",
    user_data: { client_ip_address: "127.0.0.1", client_user_agent: "Subrinho teste de conexão", external_id: [sha("subrinho-teste")] },
  };
  const out = await sendMetaEvents(store, [event], transport, { testCode: store.metaTestEventCode });
  return out.ok ? { ok: true as const } : { ok: false as const, error: out.error };
}
