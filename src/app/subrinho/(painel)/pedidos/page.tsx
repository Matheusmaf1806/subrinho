import Form from "next/form";
import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { affiliateOptions, listOrdersSafe, payoutsByIds } from "@/server/subrinho/orders";
import { brl, date, dateTime, ORDER_STATUS_LABEL, orderNumber } from "@/lib/format";
import { OrderStatusBadge, PayoutStatusBadge } from "../../_components/bits";
import { isIsoDate } from "../../_lib/dates";
import { isUuid } from "../../_lib/form";

export const metadata = { title: "Pedidos" };

const PAGE_SIZE = 50;
const STATUSES = ["PENDING_PAYMENT", "PAID", "CANCELLED", "REFUNDED"];

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SubrinhoOrdersPage({ searchParams }: { searchParams: SP }) {
  await requireSubrinhoUser();
  const sp = await searchParams;
  const status = STATUSES.includes(one(sp.status)) ? one(sp.status) : "";
  const affiliateId = isUuid(one(sp.afiliado)) ? one(sp.afiliado) : "";
  const from = isIsoDate(one(sp.de)) ? one(sp.de) : "";
  const to = isIsoDate(one(sp.ate)) ? one(sp.ate) : "";
  const q = one(sp.q).slice(0, 100);
  const page = Math.max(1, Math.floor(Number(one(sp.p)) || 1));

  const [rows, affs] = await Promise.all([
    listOrdersSafe(db, {
      status: status || undefined,
      affiliateId: affiliateId || undefined,
      from: from || undefined,
      to: to || undefined,
      q: q || undefined,
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    affiliateOptions(db),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const list = rows.slice(0, PAGE_SIZE);
  const payoutMap = await payoutsByIds(db, list.map((r) => r.order.payoutId).filter((x): x is string => !!x));

  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (status) u.set("status", status);
    if (affiliateId) u.set("afiliado", affiliateId);
    if (from) u.set("de", from);
    if (to) u.set("ate", to);
    if (q) u.set("q", q);
    if (p > 1) u.set("p", String(p));
    const s = u.toString();
    return `/subrinho/pedidos${s ? `?${s}` : ""}`;
  };
  const filtered = !!(status || affiliateId || from || to || q);

  return (
    <>
      <PageHeader title="Pedidos" subtitle="Todos os pedidos de todas as lojas, com a conta completa de cada item." />

      <Card className="mb-6 p-4">
        <Form action="/subrinho/pedidos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_auto] lg:items-end">
          <Field label="Busca">
            <Input name="q" defaultValue={q} placeholder="Nº do pedido, cliente, e-mail, CPF do pagador" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Afiliado">
            <Select name="afiliado" defaultValue={affiliateId}>
              <option value="">Todos</option>
              {affs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Criado de">
            <Input type="date" name="de" defaultValue={from} />
          </Field>
          <Field label="até">
            <Input type="date" name="ate" defaultValue={to} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1 lg:flex-none")}>
              <Search className="h-4 w-4" aria-hidden /> Filtrar
            </button>
            {filtered && (
              <ButtonLink href="/subrinho/pedidos" variant="ghost">
                Limpar
              </ButtonLink>
            )}
          </div>
        </Form>
      </Card>

      <Card>
        {list.length === 0 ? (
          <EmptyState
            title={filtered ? "Nenhum pedido encontrado" : "Nenhum pedido ainda"}
            description={filtered ? "Ajuste os filtros para ver outros pedidos." : undefined}
            icon={<ShoppingBag className="h-10 w-10" />}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Pedido</Th>
                <Th>Afiliado</Th>
                <Th>Cliente (conta)</Th>
                <Th>Pagador</Th>
                <Th>Criado / Pago</Th>
                <Th>Forma</Th>
                <Th className="text-right">Total cobrado</Th>
                <Th className="text-right">Custo R$</Th>
                <Th className="text-right">Receita Subrinho</Th>
                <Th className="text-right">Comissão afiliado</Th>
                <Th>Repasse</Th>
              </tr>
            </THead>
            <tbody>
              {list.map(({ order: o, affiliateName }) => {
                const payout = o.payoutId ? payoutMap.get(o.payoutId) : null;
                return (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`/subrinho/pedidos/${o.id}`} className="font-semibold text-brand-ink hover:underline">
                        {orderNumber(o.number)}
                      </Link>
                      <div className="mt-1">
                        <OrderStatusBadge status={o.status} />
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{affiliateName}</Td>
                    <Td>
                      <div className="font-semibold">{o.customerData.name}</div>
                      <div className="text-xs text-muted">{o.customerData.email}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold">{o.payerData.name}</div>
                      {o.payerData.document && <div className="text-xs text-muted">{o.payerData.document}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      <div>{dateTime(o.createdAt)}</div>
                      <div className={o.paidAt ? "font-semibold text-emerald-700" : "text-muted"}>{o.paidAt ? dateTime(o.paidAt) : "não pago"}</div>
                    </Td>
                    <Td className="whitespace-nowrap">{o.paymentMethod === "PIX" ? "Pix" : `Cartão ${o.installments}x`}</Td>
                    <Td className="text-right font-semibold tabular">{brl(o.amountCharged)}</Td>
                    <Td className="text-right tabular text-muted">{brl(o.totalCostBrl)}</Td>
                    <Td className="text-right tabular">{brl(o.subrinhoRevenue)}</Td>
                    <Td className="text-right tabular">{brl(o.affiliateCommission)}</Td>
                    <Td className="whitespace-nowrap">
                      {o.status === "PAID" ? (
                        <>
                          <div className="text-xs font-semibold">{date(payout?.scheduledDate ?? o.payoutDate)}</div>
                          <PayoutStatusBadge status={payout?.status ?? "OPEN"} />
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {(page > 1 || hasNext) && (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginação">
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
  );
}
