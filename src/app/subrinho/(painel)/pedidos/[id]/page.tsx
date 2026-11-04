import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DetailRow,
  EmptyState,
  Field,
  Stat,
  Table,
  Td,
  Th,
  THead,
  Textarea,
  Tr,
  buttonClass,
} from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import type { PersonData } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { getOrderForSubrinho } from "@/server/orders/queries";
import { orderDetailExtras } from "@/server/subrinho/orders";
import type { CouponSnapshot } from "@/server/subrinho/coupons";
import { d } from "@/server/pricing/money";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { brl, date, dateTime, fxRate, orderNumber, pct } from "@/lib/format";
import { Fit, InfoList, JsonDetails, OrderStatusBadge, PayoutStatusBadge, SectionTitle } from "../../../_components/bits";
import { isUuid } from "../../../_lib/form";
import { canDo, EVENT_LABEL, PAYMENT_METHOD_LABEL, PERMS, USER_TYPE_LABEL, VIEW_PAGE_LABEL } from "../../../_lib/labels";
import { cancelOrderAction, confirmPaymentAction } from "./actions";
import { ItemBreakdown } from "./item-breakdown";
import { needsControlledIssue } from "@/server/bookings/service";

export const metadata = { title: "Detalhe do pedido" };

/** Remove/mascara qualquer dado sensível de cartão que um gateway possa ter gravado. */
function sanitize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) =>
        /^(number|card_?number|pan|cvv|cvc|security_?code|expiry|exp_?(month|year)?|token)$/i.test(k) ? [k, "•••"] : [k, sanitize(val)],
      ),
    );
  }
  if (typeof v === "string") return v.replace(/\d{12,19}/g, (m) => `${"•".repeat(m.length - 4)}${m.slice(-4)}`);
  return v;
}

function Person({ p, extra }: { p: PersonData | null | undefined; extra?: ReactNode }) {
  if (!p) return <p className="text-sm text-muted">—</p>;
  const a = p.address;
  const address = a ? [a.street && `${a.street}${a.number ? `, ${a.number}` : ""}`, a.complement, a.district, a.city && `${a.city}${a.state ? `/${a.state}` : ""}`, a.zip, a.country].filter(Boolean).join(" · ") : null;
  return (
    <div className="space-y-0.5 text-sm">
      <p className="font-semibold text-ink">{p.name}</p>
      {p.email && <p className="break-all">{p.email}</p>}
      {p.phone && <p>{p.phone}</p>}
      {p.document && <p>CPF/CNPJ: {p.document}</p>}
      {p.birthDate && <p>Nascimento: {date(p.birthDate)}</p>}
      {address && <p className="text-muted">{address}</p>}
      {extra}
    </div>
  );
}

export default async function SubrinhoOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSubrinhoUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await getOrderForSubrinho(db, id);
  if (!data) notFound();
  const { order: o, affiliate, cart, items, events, views, creator } = data;
  const extras = await orderDetailExtras(db, o, items, events);
  const canAct = canDo(user.role, PERMS.orders);

  const pd = o.paymentData as Record<string, unknown>;
  const card = pd.card as { brand?: string; last4?: string; holder?: string; installments?: number; message?: string; ref?: string } | undefined;
  const pix = pd.pix as { txid?: string; expiresAt?: string; brCode?: string } | undefined;
  const manualBy = typeof pd.manualBy === "string" ? pd.manualBy : null;
  const coupons = (o.couponsSnapshot ?? []) as CouponSnapshot[];
  const fxSnap = Object.entries(o.fxSnapshot ?? {});
  const installmentFeeBrl = d(o.amountCharged).minus(d(o.totalPix));
  const uniqueVisitors = new Set(views.map((v) => v.visitorId ?? v.viewerId ?? v.ipHash ?? v.id)).size;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/subrinho/pedidos" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand-ink">
            ← Pedidos
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Pedido {orderNumber(o.number)} <OrderStatusBadge status={o.status} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/subrinho/afiliados/${affiliate.id}`} className="font-semibold text-ink hover:text-brand-ink">
              {affiliate.name}
            </Link>{" "}
            · criado em {dateTime(o.createdAt)}
            {o.paidAt && <> · pago em {dateTime(o.paidAt)}</>}
            {o.cancelledAt && <> · cancelado em {dateTime(o.cancelledAt)}</>}
          </p>
        </div>
        {o.status === "PENDING_PAYMENT" && canAct && (
          <div className="flex flex-wrap gap-2">
            <Modal
              title="Confirmar pagamento manualmente"
              triggerClassName={buttonClass("primary", "md")}
              trigger={
                <>
                  <CircleCheck className="h-4 w-4" aria-hidden /> Confirmar pagamento
                </>
              }
            >
              <ActionForm action={confirmPaymentAction} className="space-y-4">
                <input type="hidden" name="orderId" value={o.id} />
                <p className="text-sm text-muted">
                  Use quando o pagamento de <strong className="text-ink">{brl(o.amountCharged)}</strong> foi recebido fora do gateway. O pedido passa a
                  <strong className="text-ink"> Pago</strong> e o repasse é agendado. Itens de fornecedores com API real (hotéis) ficam “Aguardando emissão” — emita a reserva em cada item.
                </p>
                <Field label="Observação (opcional)">
                  <Textarea name="note" maxLength={500} placeholder="Ex.: Pix conferido no extrato do dia" />
                </Field>
                <SubmitButton pendingText="Confirmando…">Confirmar pagamento</SubmitButton>
              </ActionForm>
            </Modal>
            <Modal
              title="Cancelar pedido"
              triggerClassName={buttonClass("danger", "md")}
              trigger={
                <>
                  <CircleX className="h-4 w-4" aria-hidden /> Cancelar pedido
                </>
              }
            >
              <ActionForm action={cancelOrderAction} className="space-y-4">
                <input type="hidden" name="orderId" value={o.id} />
                <p className="text-sm text-muted">O pedido deixa de aguardar pagamento. O carrinho do cliente continua disponível para um novo pedido.</p>
                <Field label="Motivo (opcional)">
                  <Textarea name="reason" maxLength={500} />
                </Field>
                <SubmitButton variant="danger" pendingText="Cancelando…">
                  Cancelar pedido
                </SubmitButton>
              </ActionForm>
            </Modal>
          </div>
        )}
      </div>

      {events.some((e) => e.type === "PAID_AFTER_CANCEL") && (
        <Alert tone="danger" className="mb-6" title="Pagamento recebido após cancelamento">
          Verifique se é necessário estornar este pagamento.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Stat label="Valor cobrado" value={<Fit>{brl(o.amountCharged)}</Fit>} tone="brand" hint={o.paymentMethod === "PIX" ? "Pix" : `Cartão ${o.installments}x`} />
        <Stat label="Custo R$" value={<Fit>{brl(o.totalCostBrl)}</Fit>} />
        <Stat label="Receita Subrinho" value={<Fit>{brl(o.subrinhoRevenue)}</Fit>} tone="dark" />
        <Stat label="Comissão afiliado" value={<Fit>{brl(o.affiliateCommission)}</Fit>} />
        <Stat label="Repasse" value={date(extras.payout?.scheduledDate ?? o.payoutDate)} hint={<PayoutStatusBadge status={extras.payout?.status ?? (o.status === "PAID" ? "OPEN" : null)} />} />
      </div>

      <SectionTitle hint="Preço unitário × quantidade → câmbio → margem Subrinho → margem afiliado → descontos → parcelado.">
        Itens e conta completa ({items.length})
      </SectionTitle>
      <div className="space-y-5">
        {items.map((it, idx) => (
          <ItemBreakdown
            key={it.id}
            item={it}
            index={idx}
            rules={extras.rules}
            paymentMethod={o.paymentMethod}
            booking={{ live: needsControlledIssue(it.supplierCode), orderPaid: o.status === "PAID", canAct }}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Totais do pedido" />
          <CardBody>
            <dl className="divide-y divide-line/60">
              <DetailRow label="Custo R$">{brl(o.totalCostBrl)}</DetailRow>
              <DetailRow label="Margem Subrinho">{brl(o.totalSubrinhoMargin)}</DetailRow>
              <DetailRow label="NET Subrinho" strong>
                {brl(o.totalNetSubrinho)}
              </DetailRow>
              <DetailRow label="Margem afiliado">{brl(o.totalAffiliateMargin)}</DetailRow>
              <DetailRow label="NET Afiliado (PIX sem desconto)" strong>
                {brl(o.totalNetAffiliate)}
              </DetailRow>
              <DetailRow label="Desconto Subrinho">− {brl(o.totalSubrinhoDiscount)}</DetailRow>
              <DetailRow label="Desconto afiliado">− {brl(o.totalAffiliateDiscount)}</DetailRow>
              <DetailRow label="Preço PIX" strong>
                {brl(o.totalPix)}
              </DetailRow>
              <DetailRow label={`Preço parcelado (taxa ${pct(o.installmentFeePct)})`}>{brl(o.totalInstallment)}</DetailRow>
              <DetailRow label="Valor cobrado" strong>
                <span className="text-brand-ink">{brl(o.amountCharged)}</span>
              </DetailRow>
              {installmentFeeBrl.gt(0) && <DetailRow label="Taxa do parcelado embutida">{brl(installmentFeeBrl)}</DetailRow>}
              <DetailRow label="Receita Subrinho" strong>
                {brl(o.subrinhoRevenue)}
              </DetailRow>
              <DetailRow label="Comissão afiliado" strong>
                {brl(o.affiliateCommission)}
              </DetailRow>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pagamento" subtitle={`Provedor: ${o.paymentProvider}`} />
          <CardBody className="space-y-4">
            <InfoList
              items={[
                { label: "Forma", value: `${PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}${o.paymentMethod === "CARD" ? ` · ${o.installments}x` : ""}` },
                { label: "Referência", value: <span className="break-all font-mono text-xs">{o.paymentRef ?? "—"}</span> },
                ...(card
                  ? [
                      { label: "Cartão", value: `${card.brand ?? "—"} •••• ${card.last4 ?? "????"}` },
                      { label: "Titular", value: card.holder ?? "—" },
                      { label: "Retorno do gateway", value: card.message ?? "—" },
                    ]
                  : []),
                ...(pix
                  ? [
                      { label: "Pix txid", value: <span className="break-all font-mono text-xs">{pix.txid ?? "—"}</span> },
                      { label: "Pix expira em", value: dateTime(pix.expiresAt) },
                    ]
                  : []),
                { label: "Confirmado em", value: typeof pd.confirmedAt === "string" ? dateTime(pd.confirmedAt) : "—" },
                ...(manualBy ? [{ label: "Confirmado manualmente por", value: extras.staffNames.get(manualBy) ?? manualBy }] : []),
                ...(pd.declined ? [{ label: "Situação", value: <Badge tone="danger">Pagamento recusado</Badge> }] : []),
              ]}
            />
            <JsonDetails label="Dados de pagamento (sanitizados — sem número de cartão)" value={sanitize(pd)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cupons aplicados" />
          {coupons.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">Nenhum cupom neste pedido.</p>
            </CardBody>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Cupom</Th>
                  <Th>Camada</Th>
                  <Th>Regra</Th>
                  <Th className="text-right">Base elegível</Th>
                  <Th className="text-right">Pedido</Th>
                  <Th className="text-right">Aplicado</Th>
                </tr>
              </THead>
              <tbody>
                {coupons.map((c) => (
                  <Tr key={`${c.layer}-${c.id}`}>
                    <Td className="font-semibold">
                      {c.layer === "SUBRINHO" ? (
                        <Link href={`/subrinho/cupons/${c.id}`} className="text-brand-ink hover:underline">
                          {c.code}
                        </Link>
                      ) : (
                        c.code
                      )}
                    </Td>
                    <Td>
                      <Badge tone={c.layer === "SUBRINHO" ? "brand" : "info"}>{c.layer === "SUBRINHO" ? "Subrinho" : "Afiliado"}</Badge>
                    </Td>
                    <Td className="text-xs">
                      {c.rule}
                      {c.categories?.length ? (
                        <div className="text-muted">{c.categories.map((k) => CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] ?? k).join(", ")}</div>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular">{c.eligibleSubtotal ? brl(c.eligibleSubtotal) : "—"}</Td>
                    <Td className="text-right tabular">{c.requested ? brl(c.requested) : "—"}</Td>
                    <Td className="text-right font-semibold tabular">
                      {brl(c.applied)}
                      {c.limitedByMargin && <div className="text-[11px] font-semibold text-amber-700">limitado pela margem</div>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Câmbio congelado no pedido" />
          {fxSnap.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">Sem cotações registradas.</p>
            </CardBody>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Moeda</Th>
                  <Th className="text-right">Cotação</Th>
                  <Th>Fonte</Th>
                  <Th>Obtida em</Th>
                </tr>
              </THead>
              <tbody>
                {fxSnap.map(([cur, r]) => (
                  <Tr key={cur}>
                    <Td className="font-semibold">{cur} → BRL</Td>
                    <Td className="text-right font-semibold tabular">{fxRate(r.rate)}</Td>
                    <Td>{r.source}</Td>
                    <Td className="whitespace-nowrap">{dateTime(r.fetchedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <SectionTitle>Pessoas</SectionTitle>
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader title="Cliente (conta)" subtitle="Quem tem a conta na loja" />
          <CardBody>
            <Person
              p={o.customerData}
              extra={extras.account ? <p className="pt-1 text-xs text-muted">Conta criada em {dateTime(extras.account.createdAt)}</p> : null}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pagador" subtitle="Quem pagou" />
          <CardBody>
            <Person p={o.payerData} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Viajantes (${o.travelers.length})`} />
          <CardBody className="space-y-3">
            {o.travelers.length === 0 ? (
              <p className="text-sm text-muted">Nenhum viajante informado.</p>
            ) : (
              o.travelers.map((t, idx) => (
                <div key={idx} className="border-b border-line/60 pb-2 last:border-0 last:pb-0">
                  <Person p={t} />
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <SectionTitle>Carrinho e acessos</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader title="Carrinho" />
          <CardBody className="space-y-4">
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: "Criado em", value: dateTime(o.cartCreatedAt) },
                {
                  label: "Quem gerou",
                  value: creator ? (
                    <>
                      {creator.name} <span className="text-xs text-muted">({creator.type} · {creator.email})</span>
                    </>
                  ) : o.cartCreatedByType ? (
                    USER_TYPE_LABEL[o.cartCreatedByType]
                  ) : (
                    "Visitante anônimo"
                  ),
                },
                {
                  label: "Finalizado por",
                  value: extras.placedBy ? `${extras.placedBy.name} (agência, ${extras.placedBy.role}) — modo ADMIN` : "O próprio cliente",
                },
                { label: "Acessos até o pedido", value: o.cartViewCountAtOrder },
                { label: "Acessos totais", value: `${cart.viewCount} · ${uniqueVisitors} visitante(s) distinto(s)` },
                { label: "Último acesso", value: dateTime(cart.lastViewedAt) },
                { label: "Status do carrinho", value: cart.status === "CONVERTED" ? `Convertido em ${dateTime(cart.convertedAt)}` : "Aberto" },
                {
                  label: "Link do carrinho",
                  value: (
                    <Link href={`/loja/${affiliate.slug}/carrinho/${cart.token}`} className="break-all font-mono text-xs text-brand-ink hover:underline" target="_blank">
                      /loja/{affiliate.slug}/carrinho/{cart.token}
                    </Link>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Acessos ao carrinho (${views.length}${views.length >= 200 ? "+" : ""})`} />
          {views.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">Nenhum acesso registrado.</p>
            </CardBody>
          ) : (
            <Table className="max-h-96 overflow-y-auto">
              <THead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Página</Th>
                  <Th>Quem</Th>
                  <Th>Visitante</Th>
                  <Th>Navegador</Th>
                </tr>
              </THead>
              <tbody>
                {views.map((v) => (
                  <Tr key={v.id}>
                    <Td className="whitespace-nowrap">{dateTime(v.viewedAt)}</Td>
                    <Td>{VIEW_PAGE_LABEL[v.page] ?? v.page}</Td>
                    <Td>{v.viewerType ? USER_TYPE_LABEL[v.viewerType] : "Anônimo"}</Td>
                    <Td className="font-mono text-xs">{(v.visitorId ?? v.ipHash ?? "—").slice(0, 10)}</Td>
                    <Td className="max-w-[16rem] truncate text-xs text-muted" title={v.userAgent ?? undefined}>
                      {v.userAgent ?? "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Repasse ao afiliado" />
            <CardBody>
              <InfoList
                className="sm:grid-cols-1"
                items={[
                  { label: "Data prevista", value: date(extras.payout?.scheduledDate ?? o.payoutDate) },
                  { label: "Status", value: <PayoutStatusBadge status={extras.payout?.status ?? (o.status === "PAID" ? "OPEN" : null)} /> },
                  ...(extras.payout
                    ? [
                        { label: "Quinzena", value: `${date(extras.payout.periodStart)} a ${date(extras.payout.periodEnd)}` },
                        { label: "Pago em", value: dateTime(extras.payout.paidAt) },
                      ]
                    : []),
                ]}
              />
              {extras.payout && (
                <ButtonLink href={`/subrinho/repasses?afiliado=${o.affiliateId}&quinzena=${extras.payout.periodStart}`} variant="outline" size="sm" className="mt-4">
                  Ver repasse
                </ButtonLink>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Origem da compra" />
            <CardBody>
              <InfoList
                className="sm:grid-cols-1"
                items={[
                  { label: "IP", value: <span className="font-mono text-xs">{o.ip ?? "—"}</span> },
                  { label: "Navegador (user agent)", value: <span className="break-all text-xs">{o.userAgent ?? "—"}</span> },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Linha do tempo" />
          {events.length === 0 ? (
            <EmptyState title="Sem eventos" />
          ) : (
            <CardBody>
              <ol className="relative space-y-4 border-l-2 border-brand-100 pl-5">
                {events.map((e) => {
                  const by = typeof e.data?.by === "string" ? (extras.staffNames.get(e.data.by) ?? String(e.data.byName ?? e.data.by)) : null;
                  const rest = Object.fromEntries(Object.entries(e.data ?? {}).filter(([k]) => k !== "by" && k !== "byName"));
                  return (
                    <li key={e.id} className="relative">
                      <span
                        className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                          e.type === "PAID" || e.type === "MANUAL_PAYMENT" ? "bg-emerald-500" : e.type.includes("FAIL") || e.type.includes("DECLIN") || e.type.includes("CANCEL") ? "bg-red-500" : "bg-brand"
                        }`}
                        aria-hidden
                      />
                      <p className="text-sm font-semibold text-ink">{EVENT_LABEL[e.type] ?? e.type}</p>
                      <p className="text-xs text-muted">
                        {dateTime(e.createdAt)}
                        {by && <> · por {by}</>}
                      </p>
                      {Object.keys(rest).length > 0 && (
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-surface/60 px-2 py-1 text-[11px] text-ink">{JSON.stringify(sanitize(rest), null, 1)}</pre>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
