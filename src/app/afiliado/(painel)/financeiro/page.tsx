import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Download, FileText, Landmark, Wallet } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, DetailRow, EmptyState, PageHeader, Stat, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { brl, date, dateTime, PAYOUT_STATUS_LABEL } from "@/lib/format";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { affiliatePayoutsOverview, recentFortnights } from "@/server/afiliado/payouts";
import { fileHref, fortnightLabel, reportHref } from "../../_lib/helpers";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { payouts } from "@/server/db/schema";
import { invoicesForPayouts } from "@/server/invoices";
import { Modal } from "@/components/ui-client";
import { InvoiceForm } from "@/components/invoice-form";
import { InvoiceList } from "@/components/invoice-list";
import { todayLocal } from "@/lib/tz";
import { sendPayoutInvoiceAction } from "./actions";

export const metadata: Metadata = { title: "Financeiro" };

function ReportLink({ periodStart, compact }: { periodStart: string; compact?: boolean }) {
  return (
    <a href={reportHref(periodStart)} className={buttonClass("outline", "sm")} download>
      <Download className="h-3.5 w-3.5" aria-hidden /> {compact ? "CSV" : "Relatório CSV"}
    </a>
  );
}

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

export default async function AfiliadoFinanceiroPage() {
  const { user, affiliate } = await requireAffiliateUser();
  const ov = await affiliatePayoutsOverview(db, affiliate.id);
  const next = ov.upcoming[0];
  const fortnights = recentFortnights(6);
  const hasBank = !!(affiliate.pixKey || affiliate.bankAccount);
  const payoutRows = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.affiliateId, affiliate.id), inArray(payouts.status, ["SCHEDULED", "PAID"]), gt(payouts.amount, "0")))
    .orderBy(desc(payouts.periodStart))
    .limit(12);
  const payoutInvoices = await invoicesForPayouts(db, payoutRows.map((p) => p.id));

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Seus repasses de comissão, comprovantes e relatórios de quinzena." />

      <section aria-label="Resumo financeiro" className="grid gap-4 sm:grid-cols-3">
        <Stat tone="brand" label="A receber" value={brl(ov.toReceive)} hint="Repasses agendados + quinzenas em aberto" icon={<Wallet className="h-4 w-4" aria-hidden />} />
        <Stat tone="dark" label="Recebido" value={brl(ov.receivedTotal)} hint={`${ov.received.length} repasse${ov.received.length === 1 ? "" : "s"} pago${ov.received.length === 1 ? "" : "s"}`} />
        <Stat
          label="Próximo repasse"
          value={next ? brl(next.amount) : "-"}
          hint={next ? `${next.date ? date(next.date) : "Data a definir"} · ${fortnightLabel(next.periodStart, next.periodEnd)}` : "Nenhum repasse previsto"}
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        />
      </section>

      <Alert tone="info" className="mt-6" title="Como funciona o repasse">
        Vendas <strong>pagas do dia 1 ao 15</strong> são repassadas no <strong>5º dia útil após o dia 15</strong>. Vendas pagas{" "}
        <strong>do dia 16 em diante</strong> são repassadas no <strong>5º dia útil do mês seguinte</strong>. A quinzena fecha nos dias 16 e 1º, quando a
        Subrinho gera o relatório e agenda o seu repasse. Depois de pagar, a Subrinho anexa o comprovante aqui.
      </Alert>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Próximos repasses" subtitle="Quinzenas em aberto e repasses já agendados" />
            {ov.upcoming.length === 0 ? (
              <EmptyState icon={<Wallet className="h-10 w-10" aria-hidden />} title="Nenhum repasse previsto" description="Assim que uma venda for paga, ela entra no próximo repasse." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Período</Th>
                    <Th className="text-right">Pedidos</Th>
                    <Th className="text-right">Vendas</Th>
                    <Th className="text-right">Sua comissão</Th>
                    <Th>Data do repasse</Th>
                    <Th>Status</Th>
                    <Th>Relatório</Th>
                  </tr>
                </THead>
                <tbody>
                  {ov.upcoming.map((p) => (
                    <Tr key={p.key}>
                      <Td className="whitespace-nowrap font-semibold">{fortnightLabel(p.periodStart, p.periodEnd)}</Td>
                      <Td className="text-right tabular">{p.orders}</Td>
                      <Td className="text-right tabular whitespace-nowrap">{brl(p.grossSales)}</Td>
                      <Td className="text-right font-semibold tabular whitespace-nowrap">{brl(p.amount)}</Td>
                      <Td className="whitespace-nowrap font-semibold">{p.date ? date(p.date) : "-"}</Td>
                      <Td>
                        <Badge tone={p.status === "SCHEDULED" ? "info" : "warning"}>{PAYOUT_STATUS_LABEL[p.status]}</Badge>
                      </Td>
                      <Td>{p.periodStart ? <ReportLink periodStart={p.periodStart} compact /> : <span className="text-muted">-</span>}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Repasses recebidos" subtitle="Com os comprovantes enviados pela Subrinho" />
            {ov.received.length === 0 ? (
              <EmptyState icon={<FileText className="h-10 w-10" aria-hidden />} title="Nenhum repasse recebido ainda" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Período</Th>
                    <Th className="text-right">Pedidos</Th>
                    <Th className="text-right">Vendas</Th>
                    <Th className="text-right">Valor repassado</Th>
                    <Th>Previsto</Th>
                    <Th>Pago em</Th>
                    <Th>Comprovantes</Th>
                    <Th>Relatório</Th>
                  </tr>
                </THead>
                <tbody>
                  {ov.received.map((p) => (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap font-semibold">{fortnightLabel(p.periodStart, p.periodEnd)}</Td>
                      <Td className="text-right tabular">{p.ordersCount}</Td>
                      <Td className="text-right tabular whitespace-nowrap">{brl(p.grossSales)}</Td>
                      <Td className="text-right font-semibold tabular whitespace-nowrap text-success">{brl(p.amount)}</Td>
                      <Td className="whitespace-nowrap text-muted">{date(p.scheduledDate)}</Td>
                      <Td className="whitespace-nowrap">
                        {p.paidAt ? dateTime(p.paidAt) : "-"}
                        {p.notes && <span className="block text-xs text-muted">{p.notes}</span>}
                      </Td>
                      <Td>
                        {p.proofs.length === 0 ? (
                          <span className="text-xs text-muted">Aguardando comprovante</span>
                        ) : (
                          <ul className="space-y-1">
                            {p.proofs.map((pr) => (
                              <li key={pr.id}>
                                <a
                                  href={fileHref(pr.fileId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex max-w-[14rem] items-center gap-1.5 text-sm font-semibold text-brand-ink hover:text-brand-700 hover:underline"
                                  title={pr.filename}
                                >
                                  <FileText className="h-4 w-4 shrink-0" aria-hidden />
                                  <span className="truncate">{pr.filename}</span>
                                  <span className="shrink-0 text-xs font-semibold text-muted">({kb(pr.size)})</span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>
                        <ReportLink periodStart={p.periodStart} compact />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-brand-ink" aria-hidden /> Dados para repasse
                </span>
              }
              subtitle="Conta onde a Subrinho deposita a sua comissão"
            />
            <CardBody>
              {!hasBank && (
                <Alert tone="warning" className="mb-3">
                  Cadastre uma chave Pix ou conta bancária para receber seus repasses.
                </Alert>
              )}
              <dl>
                <DetailRow label="Favorecido">{affiliate.legalName || affiliate.name}</DetailRow>
                <DetailRow label="CPF/CNPJ">{affiliate.document || "-"}</DetailRow>
                <DetailRow label="Chave Pix">{affiliate.pixKey ? <span className="break-all">{affiliate.pixKey}</span> : "-"}</DetailRow>
                <DetailRow label="Banco">{affiliate.bankName || "-"}</DetailRow>
                <DetailRow label="Agência">{affiliate.bankAgency || "-"}</DetailRow>
                <DetailRow label="Conta">{affiliate.bankAccount || "-"}</DetailRow>
              </dl>
              {user.role === "ADMIN" ? (
                <Link href="/afiliado/loja#dados-bancarios" className="mt-3 inline-flex text-sm font-semibold text-brand-ink hover:text-brand-700">
                  Alterar dados bancários →
                </Link>
              ) : (
                <p className="mt-3 text-xs text-muted">Somente usuários ADMIN podem alterar estes dados.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Relatórios de quinzena" subtitle="Vendas pagas em cada quinzena, item a item (CSV)" />
            <ul className="divide-y divide-line">
              {fortnights.map((f, i) => (
                <li key={f.start} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{fortnightLabel(f.start, f.end)}</p>
                    <p className="text-xs text-muted">{i === 0 ? "Quinzena atual (parcial)" : `${f.half}ª quinzena`}</p>
                  </div>
                  <ReportLink periodStart={f.start} compact />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Notas fiscais da comissão" subtitle="Envie a nota de cada repasse (PDF e, se tiver, o XML). A equipe Subrinho confere por aqui." />
        {payoutRows.length === 0 ? (
          <EmptyState icon={<FileText className="h-10 w-10" aria-hidden />} title="Nenhum repasse ainda" description="Os repasses aparecem aqui depois do fechamento de cada quinzena." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Período</Th>
                <Th>Repasse</Th>
                <Th className="text-right">Comissão</Th>
                <Th>Nota fiscal</Th>
              </tr>
            </THead>
            <tbody>
              {payoutRows.map((p) => {
                const list = payoutInvoices.filter((i) => i.payoutId === p.id);
                const issued = list.some((i) => i.status === "ISSUED");
                return (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap font-semibold">{fortnightLabel(p.periodStart, p.periodEnd)}</Td>
                    <Td>
                      <Badge tone={p.status === "PAID" ? "success" : "info"}>{PAYOUT_STATUS_LABEL[p.status] ?? p.status}</Badge>
                      <span className="block text-xs text-muted">{date(p.scheduledDate)}</span>
                    </Td>
                    <Td className="text-right tabular whitespace-nowrap">{brl(p.amount)}</Td>
                    <Td className="min-w-[16rem]">
                      <InvoiceList list={list} fileHref={fileHref} />
                      {!issued && <span className="text-xs text-muted">Aguardando a nota da agência</span>}
                      {user.role === "ADMIN" && (
                        <div className="mt-2">
                          <Modal trigger={<span className={buttonClass(issued ? "ghost" : "outline", "sm")}>{issued ? "Enviar outra nota" : "Enviar nota fiscal"}</span>} title={`Nota da comissão: ${fortnightLabel(p.periodStart, p.periodEnd)}`} size="lg">
                            <InvoiceForm action={sendPayoutInvoiceAction} hidden={{ payoutId: p.id }} amount={p.amount} today={todayLocal()} submitLabel="Enviar nota" />
                          </Modal>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
