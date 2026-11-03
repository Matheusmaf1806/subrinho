import Form from "next/form";
import Link from "next/link";
import { Banknote, CircleCheck, Paperclip, Search, Upload } from "lucide-react";
import { ButtonLink, Card, CardHeader, EmptyState, Field, PageHeader, Select, Stat, Table, Td, Textarea, Th, THead, Tr, buttonClass } from "@/components/ui";
import { ActionForm, CopyButton, Modal, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { openPayoutForecast } from "@/server/subrinho/dashboard";
import { affiliateOptions } from "@/server/subrinho/orders";
import { listPayoutsForSubrinho, payoutPeriods, payoutTotalsByStatus, type PayoutListRow } from "@/server/subrinho/payouts";
import { brl, date, dateTime, PAYOUT_STATUS_LABEL } from "@/lib/format";
import { todayLocal } from "@/lib/tz";
import { sum } from "@/server/pricing/money";
import { Fit, PayoutStatusBadge } from "../../_components/bits";
import { isIsoDate, periodLabel } from "../../_lib/dates";
import { isUuid } from "../../_lib/form";
import { canDo, PERMS } from "../../_lib/labels";
import { markPayoutPaidAction, uploadPayoutProofAction } from "./actions";
import { ProofInput } from "./proof-input";

export const metadata = { title: "Repasses" };

const STATUSES = ["SCHEDULED", "PAID", "CANCELLED"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function BankData({ a }: { a: PayoutListRow["affiliate"] }) {
  const hasBank = a.bankName || a.bankAgency || a.bankAccount;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted">
      {a.legalName && <div>{a.legalName}</div>}
      {a.document && <div>CNPJ/CPF: {a.document}</div>}
      {a.pixKey ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span>
            Pix: <strong className="break-all text-ink">{a.pixKey}</strong>
          </span>
          <CopyButton text={a.pixKey} label="Copiar" className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 hover:bg-brand-100" />
        </div>
      ) : (
        <div className="font-semibold text-amber-700">Sem chave Pix cadastrada</div>
      )}
      {hasBank && (
        <div>
          {a.bankName ?? "Banco —"} · Ag. {a.bankAgency ?? "—"} · Conta {a.bankAccount ?? "—"}
        </div>
      )}
    </div>
  );
}

export default async function SubrinhoPayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSubrinhoUser();
  const sp = await searchParams;
  const canEdit = canDo(user.role, PERMS.payouts);
  const rawStatus = one(sp.status);
  const status = STATUSES.includes(rawStatus) || rawStatus === "ALL" ? rawStatus : "";
  const affiliateId = isUuid(one(sp.afiliado)) ? one(sp.afiliado) : "";
  const periodStart = isIsoDate(one(sp.quinzena)) ? one(sp.quinzena) : "";

  const [rows, affs, periods, totals, forecast] = await Promise.all([
    listPayoutsForSubrinho(db, { status: status || undefined, affiliateId: affiliateId || undefined, periodStart: periodStart || undefined }),
    affiliateOptions(db),
    payoutPeriods(db),
    payoutTotalsByStatus(db),
    openPayoutForecast(db),
  ]);
  const tot = (s: string) => totals.find((t) => t.status === s) ?? { n: 0, amount: "0" };
  const filtered = !!(status || affiliateId || periodStart);
  const forecastShown = forecast.filter((f) => !affiliateId || f.affiliateId === affiliateId);
  const today = todayLocal();

  return (
    <>
      <PageHeader title="Repasses" subtitle="Pagamentos aos afiliados por quinzena. Dados bancários ao lado de cada repasse para o financeiro." />

      <div className="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
        <Stat label="A pagar (agendados)" value={<Fit>{brl(tot("SCHEDULED").amount)}</Fit>} tone="brand" hint={`${tot("SCHEDULED").n} repasse(s)`} />
        <Stat label="Já pagos" value={<Fit>{brl(tot("PAID").amount)}</Fit>} hint={`${tot("PAID").n} repasse(s)`} />
        <Stat
          label="Quinzena em aberto (previsão)"
          value={<Fit>{brl(sum(forecast.map((f) => f.amount)))}</Fit>}
          hint={`${forecast.reduce((s, f) => s + f.orders, 0)} pedido(s) ainda não fechados`}
        />
      </div>

      <Card className="mb-6 p-4">
        <Form action="/subrinho/repasses" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <Field label="Status">
            <Select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYOUT_STATUS_LABEL[s]}
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
          <Field label="Quinzena">
            <Select name="quinzena" defaultValue={periodStart}>
              <option value="">Todas</option>
              {periods.map((p) => (
                <option key={p.periodStart} value={p.periodStart}>
                  {periodLabel(p.periodStart, p.periodEnd)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1 lg:flex-none")}>
              <Search className="h-4 w-4" aria-hidden /> Filtrar
            </button>
            {filtered && (
              <ButtonLink href="/subrinho/repasses" variant="ghost">
                Limpar
              </ButtonLink>
            )}
          </div>
        </Form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? "Nenhum repasse com esses filtros" : "Nenhum repasse gerado ainda"}
            description="Os repasses são criados no fechamento da quinzena (Relatórios)."
            icon={<Banknote className="h-10 w-10" />}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Afiliado e dados para pagamento</Th>
                <Th>Quinzena</Th>
                <Th>Data prevista</Th>
                <Th className="text-right">Pedidos</Th>
                <Th className="text-right">Vendas</Th>
                <Th className="text-right">Valor</Th>
                <Th>Status</Th>
                <Th>Comprovantes</Th>
                {canEdit && (
                  <Th>
                    <span className="sr-only">Ações</span>
                  </Th>
                )}
              </tr>
            </THead>
            <tbody>
              {rows.map(({ payout: p, affiliate: a, paidByName, proofs }) => {
                const overdue = p.status === "SCHEDULED" && p.scheduledDate < today;
                return (
                  <Tr key={p.id}>
                    <Td className="min-w-[16rem]">
                      <Link href={`/subrinho/afiliados/${a.id}`} className="font-extrabold text-ink hover:text-brand">
                        {a.name}
                      </Link>
                      <BankData a={a} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Link href={`/subrinho/pedidos?afiliado=${a.id}&status=PAID`} className="hover:text-brand">
                        {periodLabel(p.periodStart, p.periodEnd)}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className={overdue ? "font-bold text-red-700" : ""}>{date(p.scheduledDate)}</span>
                      {overdue && <div className="text-[11px] font-bold text-red-700">em atraso</div>}
                    </Td>
                    <Td className="text-right tabular">{p.ordersCount}</Td>
                    <Td className="text-right tabular">{brl(p.grossSales)}</Td>
                    <Td className="text-right text-base font-black tabular">{brl(p.amount)}</Td>
                    <Td className="whitespace-nowrap">
                      <PayoutStatusBadge status={p.status} />
                      {p.paidAt && (
                        <div className="mt-1 text-[11px] text-muted">
                          {dateTime(p.paidAt)}
                          {paidByName && <> · {paidByName}</>}
                        </div>
                      )}
                      {p.notes && <div className="mt-1 max-w-[14rem] text-[11px] text-muted">“{p.notes}”</div>}
                    </Td>
                    <Td>
                      {proofs.length === 0 ? (
                        <span className="text-xs text-muted">Nenhum</span>
                      ) : (
                        <ul className="space-y-1">
                          {proofs.map((f) => (
                            <li key={f.id}>
                              <a
                                href={`/api/files/${f.fileId}`}
                                target="_blank"
                                rel="noopener"
                                className="inline-flex max-w-[14rem] items-center gap-1 text-xs font-semibold text-brand hover:underline"
                                title={f.note ?? undefined}
                              >
                                <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                                <span className="truncate">{f.filename}</span>
                              </a>
                              <span className="block text-[10px] text-muted">
                                {kb(f.size)} · {dateTime(f.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    {canEdit && (
                      <Td className="whitespace-nowrap">
                        <div className="flex flex-col items-stretch gap-1.5">
                          {p.status === "SCHEDULED" && (
                            <Modal
                              title={`Marcar repasse de ${a.name} como pago`}
                              triggerClassName={buttonClass("primary", "sm")}
                              trigger={
                                <>
                                  <CircleCheck className="h-4 w-4" aria-hidden /> Marcar pago
                                </>
                              }
                            >
                              <ActionForm action={markPayoutPaidAction} className="space-y-4">
                                <input type="hidden" name="payoutId" value={p.id} />
                                <div className="rounded-xl bg-cream/70 p-3 text-sm">
                                  <p>
                                    Valor: <strong className="text-lg">{brl(p.amount)}</strong> · quinzena {periodLabel(p.periodStart, p.periodEnd)}
                                  </p>
                                  <BankData a={a} />
                                </div>
                                <Field label="Observação" hint="Ex.: Pix enviado, ID da transação">
                                  <Textarea name="note" maxLength={1000} className="min-h-16" />
                                </Field>
                                <ProofInput id={`paid-files-${p.id}`} />
                                <SubmitButton pendingText="Salvando…">Confirmar pagamento</SubmitButton>
                              </ActionForm>
                            </Modal>
                          )}
                          {p.status !== "CANCELLED" && (
                            <Modal
                              title="Anexar comprovante"
                              triggerClassName={buttonClass("outline", "sm")}
                              trigger={
                                <>
                                  <Upload className="h-4 w-4" aria-hidden /> Comprovante
                                </>
                              }
                            >
                              <ActionForm action={uploadPayoutProofAction} resetOnSuccess className="space-y-4">
                                <input type="hidden" name="payoutId" value={p.id} />
                                <p className="text-sm text-muted">
                                  {a.name} · {periodLabel(p.periodStart, p.periodEnd)} · {brl(p.amount)}
                                </p>
                                <ProofInput id={`proof-files-${p.id}`} required />
                                <Field label="Observação (opcional)">
                                  <Textarea name="note" maxLength={1000} className="min-h-16" />
                                </Field>
                                <SubmitButton pendingText="Enviando…">Anexar</SubmitButton>
                              </ActionForm>
                            </Modal>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {forecastShown.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Previsão — vendas da quinzena em aberto"
            subtitle="Vendas pagas que ainda não entraram em um fechamento. Viram repasse quando a quinzena for fechada."
          />
          <Table>
            <THead>
              <tr>
                <Th>Afiliado</Th>
                <Th>Pagamento previsto</Th>
                <Th className="text-right">Pedidos</Th>
                <Th className="text-right">Vendas</Th>
                <Th className="text-right">Comissão</Th>
              </tr>
            </THead>
            <tbody>
              {forecastShown.map((f) => (
                <Tr key={`${f.affiliateId}-${f.payoutDate}`}>
                  <Td className="font-bold">{f.affiliateName}</Td>
                  <Td>{date(f.payoutDate)}</Td>
                  <Td className="text-right tabular">{f.orders}</Td>
                  <Td className="text-right tabular">{brl(f.gross)}</Td>
                  <Td className="text-right font-extrabold tabular">{brl(f.amount)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
