import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, ExternalLink, Receipt, ShieldCheck, ShoppingCart, Wallet } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, buttonClass, statusTone } from "@/components/ui";
import { brl, date, dateTime, ORDER_STATUS_LABEL, orderNumber, PAYOUT_STATUS_LABEL } from "@/lib/format";
import { addDays, startOfLocalDay, todayLocal } from "@/lib/tz";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { listCartsForAffiliate, listOrdersForAffiliate } from "@/server/orders/queries";
import { fortnightOf } from "@/server/payouts/calendar";
import { payoutDateForPeriod } from "@/server/payouts/service";
import { sum } from "@/server/pricing/money";
import { affiliatePayoutsOverview } from "@/server/afiliado/payouts";
import { firstName, fortnightLabel, monthShort, paymentLabel, storePath } from "../_lib/helpers";

export const metadata: Metadata = { title: "Início" };

export default async function AfiliadoDashboardPage() {
  const { user, affiliate } = await requireAffiliateUser();
  const isAdmin = user.role === "ADMIN";
  const f = fortnightOf(todayLocal());

  const [fortnightPayoutDate, recentPaid, latest, openCarts, payouts] = await Promise.all([
    payoutDateForPeriod(db, f),
    // Busca por data de criação com folga e filtra pela data de PAGAMENTO (regra da quinzena).
    listOrdersForAffiliate(db, affiliate.id, { status: "PAID", from: addDays(f.start, -7), limit: 2000 }),
    listOrdersForAffiliate(db, affiliate.id, { limit: 6 }),
    listCartsForAffiliate(db, affiliate.id, { status: "OPEN", limit: 2000 }),
    affiliatePayoutsOverview(db, affiliate.id),
  ]);

  const from = startOfLocalDay(f.start);
  const to = startOfLocalDay(addDays(f.end, 1));
  const fortnightOrders = recentPaid.filter((o) => o.paidAt && o.paidAt >= from && o.paidAt < to);
  const fortnightSales = sum(fortnightOrders.map((o) => o.amountPaid));
  const fortnightCommission = sum(fortnightOrders.map((o) => o.commission));
  const cartsWithItems = openCarts.filter((c) => c.items > 0).length;
  const nextPayouts = payouts.upcoming.slice(0, 4);

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName(user.name)}!`}
        subtitle={`Resumo da ${affiliate.name}.`}
        actions={
          <>
            <a href={storePath(affiliate.slug)} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Abrir minha loja
            </a>
            <ButtonLink href="/afiliado/pedidos" variant="outline">
              Ver pedidos
            </ButtonLink>
          </>
        }
      />

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat
          className="xl:col-span-2"
          label="Vendas pagas na quinzena"
          value={brl(fortnightSales.toFixed(2))}
          hint={`${fortnightOrders.length} pedido${fortnightOrders.length === 1 ? "" : "s"} · ${fortnightLabel(f.start, f.end)}`}
          icon={<Receipt className="h-4 w-4" aria-hidden />}
        />
        <Stat
          className="xl:col-span-2"
          tone="brand"
          label="Sua comissão na quinzena"
          value={brl(fortnightCommission.toFixed(2))}
          hint={`Repasse previsto em ${date(fortnightPayoutDate)}`}
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        />
        <Stat
          className="xl:col-span-2"
          label="Total a receber"
          value={brl(payouts.toReceive)}
          hint="Repasses agendados + quinzenas em aberto"
          icon={<Wallet className="h-4 w-4" aria-hidden />}
        />
        <Stat className="xl:col-span-3" tone="dark" label="Total recebido" value={brl(payouts.receivedTotal)} hint="Repasses já pagos pela Subrinho" />
        <Stat
          className="sm:col-span-2 xl:col-span-3"
          label="Carrinhos abertos"
          value={openCarts.length}
          hint={`${cartsWithItems} com itens ativos`}
          icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
        />
      </section>

      <Alert tone="info" className="mt-6" title={isAdmin ? "Modo ADMIN na loja" : "Dica: monte carrinhos para seus clientes"}>
        {isAdmin ? (
          <>
            Entre na <strong>sua loja</strong> com o mesmo e-mail e senha deste painel e ative o <strong>modo ADMIN</strong>: no checkout você
            pode alterar a sua margem de cada item somente naquele carrinho (por exemplo, para fazer um preço especial para um cliente).
          </>
        ) : (
          <>
            Entre na sua loja com o seu acesso da agência, monte o carrinho e compartilhe o link com o cliente — o carrinho nunca expira. Somente
            usuários <strong>ADMIN</strong> podem entrar em modo ADMIN para alterar margens no checkout.
          </>
        )}
      </Alert>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Últimos pedidos"
            subtitle="Pedidos mais recentes da sua loja"
            actions={
              <Link href="/afiliado/pedidos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink hover:text-brand-700">
                Ver todos <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          {latest.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-10 w-10" aria-hidden />}
              title="Nenhum pedido ainda"
              description="Compartilhe sua loja e os links de carrinho com seus clientes para começar a vender."
            />
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((o) => (
                <li key={o.id}>
                  <Link href={`/afiliado/pedidos/${o.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface/50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {orderNumber(o.number)} <span className="font-semibold text-muted">· {o.customerName}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {o.paidAt ? `Pago em ${dateTime(o.paidAt)}` : `Criado em ${dateTime(o.createdAt)}`} · {paymentLabel(o.paymentMethod, o.installments)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-semibold tabular text-ink">{brl(o.amountPaid)}</p>
                        <p className="text-xs font-semibold tabular text-success">+ {brl(o.commission)}</p>
                      </div>
                      <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Próximos repasses"
            subtitle="Sua comissão é paga 5 dias úteis após o fechamento da quinzena"
            actions={
              <Link href="/afiliado/financeiro" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink hover:text-brand-700">
                Financeiro <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          {nextPayouts.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-10 w-10" aria-hidden />}
              title="Nenhum repasse previsto"
              description="Assim que uma venda for paga, o repasse da sua comissão aparece aqui."
            />
          ) : (
            <ul className="divide-y divide-line">
              {nextPayouts.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 leading-none text-brand-700" aria-hidden>
                      <span className="text-lg font-semibold">{p.date ? p.date.slice(8, 10) : "—"}</span>
                      {p.date && <span className="mt-0.5 text-[10px] font-semibold uppercase">{monthShort(p.date)}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{p.date ? date(p.date) : "Data a definir"}</p>
                      <p className="truncate text-xs text-muted">
                        {fortnightLabel(p.periodStart, p.periodEnd)} · {p.orders} pedido{p.orders === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular text-ink">{brl(p.amount)}</p>
                    <Badge tone={p.status === "SCHEDULED" ? "info" : "warning"}>{PAYOUT_STATUS_LABEL[p.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isAdmin && (
        <p className="mt-6 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 text-brand-ink" aria-hidden />
          Você é ADMIN desta agência: pode alterar margens, cupons, dados da loja e usuários.
        </p>
      )}
    </>
  );
}
