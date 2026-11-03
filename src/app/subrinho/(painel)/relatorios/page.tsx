import Link from "next/link";
import { Download, FileChartColumn } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { lastClosedFortnight } from "@/server/payouts/calendar";
import { listReports } from "@/server/subrinho/reports";
import { d } from "@/server/pricing/money";
import { addDays, todayLocal } from "@/lib/tz";
import { brl, date, dateTime } from "@/lib/format";
import { ReadOnlyNotice } from "../../_components/bits";
import { periodLabel } from "../../_lib/dates";
import { canDo, PERMS } from "../../_lib/labels";
import { supplierName } from "../../_lib/rules";
import { closeFortnightAction } from "./actions";

export const metadata = { title: "Relatórios" };

function SummaryList({ title, rows }: { title: string; rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul>
        {rows.map(([k, v], i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="font-semibold text-ink">{k}</span>
            <span className="whitespace-nowrap tabular text-muted">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SubrinhoReportsPage() {
  const user = await requireSubrinhoUser();
  const canClose = canDo(user.role, PERMS.reports);
  const today = todayLocal();
  const last = lastClosedFortnight(today);
  const reports = await listReports(db);
  const lastReport = reports.find((r) => r.periodStart === last.start);

  return (
    <>
      <PageHeader
        title="Relatórios de quinzena"
        subtitle="A quinzena fecha no dia 16 (vendas de 1 a 15) e no dia 1º (vendas de 16 ao fim do mês). O fechamento gera o relatório e agenda o repasse de cada afiliado."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card className="self-start">
          <CardHeader title="Fechar quinzena" subtitle="Rodar de novo regera o relatório e atualiza repasses ainda não pagos" />
          <CardBody className="space-y-4">
            <div className="rounded-xl bg-surface/70 p-3 text-sm">
              <p className="font-semibold text-ink">Última quinzena encerrada: {periodLabel(last.start, last.end)}</p>
              <p className="mt-0.5 text-muted">
                {lastReport ? (
                  <>
                    Fechada em {dateTime(lastReport.generatedAt)} {lastReport.generatedByType === "CRON" ? "(automático)" : lastReport.generatedByName ? `por ${lastReport.generatedByName}` : ""}
                  </>
                ) : (
                  <span className="font-semibold text-amber-700">Ainda não fechada</span>
                )}
              </p>
            </div>
            {canClose ? (
              <ActionForm action={closeFortnightAction} className="space-y-3">
                <Field label="Qualquer data da quinzena" hint="Fecha a quinzena que contém esta data (precisa já ter terminado).">
                  <Input type="date" name="date" defaultValue={last.start} max={addDays(today, -1)} required />
                </Field>
                <SubmitButton pendingText="Fechando…">Fechar quinzena</SubmitButton>
              </ActionForm>
            ) : (
              <ReadOnlyNotice>Somente Administradores e Financeiro podem fechar quinzenas.</ReadOnlyNotice>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Relatórios gerados" />
          {reports.length === 0 ? (
            <EmptyState title="Nenhum relatório ainda" icon={<FileChartColumn className="h-10 w-10" />} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Quinzena</Th>
                  <Th>Repasse</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">GMV cobrado</Th>
                  <Th className="text-right">Receita Subrinho</Th>
                  <Th className="text-right">Comissões</Th>
                  <Th className="text-right">Descontos</Th>
                  <Th>Gerado</Th>
                  <Th>
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {reports.map((r) => {
                  const t = r.summary?.totals;
                  return (
                    <Tr key={r.id}>
                      <Td className="min-w-[14rem]">
                        <Link href={`/subrinho/relatorios/${r.id}`} className="whitespace-nowrap font-semibold text-brand hover:underline">
                          {periodLabel(r.periodStart, r.periodEnd)}
                        </Link>
                        {(r.summary?.byAffiliate?.length ?? 0) > 0 && (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Resumo</summary>
                            <div className="mt-1 space-y-2 rounded-lg bg-surface/60 p-2">
                              <SummaryList title="Por afiliado" rows={r.summary.byAffiliate.map((a) => [a.name, `${brl(a.amountCharged)} · comissão ${brl(a.commission)}`])} />
                              <SummaryList title="Por categoria" rows={(r.summary.byCategory ?? []).map((c) => [c.label, `${c.items} item(ns) · ${brl(c.finalPix)}`])} />
                              <SummaryList title="Por fornecedor" rows={(r.summary.bySupplier ?? []).map((sp) => [supplierName(sp.supplierCode), `custo ${brl(sp.costBrl)}`])} />
                            </div>
                          </details>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{date(r.payoutDate)}</Td>
                      <Td className="text-right tabular">{t?.orders ?? 0}</Td>
                      <Td className="text-right font-semibold tabular">{brl(t?.amountCharged)}</Td>
                      <Td className="text-right tabular">{brl(t?.subrinhoRevenue)}</Td>
                      <Td className="text-right tabular">{brl(t?.affiliateCommission)}</Td>
                      <Td className="text-right tabular">{brl(d(t?.subrinhoDiscount ?? 0).plus(d(t?.affiliateDiscount ?? 0)))}</Td>
                      <Td className="whitespace-nowrap text-xs">
                        <div>{dateTime(r.generatedAt)}</div>
                        <Badge tone={r.generatedByType === "CRON" ? "info" : "neutral"}>{r.generatedByType === "CRON" ? "Automático" : (r.generatedByName ?? "Subrinho")}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <ButtonLink href={`/subrinho/relatorios/${r.id}`} variant="ghost" size="sm">
                            Ver
                          </ButtonLink>
                          <a href={`/api/subrinho/relatorios/${r.periodStart}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-brand-50/50" download>
                            <Download className="h-3.5 w-3.5" aria-hidden /> CSV
                          </a>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
