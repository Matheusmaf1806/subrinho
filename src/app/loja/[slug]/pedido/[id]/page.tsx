import { validOrderAccessKey } from "@/server/order-access";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { CircleCheck, Clock, CreditCard, QrCode } from "lucide-react";
import { db } from "@/server/db";
import { orderItems, orders } from "@/server/db/schema";
import { after } from "next/server";
import { isMockPayments, paymentProvider } from "@/server/payments/provider";
import { paypalConfig } from "@/server/payments/paypal";
import { syncPaypalOrder, type PaypalData } from "@/server/payments/paypal-checkout";
import { autoIssueOrder, refreshItemBooking } from "@/server/bookings/service";
import { Alert, Badge, Button, Card, CardBody, CardHeader, statusTone } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { brl, date, dateTime, ORDER_STATUS_LABEL, orderNumber, paxSummary } from "@/lib/format";
import { formatDocument } from "@/lib/br";
import { getStore, storeBase, viewerFor } from "../../_lib/store";
import { AutoRefresh } from "../../_components/auto-refresh";
import { categoryLabel } from "../../_components/category";
import { PaypalButtons } from "../../_components/paypal-buttons";
import { RubberStamp } from "../../_components/journal";
import { simulatePixPaymentAction } from "../../actions";

export const metadata = { title: "Pedido" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug, id } = await params;
  const { k } = await searchParams;
  const store = await getStore(slug);
  const sb = await storeBase(store);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await viewerFor(store);
  // link do e-mail (?k=): abre este pedido sem login
  const linkKey = validOrderAccessKey(id, k) ? k! : null;
  if (!viewer && !linkKey) redirect(`${sb}/entrar?next=${encodeURIComponent(`${sb}/pedido/${id}`)}`);
  let [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.affiliateId, store.id)));
  if (!order || (!linkKey && viewer?.kind === "CUSTOMER" && order.customerId !== viewer.customer.id)) notFound();
  const keyQs = linkKey ? `?k=${encodeURIComponent(linkKey)}` : "";
  // PayPal: confere o pedido no PayPal (cliente aprovou e fechou a janela antes da confirmação)
  const paypalInfo = (order.paymentData as { paypal?: PaypalData } | null)?.paypal ?? null;
  let paypalNote: string | null = null;
  if (order.status === "PENDING_PAYMENT" && order.paymentProvider === "paypal" && paypalInfo?.orderId) {
    const r = await syncPaypalOrder(db, order.id).catch((e) => {
      console.error("[paypal] conferência:", e instanceof Error ? e.message : e);
      return null;
    });
    if (r?.state === "PAID") {
      order = r.order;
      after(() => autoIssueOrder(id));
    } else if (r && r.state !== "WAITING") paypalNote = r.message;
  }
  const paypalClientId = order.paymentProvider === "paypal" ? (paypalConfig()?.clientId ?? null) : null;
  let items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  // eSIM em emissão: consulta o fornecedor ao abrir (o QR Code costuma ficar pronto em segundos)
  const esimPending = (list: typeof items) => list.filter((i) => i.category === "CHIP" && i.supplierStatus === "PENDING" && !!i.supplierBookingRef);
  if (order.status === "PAID" && esimPending(items).length) {
    await Promise.all(esimPending(items).map((i) => Promise.race([refreshItemBooking(i.id).catch(() => null), new Promise((r) => setTimeout(r, 6_000))])));
    items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  }
  const preparingEsim = order.status === "PAID" && esimPending(items).length > 0;

  const pix = (order.paymentData as { pix?: { brCode: string; expiresAt: string; txid: string } }).pix;
  const card = (order.paymentData as { card?: { brand: string; last4: string; installments: number } }).card;
  const pending = order.status === "PENDING_PAYMENT";
  const pixExpired = pix ? new Date(pix.expiresAt) < new Date() : false;
  const qrSvg = pending && pix && !pixExpired ? await QRCode.toString(pix.brCode, { type: "svg", margin: 1, width: 240, color: { dark: "#2A0A1F", light: "#FFFFFF" } }) : null;

  return (
    <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-10 sm:px-8">
      {pending && pix && !pixExpired && <AutoRefresh seconds={5} />}
      {pending && paypalInfo?.status === "PENDING" && <AutoRefresh seconds={15} />}
      {preparingEsim && <AutoRefresh seconds={8} />}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <p className="text-[13px] font-semibold text-muted">Pedido {orderNumber(order.number)}</p>
          <h1 data-enter className="display mt-3 max-w-3xl text-[clamp(2.75rem,6vw,5.25rem)] text-ink">
            {order.status === "PAID" ? "Pagamento confirmado!" : pending ? "Falta pouco: conclua o pagamento" : ORDER_STATUS_LABEL[order.status]}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {order.status === "PAID" && (
            <div data-drop style={{ "--d": "350ms" } as React.CSSProperties} className="hidden -rotate-12 sm:block">
              <RubberStamp top="Pagamento" main="Pago" bottom={orderNumber(order.number)} className="text-success opacity-85 mix-blend-multiply" />
            </div>
          )}
          <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        </div>
      </div>

      {order.status === "PAID" && (
        <Alert tone="success" title="Tudo certo com a sua compra">
          <CircleCheck className="mr-1 inline h-4 w-4" /> Pago em {dateTime(order.paidAt)}. Os vouchers ficam disponíveis nesta página assim que cada reserva for confirmada.
        </Alert>
      )}

      {pending && order.paymentMethod === "CARD" && order.paymentProvider === "paypal" && (
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><CreditCard className="h-5 w-5 text-accent-ink" /> Pague com cartão ou PayPal</span>}
            subtitle={`Valor: ${brl(order.amountCharged)} · em até ${order.installments}x no cartão`}
          />
          <CardBody className="space-y-4">
            {paypalNote && <Alert tone={paypalInfo?.status === "PENDING" ? "info" : "warning"}>{paypalNote}</Alert>}
            {paypalInfo?.status === "PENDING" ? null : paypalClientId ? (
              <div className="max-w-md">
                <PaypalButtons clientId={paypalClientId} slug={slug} orderId={order.id} accessKey={linkKey} />
              </div>
            ) : (
              <Alert tone="warning">Pagamento com cartão indisponível no momento. Tente novamente em instantes.</Alert>
            )}
          </CardBody>
        </Card>
      )}

      {pending && order.paymentMethod === "PIX" && pix && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><QrCode className="h-5 w-5 text-accent-ink" /> Pague com Pix</span>} subtitle={`Valor: ${brl(order.amountCharged)}`} />
          <CardBody>
            {pixExpired ? (
              <Alert tone="warning" title="Este Pix expirou">
                Volte ao checkout para gerar um novo código.{" "}
                <a className="font-semibold underline" href={`${sb}/carrinho`}>
                  Ir para o carrinho
                </a>
              </Alert>
            ) : (
              <div className="grid gap-5 sm:grid-cols-[240px_1fr] sm:items-center">
                <div className="mx-auto overflow-hidden rounded-2xl border border-line" dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }} />
                <div className="space-y-3">
                  <p className="text-sm text-muted">Abra o app do seu banco, escolha Pix → Ler QR Code, ou use o código copia e cola:</p>
                  <textarea readOnly value={pix.brCode} className="h-24 w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs" aria-label="Pix copia e cola" />
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={pix.brCode} label="Copiar código Pix" />
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" /> Válido até {dateTime(pix.expiresAt)}
                    </span>
                  </div>
                  {!isMockPayments() && !paymentProvider().pixAutoConfirm && (
                    <p className="text-xs text-muted">Depois de pagar, a confirmação é feita pela nossa equipe. Esta página atualiza sozinha.</p>
                  )}
                  {isMockPayments() && (
                    <form action={simulatePixPaymentAction.bind(null, slug, order.id)}>
                      <Button variant="dark" size="sm">
                        Simular pagamento (ambiente de testes)
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Itens" />
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{categoryLabel(i.category)}</p>
                <p className="font-semibold text-ink">{i.title}</p>
                {i.subtitle && <p className="text-sm text-muted">{i.subtitle}</p>}
                <p className="text-xs text-muted">
                  {i.serviceDate ? `${date(i.serviceDate)}${i.serviceEndDate ? ` a ${date(i.serviceEndDate)}` : ""} · ` : ""}
                  {paxSummary(i.pax)}
                </p>
                {i.supplierStatus === "CONFIRMED" && i.supplierBookingRef ? (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-success">
                    Reserva confirmada · localizador {i.supplierBookingRef}
                    {(i.category === "LODGING" || i.category === "HOUSES" || i.category === "TICKETS" || i.category === "CHIP") && (
                      <a href={`${sb}/pedido/${order.id}/voucher/${i.id}${keyQs}`} className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white hover:bg-ink-2">
                        {i.category === "CHIP" ? "Ver QR Code do eSIM" : "Ver voucher"}
                      </a>
                    )}
                  </p>
                ) : i.category === "CHIP" && i.supplierStatus === "PENDING" && order.status === "PAID" ? (
                  <p className="mt-1 text-xs font-semibold text-muted">Preparando seu eSIM, o QR Code aparece aqui em instantes</p>
                ) : i.supplierStatus === "CANCELLED" ? (
                  <p className="mt-1 text-xs font-semibold text-red-700">Reserva cancelada</p>
                ) : order.status === "PAID" && (order.paymentData as { simulated?: boolean } | null)?.simulated ? (
                  <p className="mt-1 text-xs font-semibold text-amber-800">Pagamento de teste: nenhuma reserva é feita no fornecedor</p>
                ) : order.status === "PAID" ? (
                  <p className="mt-1 text-xs font-semibold text-muted">Reserva em processamento, você recebe a confirmação em breve</p>
                ) : null}
              </div>
              <p className="font-semibold text-ink tabular">{brl(i.chargedAmount)}</p>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-5 py-4 text-sm">
          {Number(order.totalSubrinhoDiscount) + Number(order.totalAffiliateDiscount) > 0 && (
            <div className="flex justify-between text-success">
              <span>Descontos</span>
              <span className="font-semibold tabular">− {brl(Number(order.totalSubrinhoDiscount) + Number(order.totalAffiliateDiscount))}</span>
            </div>
          )}
          <div className="flex justify-between text-base">
            <span className="font-semibold">
              Total {order.paymentMethod === "PIX" ? "no Pix" : order.paymentProvider === "paypal" ? `no cartão ou PayPal (em até ${order.installments}x)` : `no cartão (${order.installments}x sem juros)`}
            </span>
            <span className="font-semibold tabular">{brl(order.amountCharged)}</span>
          </div>
          {card && <p className="mt-1 text-xs text-muted">{card.brand} final {card.last4}</p>}
          {order.status === "PAID" && paypalInfo?.method && <p className="mt-1 text-xs text-muted">Pago com {paypalInfo.method} via PayPal</p>}
        </div>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader title="Titular da conta" />
          <CardBody className="text-sm">
            <p className="font-semibold">{order.customerData.name}</p>
            <p className="text-muted">{order.customerData.email}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pagador" />
          <CardBody className="text-sm">
            <p className="font-semibold">{order.payerData.name}</p>
            <p className="text-muted">
              {formatDocument(order.payerData.document)} · {order.payerData.email}
            </p>
          </CardBody>
        </Card>
      </div>
      {order.travelers.length > 0 && (
        <Card>
          <CardHeader title="Viajantes" />
          <CardBody className="text-sm">
            <ul className="space-y-1">
              {order.travelers.map((t, i) => (
                <li key={i}>
                  <span className="font-semibold">{t.name}</span> {t.document ? <span className="text-muted">· {t.document}</span> : null}
                </li>
              ))}
            </ul>
            {order.specialRequests && (
              <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-[13px] text-ink/80">
                <span className="font-semibold text-ink">Pedido especial ao hotel:</span> {order.specialRequests}
                <span className="block text-muted">Sujeito à disponibilidade do hotel.</span>
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </main>
  );
}
