/**
 * E-mails automáticos da plataforma. Cada função monta o e-mail com a marca da loja e grava na fila
 * (dentro da transação de quem chamou). Os textos para o cliente nunca citam fornecedor nem a Subrinho:
 * o remetente é a loja e a resposta vai para a agência.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, affiliateUsers, carts, cartItems, orderItems, orders, subrinhoUsers } from "@/server/db/schema";
import { brl, date as fmtDate, dateTime, orderNumber } from "@/lib/format";
import { domainConfig, storeOrigin } from "@/lib/store-domains";
import { appUrl, storePublicUrl } from "@/server/store-links";
import { orderAccessKey } from "@/server/order-access";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { renderEmail, type EmailBrand, type EmailContent } from "./render";
import { isEmail, normalizeEmail, queueEmail } from "./outbox";

type Store = typeof affiliates.$inferSelect;
type Order = typeof orders.$inferSelect;
type Item = typeof orderItems.$inferSelect;

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";
const hello = (n: string | null | undefined) => (firstName(n) ? `Olá, ${firstName(n)}!` : "Olá!");

/** Endereço absoluto de um arquivo da loja (logo): no domínio da loja, ou no da plataforma. */
function absAsset(store: Store, u: string | null | undefined): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${storeOrigin(store, domainConfig()) ?? appUrl()}${u.startsWith("/") ? u : `/${u}`}`;
}

export function storeBrand(store: Store): EmailBrand {
  const contact = [store.email, store.whatsapp || store.phone].filter(Boolean).join(" · ");
  return {
    name: store.name,
    color: store.brandColor,
    logoUrl: absAsset(store, store.logoUrl),
    siteUrl: storePublicUrl(store),
    footer: [[store.legalName, store.document ? `CNPJ ${store.document}` : null].filter(Boolean).join(" · "), contact].filter((l) => !!l),
  };
}

const PLATFORM_BRAND = (): EmailBrand => ({ name: "Subrinho", color: "#E4113F", siteUrl: appUrl(), footer: ["Aviso automático da plataforma"] });

export const orderLink = (store: Store, orderId: string, path = "") => storePublicUrl(store, `/pedido/${orderId}${path}?k=${orderAccessKey(orderId)}`);

function itemLine(i: Pick<Item, "title" | "subtitle" | "category" | "serviceDate" | "serviceEndDate">, value?: string | null) {
  const when = i.serviceDate ? (i.serviceEndDate && i.serviceEndDate !== i.serviceDate ? `${fmtDate(i.serviceDate)} a ${fmtDate(i.serviceEndDate)}` : fmtDate(i.serviceDate)) : null;
  return { title: i.title, subtitle: [CATEGORY_LABEL[i.category] ?? null, i.subtitle, when].filter(Boolean).join(" · ") || null, value: value ?? null };
}

async function loadOrder(tx: Tx, orderId: string) {
  const [row] = await tx.select({ order: orders, store: affiliates }).from(orders).innerJoin(affiliates, eq(affiliates.id, orders.affiliateId)).where(eq(orders.id, orderId));
  if (!row) return null;
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
  return { ...row, items };
}

const customerEmail = (o: Order) => o.customerData?.email ?? o.payerData?.email ?? null;
const customerName = (o: Order) => o.customerData?.name ?? o.payerData?.name ?? null;
const methodLabel = (o: Order) => (o.paymentMethod === "PIX" ? "Pix" : o.paymentProvider === "paypal" ? "PayPal" : o.installments > 1 ? `Cartão em ${o.installments}x` : "Cartão");

async function sendToCustomer(tx: Tx, store: Store, o: Order, kind: string, dedupeKey: string, content: EmailContent) {
  const to = customerEmail(o);
  if (!isEmail(to)) return null;
  const { html, text } = renderEmail(storeBrand(store), content);
  return queueEmail(tx, { kind, to: to!, toName: customerName(o), fromName: store.name, replyTo: store.email, subject: content.title, html, text, affiliateId: store.id, orderId: o.id, dedupeKey });
}

/** E-mails da agência (contato da loja + usuários ADMIN ativos), sem repetir endereço. */
export async function agencyRecipients(tx: Tx, store: Store): Promise<string[]> {
  const users = await tx
    .select({ email: affiliateUsers.email })
    .from(affiliateUsers)
    .where(and(eq(affiliateUsers.affiliateId, store.id), eq(affiliateUsers.active, true), eq(affiliateUsers.role, "ADMIN")));
  return [...new Set([store.email, ...users.map((u) => u.email)].map(normalizeEmail).filter(isEmail))];
}

/** E-mails da equipe Subrinho por assunto (mais ALERT_EMAILS, se definido). */
export async function teamRecipients(tx: Tx, topic: "issue" | "finance" | "alerts"): Promise<string[]> {
  const roles = topic === "finance" ? (["OWNER", "ADMIN", "FINANCE"] as const) : (["OWNER", "ADMIN", "SUPPORT"] as const);
  const users = await tx
    .select({ email: subrinhoUsers.email })
    .from(subrinhoUsers)
    .where(and(eq(subrinhoUsers.active, true), inArray(subrinhoUsers.role, [...roles])));
  const extra = (process.env.ALERT_EMAILS ?? "").split(/[,;\s]+/);
  return [...new Set([...users.map((u) => u.email), ...extra].map(normalizeEmail).filter(isEmail))];
}

export async function sendToTeam(tx: Tx, topic: "issue" | "finance" | "alerts", kind: string, dedupeKey: string | null, content: EmailContent, ref: { orderId?: string | null; affiliateId?: string | null } = {}) {
  const { html, text } = renderEmail(PLATFORM_BRAND(), content);
  for (const to of await teamRecipients(tx, topic))
    await queueEmail(tx, { kind, to, fromName: "Subrinho", subject: content.title, html, text, orderId: ref.orderId ?? null, affiliateId: ref.affiliateId ?? null, dedupeKey: dedupeKey ? `${dedupeKey}:${to}` : null });
}

// ───────────── Pedido ─────────────

/** Pedido com Pix criado: instruções para pagar. */
export async function notifyOrderPlaced(tx: Tx, orderId: string) {
  const d = await loadOrder(tx, orderId);
  if (!d || d.order.status !== "PENDING_PAYMENT" || d.order.paymentMethod !== "PIX") return;
  const { order: o, store, items } = d;
  const pix = (o.paymentData as { pix?: { expiresAt?: string } }).pix;
  await sendToCustomer(tx, store, o, "order.placed", `order-placed:${o.id}`, {
    preheader: `Pague o Pix para confirmar o pedido ${orderNumber(o.number)}`,
    title: `Pedido ${orderNumber(o.number)}: falta pagar o Pix`,
    paragraphs: [
      hello(customerName(o)),
      `Recebemos o seu pedido na ${store.name}. Para confirmar, pague o Pix${pix?.expiresAt ? ` até ${dateTime(pix.expiresAt)}` : ""}. O código está na página do pedido.`,
    ],
    items: items.map((i) => itemLine(i, brl(i.chargedAmount))),
    rows: [{ label: "Total no Pix", value: brl(o.amountCharged) }],
    cta: { label: "Ver pedido e pagar o Pix", url: orderLink(store, o.id) },
    note: "Assim que o pagamento cair, você recebe a confirmação por e-mail. Se o prazo do Pix passar, é só gerar outro no carrinho.",
  });
}

/** Pagamento confirmado: cliente, agência e (se houver item para emitir à mão) a equipe. */
export async function notifyOrderPaid(tx: Tx, orderId: string, opts: { paidAfterCancel?: boolean } = {}) {
  const d = await loadOrder(tx, orderId);
  if (!d || d.order.status !== "PAID") return;
  const { order: o, store, items } = d;
  const simulated = !!(o.paymentData as { simulated?: boolean }).simulated;

  await sendToCustomer(tx, store, o, "order.paid", `order-paid:${o.id}:customer`, {
    preheader: `Pagamento do pedido ${orderNumber(o.number)} confirmado`,
    title: `Pagamento confirmado: pedido ${orderNumber(o.number)}`,
    paragraphs: [
      hello(customerName(o)),
      `Seu pagamento foi confirmado. Agora a ${store.name} confirma cada reserva e você recebe por e-mail o voucher de cada item assim que ele ficar pronto.`,
    ],
    items: items.map((i) => itemLine(i, brl(i.chargedAmount))),
    rows: [
      { label: "Total pago", value: brl(o.amountCharged) },
      { label: "Forma de pagamento", value: methodLabel(o) },
    ],
    cta: { label: "Acompanhar o pedido", url: orderLink(store, o.id) },
    note: `Dúvidas? Responda este e-mail ou fale com a ${store.name}${store.whatsapp ? ` pelo WhatsApp ${store.whatsapp}` : ""}.`,
  });

  const agencyContent: EmailContent = {
    title: `Nova venda: pedido ${orderNumber(o.number)} (${brl(o.amountCharged)})`,
    paragraphs: [`${customerName(o) ?? "Um cliente"} comprou na sua loja${simulated ? " (pagamento de teste, não é dinheiro real)" : ""}.`],
    items: items.map((i) => itemLine(i, brl(i.chargedAmount))),
    rows: [
      { label: "Total", value: brl(o.amountCharged) },
      { label: "Sua comissão", value: brl(o.affiliateCommission) },
      ...(o.payoutDate ? [{ label: "Repasse previsto", value: fmtDate(o.payoutDate) }] : []),
    ],
    cta: { label: "Ver no Painel do Afiliado", url: `${appUrl()}/afiliado/pedidos/${o.id}` },
  };
  const { html, text } = renderEmail(PLATFORM_BRAND(), agencyContent);
  for (const to of await agencyRecipients(tx, store))
    await queueEmail(tx, { kind: "order.paid.agency", to, fromName: "Subrinho", subject: agencyContent.title, html, text, affiliateId: store.id, orderId: o.id, dedupeKey: `order-paid:${o.id}:agency:${to}` });

  const { autoIssueEnabled, isManualIssue } = await import("@/server/bookings/service");
  const toIssue = items.filter((i) => i.supplierStatus === "AWAITING_ISSUE" && (isManualIssue(i.supplierCode) || !autoIssueEnabled()));
  if (toIssue.length && !simulated)
    await sendToTeam(tx, "issue", "team.awaiting_issue", `order-paid:${o.id}:team`, {
      title: `Emitir: pedido ${orderNumber(o.number)} (${toIssue.length} ${toIssue.length > 1 ? "itens" : "item"})`,
      paragraphs: [`Pedido pago na loja ${store.name}. ${toIssue.length > 1 ? "Estes itens aguardam" : "Este item aguarda"} emissão no fornecedor.`],
      items: toIssue.map((i) => itemLine(i, i.supplierCode)),
      cta: { label: "Abrir o pedido no Painel Subrinho", url: `${appUrl()}/subrinho/pedidos/${o.id}` },
    }, { orderId: o.id, affiliateId: store.id });

  if (opts.paidAfterCancel)
    await sendToTeam(tx, "finance", "team.paid_after_cancel", `paid-after-cancel:${o.id}`, {
      title: `Atenção: pagamento depois do cancelamento (pedido ${orderNumber(o.number)})`,
      paragraphs: [`O pedido tinha sido substituído ou cancelado e o pagamento de ${brl(o.amountCharged)} chegou mesmo assim. Confira se é preciso estornar.`],
      cta: { label: "Abrir o pedido", url: `${appUrl()}/subrinho/pedidos/${o.id}` },
    }, { orderId: o.id, affiliateId: store.id });
}

// ───────────── Itens (reserva, eSIM, cancelamento) ─────────────

async function loadItem(tx: Tx, itemId: string) {
  const [row] = await tx
    .select({ item: orderItems, order: orders, store: affiliates })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(affiliates, eq(affiliates.id, orders.affiliateId))
    .where(eq(orderItems.id, itemId));
  return row ?? null;
}

/** Reserva confirmada (voucher pronto) ou eSIM emitido. Um e-mail por item. */
export async function notifyItemReady(tx: Tx, itemId: string) {
  const d = await loadItem(tx, itemId);
  if (!d || d.item.supplierStatus !== "CONFIRMED") return;
  const { item, order: o, store } = d;
  if (item.category === "CHIP")
    return sendToCustomer(tx, store, o, "item.esim_ready", `item-ready:${item.id}`, {
      preheader: "Instale o eSIM antes de viajar",
      title: `Seu eSIM está pronto: ${item.title}`,
      paragraphs: [
        hello(customerName(o)),
        "Seu chip internacional (eSIM) já foi emitido. Instale antes de viajar, com o celular conectado ao Wi-Fi: abra o pedido no celular e siga o passo a passo (QR Code ou instalação com um toque no iPhone).",
      ],
      items: [itemLine(item)],
      cta: { label: "Instalar o eSIM", url: orderLink(store, o.id) },
      note: "A validade começa quando o celular se conecta à rede no destino. Ao chegar, ligue o eSIM e os dados em roaming.",
    });
  return sendToCustomer(tx, store, o, "item.voucher_ready", `item-ready:${item.id}`, {
    preheader: "Seu voucher está pronto",
    title: `Reserva confirmada: ${item.title}`,
    paragraphs: [hello(customerName(o)), `Sua reserva está confirmada. O voucher já está disponível: apresente no dia (no celular ou impresso).`],
    items: [itemLine(item)],
    ...(item.supplierBookingRef ? { rows: [{ label: "Localizador", value: item.supplierBookingRef }] } : {}),
    cta: { label: "Ver o voucher", url: orderLink(store, o.id, `/voucher/${item.id}`) },
    note: `Dúvidas sobre a reserva? Responda este e-mail ou fale com a ${store.name}.`,
  });
}

export async function notifyItemCancelled(tx: Tx, itemId: string) {
  const d = await loadItem(tx, itemId);
  if (!d || d.item.supplierStatus !== "CANCELLED") return;
  const { item, order: o, store } = d;
  return sendToCustomer(tx, store, o, "item.cancelled", `item-cancelled:${item.id}`, {
    title: `Reserva cancelada: ${item.title}`,
    paragraphs: [hello(customerName(o)), `A reserva abaixo foi cancelada. A ${store.name} fala com você sobre o reembolso, conforme a política de cancelamento informada na compra.`],
    items: [itemLine(item)],
    cta: { label: "Ver o pedido", url: orderLink(store, o.id) },
  });
}

/** Emissão falhou: avisa a equipe (no máximo um aviso por item por dia). */
export async function notifyBookingFailed(tx: Tx, itemId: string, message: string) {
  const d = await loadItem(tx, itemId);
  if (!d) return;
  const { item, order: o, store } = d;
  await sendToTeam(tx, "issue", "team.booking_failed", `item-failed:${item.id}:${new Date().toISOString().slice(0, 10)}`, {
    title: `Falha na emissão: pedido ${orderNumber(o.number)}`,
    paragraphs: [`Não foi possível emitir "${item.title}" (${item.supplierCode}) da loja ${store.name}.`, message],
    cta: { label: "Abrir o pedido", url: `${appUrl()}/subrinho/pedidos/${o.id}` },
  }, { orderId: o.id, affiliateId: store.id });
}

// ───────────── Conta ─────────────

export async function sendPasswordReset(tx: Tx, p: { to: string; name?: string | null; link: string; store?: Store | null; area: string }) {
  const brand = p.store ? storeBrand(p.store) : PLATFORM_BRAND();
  const content: EmailContent = {
    title: "Redefinir sua senha",
    paragraphs: [hello(p.name), `Recebemos um pedido para criar uma nova senha de acesso (${p.area}). Clique no botão para escolher a nova senha.`],
    cta: { label: "Criar nova senha", url: p.link },
    note: "O link vale por 1 hora e funciona uma vez só. Se não foi você, ignore este e-mail: sua senha continua a mesma.",
  };
  const { html, text } = renderEmail(brand, content);
  return queueEmail(tx, { kind: "auth.reset", to: p.to, toName: p.name, fromName: p.store?.name ?? "Subrinho", replyTo: p.store?.email ?? null, subject: content.title, html, text, affiliateId: p.store?.id ?? null });
}

// ───────────── Carrinho abandonado ─────────────

export async function sendCartReminder(tx: Tx, p: { store: Store; cart: typeof carts.$inferSelect; to: string; name?: string | null; items: Pick<typeof cartItems.$inferSelect, "title" | "subtitle" | "category" | "serviceDate" | "serviceEndDate">[] }) {
  const content: EmailContent = {
    preheader: "Os itens que você escolheu continuam no carrinho",
    title: `Seu carrinho na ${p.store.name} está esperando`,
    paragraphs: [hello(p.name), "Você deixou estes itens no carrinho. Quer continuar de onde parou?"],
    items: p.items.slice(0, 6).map((i) => itemLine(i)),
    cta: { label: "Voltar ao carrinho", url: storePublicUrl(p.store, `/carrinho/${p.cart.token}`) },
    note: `Preço e disponibilidade são confirmados de novo no pagamento. Dúvidas? Responda este e-mail ou fale com a ${p.store.name}.`,
  };
  const { html, text } = renderEmail(storeBrand(p.store), content);
  return queueEmail(tx, { kind: "cart.reminder", to: p.to, toName: p.name, fromName: p.store.name, replyTo: p.store.email, subject: content.title, html, text, affiliateId: p.store.id, dedupeKey: `cart-reminder:${p.cart.id}` });
}

/**
 * Roda o envio num savepoint: um erro ao montar o e-mail nunca desfaz o evento principal
 * (pagamento, emissão) nem a transação de quem chamou.
 */
export async function notifySafely(tx: Tx, label: string, fn: (t: Tx) => Promise<unknown>): Promise<void> {
  try {
    await (tx as Parameters<Parameters<Tx["transaction"]>[0]>[0]).transaction(async (sp) => {
      await fn(sp);
    });
  } catch (e) {
    console.error(`[email] ${label}:`, e instanceof Error ? e.message : e);
  }
}
