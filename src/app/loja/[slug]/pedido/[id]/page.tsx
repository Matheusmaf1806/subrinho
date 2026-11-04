import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { CircleCheck, Clock, QrCode } from "lucide-react";
import { db } from "@/server/db";
import { orderItems, orders } from "@/server/db/schema";
import { isMockPayments } from "@/server/payments/provider";
import { Alert, Badge, Button, Card, CardBody, CardHeader, statusTone } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { brl, date, dateTime, ORDER_STATUS_LABEL, orderNumber, paxSummary } from "@/lib/format";
import { formatDocument } from "@/lib/br";
import { getStore, viewerFor } from "../../_lib/store";
import { AutoRefresh } from "../../_components/auto-refresh";
import { categoryLabel } from "../../_components/category";
import { simulatePixPaymentAction } from "../../actions";

export const metadata = { title: "Pedido" };

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const store = await getStore(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await viewerFor(store);
  if (!viewer) redirect(`/loja/${slug}/entrar?next=${encodeURIComponent(`/loja/${slug}/pedido/${id}`)}`);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.affiliateId, store.id)));
  if (!order || (viewer.kind === "CUSTOMER" && order.customerId !== viewer.customer.id)) notFound();
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  const pix = (order.paymentData as { pix?: { brCode: string; expiresAt: string; txid: string } }).pix;
  const card = (order.paymentData as { card?: { brand: string; last4: string; installments: number } }).card;
  const pending = order.status === "PENDING_PAYMENT";
  const pixExpired = pix ? new Date(pix.expiresAt) < new Date() : false;
  const qrSvg = pending && pix && !pixExpired ? await QRCode.toString(pix.brCode, { type: "svg", margin: 1, width: 240, color: { dark: "#2A0A1F", light: "#FFFFFF" } }) : null;

  return (
    <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-10 sm:px-8">
      {pending && pix && !pixExpired && <AutoRefresh seconds={5} />}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <p className="text-[13px] font-semibold text-muted">Pedido {orderNumber(order.number)}</p>
          <h1 className="display mt-3 max-w-3xl text-[clamp(2.75rem,6vw,5.25rem)] text-ink">
            {order.status === "PAID" ? "Pagamento confirmado!" : pending ? "Falta pouco: conclua o pagamento" : ORDER_STATUS_LABEL[order.status]}
          </h1>
        </div>
        <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
      </div>

      {order.status === "PAID" && (
        <Alert tone="success" title="Tudo certo com a sua compra">
          <CircleCheck className="mr-1 inline h-4 w-4" /> Pago em {dateTime(order.paidAt)}. Os vouchers ficam disponíveis nesta página assim que cada reserva for confirmada.
        </Alert>
      )}

      {pending && order.paymentMethod === "PIX" && pix && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><QrCode className="h-5 w-5 text-accent-ink" /> Pague com Pix</span>} subtitle={`Valor: ${brl(order.amountCharged)}`} />
          <CardBody>
            {pixExpired ? (
              <Alert tone="warning" title="Este Pix expirou">
                Volte ao checkout para gerar um novo código.{" "}
                <a className="font-semibold underline" href={`/loja/${slug}/carrinho`}>
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
                    {(i.category === "LODGING" || i.category === "HOUSES") && (
                      <a href={`/loja/${slug}/pedido/${order.id}/voucher/${i.id}`} className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white hover:bg-ink-2">
                        Ver voucher
                      </a>
                    )}
                  </p>
                ) : i.supplierStatus === "CANCELLED" ? (
                  <p className="mt-1 text-xs font-semibold text-red-700">Reserva cancelada</p>
                ) : order.status === "PAID" && (order.paymentData as { simulated?: boolean } | null)?.simulated ? (
                  <p className="mt-1 text-xs font-semibold text-amber-800">Pagamento de teste — nenhuma reserva é feita no fornecedor</p>
                ) : order.status === "PAID" ? (
                  <p className="mt-1 text-xs font-semibold text-muted">Reserva em processamento — você recebe a confirmação em breve</p>
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
            <span className="font-semibold">Total {order.paymentMethod === "PIX" ? "no Pix" : `no cartão (${order.installments}x sem juros)`}</span>
            <span className="font-semibold tabular">{brl(order.amountCharged)}</span>
          </div>
          {card && <p className="mt-1 text-xs text-muted">{card.brand} final {card.last4}</p>}
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
