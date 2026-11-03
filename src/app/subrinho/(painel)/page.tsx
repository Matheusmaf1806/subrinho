import Link from "next/link";
import { ArrowLeftRight, CalendarDays, ChevronRight, Coins, HandCoins, Receipt, ShoppingBag, TicketPercent, TrendingUp } from "lucide-react";
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listOrdersForSubrinho } from "@/server/orders/queries";
import { getCurrentFx, FOREIGN_CURRENCIES } from "@/server/fx";
import { lastClosedFortnight } from "@/server/payouts/calendar";
import {
  currentPeriods,
  fortnightReportFor,
  openPayoutForecast,
  paidKpis,
  pendingPaymentCount,
  upcomingPayouts,
  type Kpis,
} from "@/server/subrinho/dashboard";
import { brl, date, dateTime, fxRate, orderNumber } from "@/lib/format";
import { Fit, OrderStatusBadge } from "../_components/bits";
import { periodLabel } from "../_lib/dates";
import { canDo, CURRENCY_LABEL, PERMS } from "../_lib/labels";
import { closeFortnightAction } from "./relatorios/actions";

export const metadata = { title: "Visão geral" };

function KpiGrid({ k }: { k: Kpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
      <Stat label="GMV cobrado" value={<Fit>{brl(k.gmv)}</Fit>} tone="brand" icon={<TrendingUp className="h-4 w-4" aria-hidden />} hint={`Custo ${brl(k.costBrl)}`} />
      <Stat label="Receita Subrinho" value={<Fit>{brl(k.subrinhoRevenue)}</Fit>} tone="dark" icon={<Coins className="h-4 w-4" aria-hidden />} hint="Margem − descontos Subrinho" />
      <Stat label="Comissões afiliados" value={<Fit>{brl(k.affiliateCommission)}</Fit>} icon={<HandCoins className="h-4 w-4 text-muted" aria-hidden />} />
      <Stat
        label="Descontos"
        value={<Fit>{brl(k.discounts)}</Fit>}
        icon={<TicketPercent className="h-4 w-4 text-muted" aria-hidden />}
        hint={`Subrinho ${brl(k.subrinhoDiscount)} · Afiliado ${brl(k.affiliateDiscount)}`}
      />
      <Stat label="Pedidos pagos" value={k.orders} icon={<ShoppingBag className="h-4 w-4 text-muted" aria-hidden />} />
      <Stat label="Ticket médio" value={<Fit>{brl(k.avgTicket)}</Fit>} icon={<Receipt className="h-4 w-4 text-muted" aria-hidden />} />
    </div>
  );
}

export default async function SubrinhoDashboardPage() {
  const user = await requireSubrinhoUser();
  const p = currentPeriods();
  const lastClosed = lastClosedFortnight(p.today);

  const [fortnightK, monthK, fx, recent, upcoming, forecast, lastReport, pending] = await Promise.all([
    paidKpis(db, p.fortnight.start, p.fortnight.end),
    paidKpis(db, p.month.start, p.month.end),
    getCurrentFx(db),
    listOrdersForSubrinho(db, { limit: 8 }),
    upcomingPayouts(db, 8),
    openPayoutForecast(db),
    fortnightReportFor(db, lastClosed.start),
    pendingPaymentCount(db),
  ]);
  const monthName = new Date(`${p.month.start}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}!`}
        subtitle="Resumo das vendas, câmbio e repasses de todas as lojas."
        actions={
          <ButtonLink href="/subrinho/pedidos" variant="outline">
            Ver pedidos
          </ButtonLink>
        }
      />

      {!lastReport && (
        <Alert tone="warning" className="mb-6" title={`A quinzena ${periodLabel(lastClosed.start, lastClosed.end)} ainda não foi fechada`}>
          <p>O relatório e os repasses dessa quinzena ainda não foram gerados.</p>
          {canDo(user.role, PERMS.reports) ? (
            <ActionForm action={closeFortnightAction} className="mt-3">
              <input type="hidden" name="date" value={lastClosed.start} />
              <SubmitButton size="sm" pendingText="Fechando…">
                Fechar quinzena agora
              </SubmitButton>
            </ActionForm>
          ) : (
            <p className="mt-1 text-xs">Peça ao financeiro para fechar a quinzena.</p>
          )}
        </Alert>
      )}
      {pending > 0 && (
        <Alert tone="info" className="mb-6">
          <Link href="/subrinho/pedidos?status=PENDING_PAYMENT" className="font-semibold underline-offset-2 hover:underline">
            {pending} pedido(s) aguardando pagamento
          </Link>
        </Alert>
      )}

      <section aria-labelledby="kpi-fortnight" className="mb-8">
        <h2 id="kpi-fortnight" className="mb-3 flex flex-wrap items-baseline gap-2 text-lg font-semibold text-ink">
          Quinzena atual <span className="text-sm font-semibold text-muted">{periodLabel(p.fortnight.start, p.fortnight.end)}</span>
        </h2>
        <KpiGrid k={fortnightK} />
      </section>

      <section aria-labelledby="kpi-month" className="mb-8">
        <h2 id="kpi-month" className="mb-3 flex flex-wrap items-baseline gap-2 text-lg font-semibold text-ink">
          Mês atual <span className="text-sm font-semibold capitalize text-muted">{monthName}</span>
        </h2>
        <KpiGrid k={monthK} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Câmbio vigente"
            subtitle="Usado em todos os preços novos"
            actions={
              <ButtonLink href="/subrinho/cambio" variant="ghost" size="sm" aria-label="Gerenciar câmbio">
                <ArrowLeftRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            }
          />
          <CardBody className="space-y-3">
            {FOREIGN_CURRENCIES.map((c) => {
              const r = fx[c];
              return (
                <div key={c} className="flex items-center justify-between rounded-xl bg-surface/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{CURRENCY_LABEL[c]}</p>
                    <p className="text-xs text-muted">{r ? `${r.source} · ${dateTime(r.fetchedAt)}` : "Sem cotação cadastrada"}</p>
                  </div>
                  <p className="text-xl font-semibold tabular text-ink">{r ? `R$ ${fxRate(r.rate)}` : "—"}</p>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Próximos repasses"
            subtitle="Agendados (quinzenas fechadas) e previsão da quinzena em aberto"
            actions={
              <ButtonLink href="/subrinho/repasses" variant="ghost" size="sm">
                Repasses <ChevronRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            }
          />
          {upcoming.length === 0 && forecast.length === 0 ? (
            <EmptyState title="Nenhum repasse pendente" icon={<CalendarDays className="h-10 w-10" />} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Afiliado</Th>
                  <Th>Quinzena</Th>
                  <Th>Data prevista</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </THead>
              <tbody>
                {upcoming.map((u) => (
                  <Tr key={u.id}>
                    <Td className="font-semibold">{u.affiliateName}</Td>
                    <Td className="whitespace-nowrap">{periodLabel(u.periodStart, u.periodEnd)}</Td>
                    <Td className="whitespace-nowrap">
                      {date(u.scheduledDate)} <span className="ml-1 text-xs font-semibold text-amber-700">Agendado</span>
                    </Td>
                    <Td className="text-right tabular">{u.ordersCount}</Td>
                    <Td className="text-right font-semibold tabular">{brl(u.amount)}</Td>
                  </Tr>
                ))}
                {forecast.map((f) => (
                  <Tr key={`${f.affiliateId}-${f.payoutDate}`}>
                    <Td className="font-semibold">{f.affiliateName}</Td>
                    <Td className="text-muted">Em aberto</Td>
                    <Td className="whitespace-nowrap">
                      {date(f.payoutDate)} <span className="ml-1 text-xs font-semibold text-muted">Previsão</span>
                    </Td>
                    <Td className="text-right tabular">{f.orders}</Td>
                    <Td className="text-right font-semibold tabular text-muted">{brl(f.amount)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Últimos pedidos"
          actions={
            <ButtonLink href="/subrinho/pedidos" variant="ghost" size="sm">
              Todos <ChevronRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          }
        />
        {recent.length === 0 ? (
          <EmptyState title="Nenhum pedido ainda" icon={<ShoppingBag className="h-10 w-10" />} />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Pedido</Th>
                <Th>Afiliado</Th>
                <Th>Cliente</Th>
                <Th>Status</Th>
                <Th>Criado em</Th>
                <Th className="text-right">Total cobrado</Th>
                <Th className="text-right">Receita Subrinho</Th>
              </tr>
            </THead>
            <tbody>
              {recent.map(({ order: o, affiliateName }) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`/subrinho/pedidos/${o.id}`} className="font-semibold text-brand-ink hover:underline">
                      {orderNumber(o.number)}
                    </Link>
                  </Td>
                  <Td>{affiliateName}</Td>
                  <Td>{o.customerData.name}</Td>
                  <Td>
                    <OrderStatusBadge status={o.status} />
                  </Td>
                  <Td className="whitespace-nowrap">{dateTime(o.createdAt)}</Td>
                  <Td className="text-right font-semibold tabular">{brl(o.amountCharged)}</Td>
                  <Td className="text-right tabular">{brl(o.subrinhoRevenue)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
