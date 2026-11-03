import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { getReport, reportOrders, reportPayouts } from "@/server/subrinho/reports";
import { d } from "@/server/pricing/money";
import { brl, date, dateTime, orderNumber } from "@/lib/format";
import { Fit, PayoutStatusBadge, SectionTitle } from "../../../_components/bits";
import { periodLabel } from "../../../_lib/dates";
import { isUuid } from "../../../_lib/form";
import { canDo, PERMS } from "../../../_lib/labels";
import { supplierName } from "../../../_lib/rules";
import { closeFortnightAction } from "../actions";

export const metadata = { title: "Relatório da quinzena" };

export default async function SubrinhoReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSubrinhoUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const r = await getReport(db, id);
  if (!r) notFound();
  const s = r.summary;
  const t = s.totals;
  const [payoutRows, orders] = await Promise.all([reportPayouts(db, r.periodStart), reportOrders(db, { start: r.periodStart, end: r.periodEnd })]);
  const payoutByAff = new Map(payoutRows.map((p) => [p.payout.affiliateId, p.payout]));
  const canClose = canDo(user.role, PERMS.reports);
  const byAffiliate = [...(s.byAffiliate ?? [])].sort((a, b) => d(b.amountCharged).comparedTo(d(a.amountCharged)));
  const byCategory = [...(s.byCategory ?? [])].sort((a, b) => d(b.finalPix).comparedTo(d(a.finalPix)));
  const bySupplier = [...(s.bySupplier ?? [])].sort((a, b) => d(b.costBrl).comparedTo(d(a.costBrl)));

  return (
    <>
      <PageHeader
        title={`Quinzena ${periodLabel(r.periodStart, r.periodEnd)}`}
        subtitle={
          <>
            Repasse em <strong className="text-ink">{date(r.payoutDate)}</strong> · gerado em {dateTime(r.generatedAt)}{" "}
            {r.generatedByType === "CRON" ? "(automático)" : r.generatedByName ? `por ${r.generatedByName}` : ""}
          </>
        }
        back={{ href: "/subrinho/relatorios", label: "Relatórios" }}
        actions={
          <>
            <a href={`/api/subrinho/relatorios/${r.periodStart}`} className={buttonClass("outline", "md")} download>
              <Download className="h-4 w-4" aria-hidden /> Baixar CSV
            </a>
            {canClose && (
              <ActionForm action={closeFortnightAction} showMessages>
                <input type="hidden" name="date" value={r.periodStart} />
                <SubmitButton variant="secondary" pendingText="Regerando…">
                  <RefreshCw className="h-4 w-4" aria-hidden /> Regerar
                </SubmitButton>
              </ActionForm>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Stat label="GMV cobrado" value={<Fit>{brl(t.amountCharged)}</Fit>} tone="brand" hint={`PIX ${brl(t.totalPix)}`} />
        <Stat label="Receita Subrinho" value={<Fit>{brl(t.subrinhoRevenue)}</Fit>} tone="dark" />
        <Stat label="Comissões afiliados" value={<Fit>{brl(t.affiliateCommission)}</Fit>} />
        <Stat label="Custo R$" value={<Fit>{brl(t.costBrl)}</Fit>} hint={`Taxas do parcelado ${brl(t.installmentFees)}`} />
        <Stat label="Pedidos / itens" value={`${t.orders} / ${t.items}`} hint={`Descontos: Subrinho ${brl(t.subrinhoDiscount)} · Afiliado ${brl(t.affiliateDiscount)}`} />
      </div>

      <SectionTitle>Por afiliado</SectionTitle>
      <Card>
        {byAffiliate.length === 0 ? (
          <EmptyState title="Nenhuma venda paga nesta quinzena" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Afiliado</Th>
                <Th className="text-right">Pedidos</Th>
                <Th className="text-right">Vendas</Th>
                <Th className="text-right">Comissão (repasse)</Th>
                <Th>Repasse</Th>
              </tr>
            </THead>
            <tbody>
              {byAffiliate.map((a) => {
                const p = payoutByAff.get(a.affiliateId);
                return (
                  <Tr key={a.affiliateId}>
                    <Td>
                      <Link href={`/subrinho/afiliados/${a.affiliateId}`} className="font-extrabold text-ink hover:text-brand">
                        {a.name}
                      </Link>
                    </Td>
                    <Td className="text-right tabular">{a.orders}</Td>
                    <Td className="text-right tabular">{brl(a.amountCharged)}</Td>
                    <Td className="text-right font-extrabold tabular">{brl(a.commission)}</Td>
                    <Td className="whitespace-nowrap">
                      {p ? (
                        <Link href={`/subrinho/repasses?afiliado=${a.affiliateId}&quinzena=${r.periodStart}`} className="inline-flex items-center gap-2">
                          <PayoutStatusBadge status={p.status} />
                          <span className="text-xs text-muted">{date(p.scheduledDate)}</span>
                        </Link>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Por categoria</SectionTitle>
          <Card>
            {byCategory.length === 0 ? (
              <EmptyState title="Sem itens" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Categoria</Th>
                    <Th className="text-right">Itens</Th>
                    <Th className="text-right">Preço PIX</Th>
                    <Th className="text-right">Receita Subrinho</Th>
                    <Th className="text-right">Comissões</Th>
                  </tr>
                </THead>
                <tbody>
                  {byCategory.map((c) => (
                    <Tr key={c.category}>
                      <Td className="font-bold">{c.label}</Td>
                      <Td className="text-right tabular">{c.items}</Td>
                      <Td className="text-right tabular">{brl(c.finalPix)}</Td>
                      <Td className="text-right tabular">{brl(c.subrinhoRevenue)}</Td>
                      <Td className="text-right tabular">{brl(c.affiliateCommission)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Por fornecedor</SectionTitle>
          <Card>
            {bySupplier.length === 0 ? (
              <EmptyState title="Sem itens" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Fornecedor</Th>
                    <Th className="text-right">Itens</Th>
                    <Th className="text-right">Custo R$ (a pagar ao fornecedor)</Th>
                  </tr>
                </THead>
                <tbody>
                  {bySupplier.map((sp) => (
                    <Tr key={sp.supplierCode}>
                      <Td>
                        <span className="font-bold">{supplierName(sp.supplierCode)}</span> <span className="text-xs text-muted">{sp.supplierCode}</span>
                      </Td>
                      <Td className="text-right tabular">{sp.items}</Td>
                      <Td className="text-right font-bold tabular">{brl(sp.costBrl)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      <SectionTitle hint="Lista atual de pedidos pagos no período (pela data do pagamento). Se houver diferença para os totais acima, regere o relatório.">
        Pedidos da quinzena ({orders.length})
      </SectionTitle>
      <Card>
        <CardHeader title="Pedidos pagos" />
        {orders.length === 0 ? (
          <EmptyState title="Nenhum pedido pago no período" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Pedido</Th>
                <Th>Pago em</Th>
                <Th>Afiliado</Th>
                <Th>Cliente</Th>
                <Th>Forma</Th>
                <Th className="text-right">Cobrado</Th>
                <Th className="text-right">Custo R$</Th>
                <Th className="text-right">Receita Subrinho</Th>
                <Th className="text-right">Comissão</Th>
              </tr>
            </THead>
            <tbody>
              {orders.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`/subrinho/pedidos/${o.id}`} className="font-extrabold text-brand hover:underline">
                      {orderNumber(o.number)}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{dateTime(o.paidAt)}</Td>
                  <Td className="whitespace-nowrap">{o.affiliateName}</Td>
                  <Td>{o.customerData.name}</Td>
                  <Td className="whitespace-nowrap">{o.paymentMethod === "PIX" ? "Pix" : `Cartão ${o.installments}x`}</Td>
                  <Td className="text-right font-bold tabular">{brl(o.amountCharged)}</Td>
                  <Td className="text-right tabular text-muted">{brl(o.totalCostBrl)}</Td>
                  <Td className="text-right tabular">{brl(o.subrinhoRevenue)}</Td>
                  <Td className="text-right tabular">{brl(o.affiliateCommission)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
