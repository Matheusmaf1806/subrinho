import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { CalendarClock, CreditCard, Eye, MapPin, QrCode, ShoppingCart, TicketPercent, UserRound, Wallet } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, DetailRow, EmptyState, PageHeader, cn, statusTone } from "@/components/ui";
import { brl, date, dateTime, ORDER_STATUS_LABEL, orderNumber, paxSummary, PAYOUT_STATUS_LABEL, pct } from "@/lib/format";
import { db } from "@/server/db";
import type { PaxConfig, PersonData } from "@/server/db/schema";
import { requireAffiliateUser } from "@/server/auth/session";
import { getOrderForAffiliate, type AffiliateOrderItemView } from "@/server/orders/queries";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { addressLine, bookingStatusLabel, isUuid, paymentLabel, VIEW_PAGE_LABEL, viewerLabel } from "../../../_lib/helpers";

type Params = Promise<{ id: string }>;

/** Mesma consulta para os metadados e a página (uma ida ao banco por request). */
const loadOrder = cache(async (affiliateId: string, id: string) => (isUuid(id) ? getOrderForAffiliate(db, affiliateId, id) : null));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const s = await requireAffiliateUser();
  const o = await loadOrder(s.affiliate.id, id);
  return { title: o ? `Pedido ${orderNumber(o.number)}` : "Pedido" };
}

export default async function AfiliadoPedidoDetalhePage({ params }: { params: Params }) {
  const { id } = await params;
  const { affiliate } = await requireAffiliateUser();
  const o = await loadOrder(affiliate.id, id);
  if (!o) notFound();

  const creator = o.cart.createdBy;
  const payoutTone = o.payout.status === "PAID" ? "success" : o.payout.status === "SCHEDULED" ? "info" : o.payout.status === "CANCELLED" ? "danger" : "warning";

  return (
    <>
      <PageHeader
        back={{ href: "/afiliado/pedidos", label: "Pedidos" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Pedido {orderNumber(o.number)}
            <Badge tone={statusTone(o.status)} className="text-sm">
              {ORDER_STATUS_LABEL[o.status] ?? o.status}
            </Badge>
          </span>
        }
        subtitle={`Criado em ${dateTime(o.createdAt)}${o.paidAt ? ` · Pago em ${dateTime(o.paidAt)}` : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Itens */}
          <Card>
            <CardHeader title="Itens do pedido" subtitle={`${o.items.length} ${o.items.length === 1 ? "item" : "itens"} · valores pagos pelo cliente e a sua margem em cada um`} />
            <div className="divide-y divide-line">
              {o.items.map((it) => (
                <OrderItem key={it.id} item={it} />
              ))}
            </div>
          </Card>

          {/* Pessoas */}
          <div className="grid gap-6 md:grid-cols-2">
            <PersonCard
              title="Cliente — quem tem a conta"
              subtitle="Usuário da loja que fez o pedido"
              icon={<UserRound className="h-4 w-4" aria-hidden />}
              person={o.customer}
            />
            <PersonCard
              title="Pagador — quem pagou"
              subtitle={o.payer.name === o.customer.name && o.payer.document === o.customer.document ? "Mesma pessoa da conta" : "Pessoa diferente da conta"}
              icon={<Wallet className="h-4 w-4" aria-hidden />}
              person={o.payer}
            />
          </div>

          <Card>
            <CardHeader title="Viajantes" subtitle={o.travelers.length ? `${o.travelers.length} viajante${o.travelers.length === 1 ? "" : "s"}` : undefined} />
            {o.travelers.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">Nenhum viajante informado no checkout.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {o.travelers.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="font-semibold text-ink">
                      {i + 1}. {t.name}
                    </span>
                    <span className="text-muted">
                      {[t.document && `Documento ${t.document}`, t.birthDate && `Nasc. ${date(t.birthDate)}`, t.email, t.phone].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Acessos */}
          <Card>
            <CardHeader
              title="Acessos ao carrinho"
              subtitle={`${o.cart.viewCount} acesso${o.cart.viewCount === 1 ? "" : "s"} · ${o.cart.uniqueVisitors} visitante${o.cart.uniqueVisitors === 1 ? "" : "s"} único${o.cart.uniqueVisitors === 1 ? "" : "s"}`}
            />
            {o.cart.views.length === 0 ? (
              <EmptyState icon={<Eye className="h-8 w-8" aria-hidden />} title="Nenhum acesso registrado" />
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {o.cart.views.map((v, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span className="tabular text-ink">{dateTime(v.viewedAt)}</span>
                    <span className="flex items-center gap-2">
                      <Badge>{VIEW_PAGE_LABEL[v.page] ?? v.page}</Badge>
                      <span className="text-muted">{viewerLabel(v.viewerType)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {o.cart.views.length >= 100 && <p className="border-t border-line px-5 py-2 text-xs text-muted">Mostrando os 100 acessos mais recentes.</p>}
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Resumo" />
            <CardBody>
              <dl>
                <DetailRow label="Valor pago" strong>
                  {brl(o.totals.amountPaid)}
                </DetailRow>
                <DetailRow label="Total no PIX">{brl(o.totals.totalPix)}</DetailRow>
                <DetailRow label="Total parcelado">{brl(o.totals.totalInstallment)}</DetailRow>
                <DetailRow label="Desconto do afiliado (cupom)">{Number(o.totals.affiliateDiscount) > 0 ? `− ${brl(o.totals.affiliateDiscount)}` : brl(0)}</DetailRow>
              </dl>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                <span className="text-sm font-semibold text-emerald-800">Sua comissão</span>
                <span className="text-xl font-semibold tabular text-emerald-700">{brl(o.totals.commission)}</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pagamento" />
            <CardBody>
              <dl>
                <DetailRow label="Forma de pagamento">
                  <span className="inline-flex items-center gap-1.5">
                    {o.payment.method === "PIX" ? <QrCode className="h-4 w-4 text-muted" aria-hidden /> : <CreditCard className="h-4 w-4 text-muted" aria-hidden />}
                    {paymentLabel(o.payment.method, o.payment.installments)}
                  </span>
                </DetailRow>
                {o.payment.method === "CARD" && (
                  <DetailRow label="Cartão">{[o.payment.brand, o.payment.last4 && `final ${o.payment.last4}`].filter(Boolean).join(" · ") || "—"}</DetailRow>
                )}
                <DetailRow label="Valor cobrado">{brl(o.payment.amountPaid)}</DetailRow>
                <DetailRow label="Pago em">{o.paidAt ? dateTime(o.paidAt) : "—"}</DetailRow>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Repasse da comissão" />
            <CardBody>
              {o.payout.status ? (
                <dl>
                  <DetailRow label="Data do repasse" strong>
                    {date(o.payout.date)}
                  </DetailRow>
                  <DetailRow label="Status">
                    <Badge tone={payoutTone}>{PAYOUT_STATUS_LABEL[o.payout.status] ?? o.payout.status}</Badge>
                  </DetailRow>
                  {o.payout.paidAt && <DetailRow label="Repassado em">{dateTime(o.payout.paidAt)}</DetailRow>}
                </dl>
              ) : (
                <p className="text-sm text-muted">O repasse é agendado quando o pagamento do pedido é confirmado.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cupom da agência" />
            <CardBody>
              {o.coupons.length === 0 ? (
                <p className="text-sm text-muted">Nenhum cupom da agência aplicado.</p>
              ) : (
                <ul className="space-y-2">
                  {o.coupons.map((c) => (
                    <li key={c.code} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="inline-flex items-center gap-1.5 font-semibold text-ink">
                          <TicketPercent className="h-4 w-4 text-brand-ink" aria-hidden /> {c.code}
                        </p>
                        <p className="text-xs text-muted">{c.rule}</p>
                      </div>
                      <span className="font-semibold tabular text-ink">− {brl(c.applied)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Linha do tempo" />
            <CardBody>
              <ol className="relative space-y-5 border-l-2 border-brand-100 pl-5">
                <TimelineItem icon={<ShoppingCart className="h-3.5 w-3.5" aria-hidden />} title="Carrinho criado" when={dateTime(o.cart.createdAt)}>
                  {creator ? (
                    <>
                      por <strong className="text-ink">{creator.name}</strong> ({creator.type === "Agência" ? "agência" : "cliente"})
                      {creator.email && <span className="block">{creator.email}</span>}
                    </>
                  ) : (
                    "por um visitante sem login"
                  )}
                </TimelineItem>
                <TimelineItem icon={<Eye className="h-3.5 w-3.5" aria-hidden />} title={`${o.cart.viewCount} acesso${o.cart.viewCount === 1 ? "" : "s"} ao carrinho`} when={o.cart.lastViewedAt ? `Último: ${dateTime(o.cart.lastViewedAt)}` : undefined}>
                  {o.cart.uniqueVisitors} visitante{o.cart.uniqueVisitors === 1 ? "" : "s"} único{o.cart.uniqueVisitors === 1 ? "" : "s"}
                </TimelineItem>
                <TimelineItem icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />} title="Pedido criado" when={dateTime(o.createdAt)} />
                <TimelineItem
                  icon={<Wallet className="h-3.5 w-3.5" aria-hidden />}
                  title={o.paidAt ? "Pagamento confirmado" : ORDER_STATUS_LABEL[o.status] ?? o.status}
                  when={o.paidAt ? dateTime(o.paidAt) : undefined}
                  done={!!o.paidAt}
                />
                {o.payout.date && (
                  <TimelineItem
                    icon={<Wallet className="h-3.5 w-3.5" aria-hidden />}
                    title={o.payout.status === "PAID" ? "Comissão repassada" : "Repasse previsto"}
                    when={o.payout.paidAt ? dateTime(o.payout.paidAt) : date(o.payout.date)}
                    done={o.payout.status === "PAID"}
                  />
                )}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function OrderItem({ item: it }: { item: AffiliateOrderItemView }) {
  const qty = it.lines.length
    ? it.lines.map((l) => `${l.quantity}× ${l.label}`).join(" · ")
    : paxSummary(it.pax as Partial<PaxConfig> | null);
  const booking = bookingStatusLabel(it.bookingStatus);
  const discount = Number(it.affiliateDiscount);
  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{CATEGORY_LABEL[it.category as keyof typeof CATEGORY_LABEL] ?? it.category}</p>
          <h3 className="mt-0.5 text-base font-semibold text-ink">{it.title}</h3>
          {it.subtitle && <p className="text-sm font-semibold text-ink">{it.subtitle}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {it.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {it.location}
              </span>
            )}
            {it.serviceDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {date(it.serviceDate)}
                {it.serviceEndDate && ` → ${date(it.serviceEndDate)}`}
              </span>
            )}
          </p>
          {qty && <p className="mt-1 text-sm text-ink">{qty}</p>}
        </div>
        <div className="text-right">
          <Badge tone={booking.tone}>{booking.label}</Badge>
          {it.bookingRef && <p className="mt-1 text-xs text-muted">Localizador: <span className="font-semibold text-ink">{it.bookingRef}</span></p>}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric label="Preço pago" value={brl(it.pricePaid)} />
        <Metric
          label="Sua margem"
          value={pct(it.affiliateMarginPct)}
          extra={
            it.affiliateMarginSource === "OVERRIDE" ? (
              <Badge tone="warning">alterada no checkout</Badge>
            ) : it.affiliateMarginSource === "FALLBACK" ? (
              <Badge>padrão da plataforma</Badge>
            ) : null
          }
        />
        <Metric label="Desconto do afiliado" value={discount > 0 ? `− ${brl(it.affiliateDiscount)}` : brl(0)} />
        <Metric label="Margem efetiva" value={pct(it.effectiveAffiliateMarginPct)} />
        <Metric label="Comissão" value={brl(it.commission)} highlight />
      </dl>
    </article>
  );
}

function Metric({ label, value, extra, highlight }: { label: string; value: ReactNode; extra?: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl px-3 py-2", highlight ? "bg-emerald-50" : "bg-surface/70")}>
      <dt className={cn("text-[11px] font-semibold uppercase tracking-wide", highlight ? "text-emerald-800" : "text-muted")}>{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-semibold tabular", highlight ? "text-emerald-700" : "text-ink")}>{value}</dd>
      {extra && <dd className="mt-1">{extra}</dd>}
    </div>
  );
}

function PersonCard({ title, subtitle, icon, person }: { title: string; subtitle?: string; icon: ReactNode; person: PersonData }) {
  const address = addressLine(person.address);
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-ink">{icon}</span>
            {title}
          </span>
        }
        subtitle={subtitle}
      />
      <CardBody>
        <dl>
          <DetailRow label="Nome">{person.name}</DetailRow>
          <DetailRow label="E-mail">{person.email ? <span className="break-all">{person.email}</span> : "—"}</DetailRow>
          <DetailRow label="Telefone">{person.phone || "—"}</DetailRow>
          <DetailRow label="CPF/CNPJ">{person.document || "—"}</DetailRow>
          {person.birthDate && <DetailRow label="Nascimento">{date(person.birthDate)}</DetailRow>}
          {address && <DetailRow label="Endereço">{address}</DetailRow>}
        </dl>
      </CardBody>
    </Card>
  );
}

function TimelineItem({ icon, title, when, children, done = true }: { icon: ReactNode; title: string; when?: string; children?: ReactNode; done?: boolean }) {
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[31px] top-0 grid h-5 w-5 place-items-center rounded-full ring-4 ring-white",
          done ? "bg-brand text-white" : "bg-surface-2 text-muted",
        )}
      >
        {icon}
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {when && <p className="text-xs font-semibold text-muted">{when}</p>}
      {children && <div className="mt-0.5 text-xs text-muted">{children}</div>}
    </li>
  );
}
