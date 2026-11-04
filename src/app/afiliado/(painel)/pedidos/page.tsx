import { DateInput } from "@/components/date-picker";
import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Search } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th, THead, Tr, buttonClass, statusTone } from "@/components/ui";
import { brl, date, dateTime, ORDER_STATUS_LABEL, orderNumber, PAYOUT_STATUS_LABEL } from "@/lib/format";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { listOrdersForAffiliate } from "@/server/orders/queries";
import { sum } from "@/server/pricing/money";
import { firstParam, isIsoDate, paymentLabel } from "../../_lib/helpers";

export const metadata: Metadata = { title: "Pedidos" };

const PAGE_SIZE = 30;

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AfiliadoPedidosPage({ searchParams }: { searchParams: SP }) {
  const { affiliate } = await requireAffiliateUser();
  const sp = await searchParams;

  const rawStatus = firstParam(sp.status) ?? "ALL";
  const status = rawStatus in ORDER_STATUS_LABEL ? rawStatus : "ALL";
  const de = firstParam(sp.de);
  const ate = firstParam(sp.ate);
  const from = isIsoDate(de) ? de : undefined;
  const to = isIsoDate(ate) ? ate : undefined;
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(firstParam(sp.pagina) ?? "1", 10) || 1);

  const rows = await listOrdersForAffiliate(db, affiliate.id, {
    status,
    from,
    to,
    q: q || undefined,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const hasNext = rows.length > PAGE_SIZE;
  const list = rows.slice(0, PAGE_SIZE);
  const paid = list.filter((o) => o.status === "PAID");
  const filtered = status !== "ALL" || !!from || !!to || !!q;

  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (status !== "ALL") u.set("status", status);
    if (from) u.set("de", from);
    if (to) u.set("ate", to);
    if (q) u.set("q", q);
    if (p > 1) u.set("pagina", String(p));
    const s = u.toString();
    return `/afiliado/pedidos${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Pedidos" subtitle="Todas as vendas da sua loja, com o valor pago, a sua comissão e a data do repasse." />

      <Card className="mb-6">
        <form method="get" action="/afiliado/pedidos" className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <Field label="Buscar">
            <Input name="q" defaultValue={q} placeholder="Cliente, pagador, CPF ou nº do pedido" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={status}>
              <option value="ALL">Todos</option>
              {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Criado de">
            <DateInput name="de" defaultValue={from ?? ""} placeholder="Desde o início" />
          </Field>
          <Field label="Até">
            <DateInput name="ate" defaultValue={to ?? ""} placeholder="Até hoje" />
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className={buttonClass("primary", "md", "flex-1 lg:flex-none")}>
              <Search className="h-4 w-4" aria-hidden /> Filtrar
            </button>
            {filtered && (
              <ButtonLink href="/afiliado/pedidos" variant="ghost">
                Limpar
              </ButtonLink>
            )}
          </div>
        </form>
      </Card>

      <Card>
        {list.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-10 w-10" aria-hidden />}
            title={filtered ? "Nenhum pedido encontrado" : "Nenhum pedido ainda"}
            description={filtered ? "Ajuste os filtros para ver outros pedidos." : "Quando seus clientes comprarem na sua loja, os pedidos aparecem aqui."}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 text-sm">
              <p className="text-muted">
                {list.length} pedido{list.length === 1 ? "" : "s"} {page > 1 ? `(página ${page})` : ""}
              </p>
              <p className="text-muted">
                Pagos nesta lista: <strong className="tabular text-ink">{brl(sum(paid.map((o) => o.amountPaid)).toFixed(2))}</strong> · Comissão:{" "}
                <strong className="tabular text-success">{brl(sum(paid.map((o) => o.commission)).toFixed(2))}</strong>
              </p>
            </div>
            <Table>
              <THead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Carrinho criado em</Th>
                  <Th className="text-right">Acessos</Th>
                  <Th>Pago em</Th>
                  <Th>Cliente (conta)</Th>
                  <Th>Pagador</Th>
                  <Th>Pagamento</Th>
                  <Th className="text-right">Valor pago</Th>
                  <Th className="text-right">Comissão</Th>
                  <Th>Repasse</Th>
                </tr>
              </THead>
              <tbody>
                {list.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`/afiliado/pedidos/${o.id}`} className="font-semibold text-brand-ink hover:text-brand-700 hover:underline">
                        {orderNumber(o.number)}
                      </Link>
                      <div className="mt-1">
                        <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{dateTime(o.cartCreatedAt)}</Td>
                    <Td className="text-right tabular">{o.cartViews}</Td>
                    <Td className="whitespace-nowrap">{o.paidAt ? dateTime(o.paidAt) : <span className="text-muted">-</span>}</Td>
                    <Td className="font-semibold">{o.customerName}</Td>
                    <Td>
                      {o.payerName}
                      {o.payerName !== o.customerName && <span className="block text-xs text-muted">pagador diferente da conta</span>}
                    </Td>
                    <Td className="whitespace-nowrap">{paymentLabel(o.paymentMethod, o.installments)}</Td>
                    <Td className="text-right font-semibold tabular whitespace-nowrap">{brl(o.amountPaid)}</Td>
                    <Td className="text-right font-semibold tabular whitespace-nowrap text-success">{brl(o.commission)}</Td>
                    <Td className="whitespace-nowrap">
                      {o.status === "PAID" ? (
                        <>
                          <span className="font-semibold">{date(o.payoutDate)}</span>
                          <div className="mt-1">
                            <Badge tone={o.payoutStatus === "PAID" ? "success" : o.payoutStatus === "SCHEDULED" ? "info" : "warning"}>
                              {PAYOUT_STATUS_LABEL[o.payoutStatus ?? "OPEN"] ?? o.payoutStatus}
                            </Badge>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {(page > 1 || hasNext) && (
              <nav aria-label="Paginação" className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
                {page > 1 ? (
                  <ButtonLink href={qs(page - 1)} variant="outline" size="sm">
                    ← Anteriores
                  </ButtonLink>
                ) : (
                  <span />
                )}
                <span className="text-sm text-muted">Página {page}</span>
                {hasNext ? (
                  <ButtonLink href={qs(page + 1)} variant="outline" size="sm">
                    Próximos →
                  </ButtonLink>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </Card>
    </>
  );
}
