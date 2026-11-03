import type { Metadata } from "next";
import { Info, Lock, MapPin, Ticket } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { dateTime, pct } from "@/lib/format";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { affiliateMarginOverview, type EffectiveMargin } from "@/server/afiliado/margins";
import { getSettings } from "@/server/settings";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { MARGIN_SCOPE_LABEL } from "../../_lib/helpers";
import {
  deleteMarginRuleAction,
  saveCategoryMarginAction,
  saveDefaultMarginAction,
  saveTicketMarginAction,
  updateMarginRuleAction,
} from "./actions";
import { MarginInlineForm, MarginSimulator, RemoveRuleForm } from "./margin-forms";

export const metadata: Metadata = { title: "Margens" };

function sourceLabel(e: EffectiveMargin) {
  switch (e.source) {
    case "PRODUCT_OPTION":
      return "Regra deste tipo de ingresso";
    case "PRODUCT":
      return "Regra do ingresso";
    case "SUPPLIER":
      return "Regra especial";
    case "CATEGORY":
      return "Regra da categoria";
    case "DEFAULT":
      return "Sua margem padrão";
    case "FALLBACK":
      return "Padrão da plataforma";
  }
}

function SourceBadge({ e, own }: { e: EffectiveMargin; own: boolean }) {
  return <Badge tone={own ? "brand" : "neutral"}>{own ? "Regra própria" : `Herdada · ${sourceLabel(e)}`}</Badge>;
}

export default async function AfiliadoMargensPage() {
  const { user, affiliate } = await requireAffiliateUser();
  const canEdit = user.role === "ADMIN";
  const [ov, settings] = await Promise.all([affiliateMarginOverview(db, affiliate.id), getSettings(db)]);
  const max = ov.maxPct;

  return (
    <>
      <PageHeader title="Margens" subtitle="Defina quanto você ganha em cada venda da sua loja. A regra mais específica sempre vence." />

      {!canEdit && (
        <Alert tone="warning" className="mb-6" title="Somente leitura">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-4 w-4" aria-hidden /> Apenas usuários ADMIN da agência podem alterar margens.
          </span>
        </Alert>
      )}

      {/* Como funciona */}
      <Card className="mb-6">
        <CardHeader title="Como a sua margem funciona" />
        <CardBody className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm text-ink">
            <p>
              A sua margem é aplicada <strong>“por dentro”</strong> sobre o preço base da Subrinho: <span className="font-semibold">preço = base ÷ (1 − margem)</span>.
              Assim, uma margem de 8% significa que 8% do preço final de cada item fica com você.
            </p>
            <ol className="space-y-1.5">
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">1</span>
                <span>
                  <strong>Tipo de ingresso</strong> (ex.: “Coliseu + Vaticano”)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">2</span>
                <span>
                  <strong>Ingresso</strong>, para todos os tipos (ex.: “Coliseu”)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">3</span>
                <span>
                  <strong>Categoria</strong> (Ingressos, Hospedagem, Casas…)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">4</span>
                <span>
                  <strong>Margem padrão</strong> da agência
                </span>
              </li>
            </ol>
            <p className="text-muted">
              A margem pode ir de <strong>0%</strong> até <strong>{pct(max)}</strong>. Cupons da agência descontam apenas da sua margem. Usuários ADMIN
              também podem alterar a margem de um item direto no checkout da loja (modo ADMIN), somente naquele carrinho.
            </p>
          </div>
          <MarginSimulator
            defaultMargin={ov.defaultEffective.pct}
            max={max}
            installmentFeePct={settings.installmentFeePct}
            maxInstallments={settings.maxInstallments}
          />
        </CardBody>
      </Card>

      {/* Margem padrão */}
      <Card className="mb-6">
        <CardHeader title="Margem padrão" subtitle="Vale para tudo que não tiver uma regra mais específica." />
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold tabular text-ink">{pct(ov.defaultEffective.pct)}</p>
            <p className="mt-1 text-sm text-muted">
              {ov.defaultRule ? "Definida pela sua agência." : `Você ainda não definiu — vale o padrão da plataforma (${pct(ov.fallbackPct)}).`}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-start gap-2">
              <MarginInlineForm action={saveDefaultMarginAction} hidden={{}} value={ov.defaultRule?.pct ?? ""} placeholder={String(Number(ov.fallbackPct))} max={max} label="Margem padrão (%)" />
              {ov.defaultRule && (
                <RemoveRuleForm
                  action={deleteMarginRuleAction}
                  ruleId={ov.defaultRule.id}
                  label="Usar padrão da plataforma"
                  confirmMessage={`Remover a sua margem padrão? Passará a valer o padrão da plataforma (${pct(ov.fallbackPct)}).`}
                />
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Por categoria */}
      <Card className="mb-6">
        <CardHeader title="Por categoria" subtitle="Sem regra na categoria, vale a margem padrão." />
        <Table>
          <THead>
            <tr>
              <Th>Categoria</Th>
              <Th className="text-right">Margem aplicada</Th>
              <Th>Regra que vale</Th>
              <Th>Sem regra, herda</Th>
              {canEdit && <Th>Alterar</Th>}
            </tr>
          </THead>
          <tbody>
            {ov.categories.map((c) => (
              <Tr key={c.category}>
                <Td className="font-semibold">{CATEGORY_LABEL[c.category]}</Td>
                <Td className="text-right text-base font-semibold tabular">{pct(c.effective.pct)}</Td>
                <Td>
                  <SourceBadge e={c.effective} own={!!c.rule} />
                </Td>
                <Td className="whitespace-nowrap text-muted">
                  {pct(c.inherited.pct)} <span className="text-xs">({sourceLabel(c.inherited).toLowerCase()})</span>
                </Td>
                {canEdit && (
                  <Td>
                    <div className="flex flex-wrap items-start gap-2">
                      <MarginInlineForm
                        action={saveCategoryMarginAction}
                        hidden={{ category: c.category }}
                        value={c.rule?.pct ?? ""}
                        placeholder={String(Number(c.inherited.pct))}
                        max={max}
                        label={`Margem de ${CATEGORY_LABEL[c.category]} (%)`}
                      />
                      {c.rule && <RemoveRuleForm action={deleteMarginRuleAction} ruleId={c.rule.id} />}
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Por tipo de ingresso */}
      <Card className="mb-6">
        <CardHeader
          title="Por tipo de ingresso"
          subtitle="Defina uma margem para o ingresso inteiro ou para um tipo de ingresso específico."
        />
        {ov.tickets.length === 0 ? (
          <EmptyState icon={<Ticket className="h-10 w-10" aria-hidden />} title="Nenhum ingresso disponível no momento" />
        ) : (
          <div className="divide-y divide-line">
            {ov.tickets.map((p) => {
              const hasOwn = !!p.rule || p.options.some((o) => o.rule);
              return (
                <details key={p.key} className="group" open={hasOwn}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface/40 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        <span className="mr-1.5 inline-block text-muted transition group-open:rotate-90" aria-hidden>
                          ›
                        </span>
                        {p.title}
                      </p>
                      <p className="ml-4 inline-flex items-center gap-1 text-xs text-muted">
                        <MapPin className="h-3 w-3" aria-hidden /> {p.location} · {p.options.length} tipo{p.options.length === 1 ? "" : "s"} de ingresso
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold tabular text-ink">{pct(p.effective.pct)}</span>
                      <SourceBadge e={p.effective} own={!!p.rule} />
                    </div>
                  </summary>
                  <div className="bg-surface/30 px-5 pb-4">
                    <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-line bg-surface/60 text-xs font-semibold uppercase tracking-wide text-muted">
                          <tr>
                            <th className="px-4 py-2.5">Aplica-se a</th>
                            <th className="px-4 py-2.5 text-right">Margem</th>
                            <th className="px-4 py-2.5">Regra que vale</th>
                            {canEdit && <th className="px-4 py-2.5">Alterar</th>}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-line/70 bg-brand-50/30">
                            <td className="px-4 py-3 align-top">
                              <p className="font-semibold text-ink">Todos os tipos deste ingresso</p>
                              <p className="text-xs text-muted">Regra do ingresso inteiro</p>
                            </td>
                            <td className="px-4 py-3 text-right align-top font-semibold tabular">{pct(p.effective.pct)}</td>
                            <td className="px-4 py-3 align-top">
                              <SourceBadge e={p.effective} own={!!p.rule} />
                            </td>
                            {canEdit && (
                              <td className="px-4 py-3 align-top">
                                <div className="flex flex-wrap items-start gap-2">
                                  <MarginInlineForm
                                    action={saveTicketMarginAction}
                                    hidden={{ target: p.key }}
                                    value={p.rule?.pct ?? ""}
                                    placeholder={String(Number(p.effective.pct))}
                                    max={max}
                                    label={`Margem de ${p.title} (%)`}
                                  />
                                  {p.rule && <RemoveRuleForm action={deleteMarginRuleAction} ruleId={p.rule.id} />}
                                </div>
                              </td>
                            )}
                          </tr>
                          {p.options.map((o) => (
                            <tr key={o.key} className="border-b border-line/70 last:border-0">
                              <td className="px-4 py-3 align-top">
                                <p className="font-semibold text-ink">{o.title}</p>
                                {o.description && <p className="max-w-sm text-xs text-muted">{o.description}</p>}
                              </td>
                              <td className="px-4 py-3 text-right align-top font-semibold tabular">{pct(o.effective.pct)}</td>
                              <td className="px-4 py-3 align-top">
                                <SourceBadge e={o.effective} own={!!o.rule} />
                              </td>
                              {canEdit && (
                                <td className="px-4 py-3 align-top">
                                  <div className="flex flex-wrap items-start gap-2">
                                    <MarginInlineForm
                                      action={saveTicketMarginAction}
                                      hidden={{ target: o.key }}
                                      value={o.rule?.pct ?? ""}
                                      placeholder={String(Number(o.effective.pct))}
                                      max={max}
                                      label={`Margem de ${p.title} — ${o.title} (%)`}
                                    />
                                    {o.rule && <RemoveRuleForm action={deleteMarginRuleAction} ruleId={o.rule.id} />}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      {/* Regras específicas */}
      <Card>
        <CardHeader title="Regras específicas cadastradas" subtitle="Ingressos e tipos de ingresso com margem própria." />
        {ov.specificRules.length === 0 ? (
          <EmptyState
            icon={<Info className="h-8 w-8" aria-hidden />}
            title="Nenhuma regra específica"
            description="Use a seção “Por tipo de ingresso” para definir margens próprias."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Ingresso</Th>
                <Th>Tipo de regra</Th>
                <Th className="text-right">Margem</Th>
                <Th>Atualizada em</Th>
                {canEdit && <Th>Ações</Th>}
              </tr>
            </THead>
            <tbody>
              {ov.specificRules.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <p className="font-semibold text-ink">{r.title}</p>
                    {r.optionTitle && <p className="text-sm text-ink">{r.optionTitle}</p>}
                    {!r.inCatalog && <Badge tone="warning">não está mais no catálogo</Badge>}
                  </Td>
                  <Td>
                    <Badge tone={r.scope === "PRODUCT_OPTION" ? "brand" : "info"}>{MARGIN_SCOPE_LABEL[r.scope]}</Badge>
                  </Td>
                  <Td className="text-right text-base font-semibold tabular">{pct(r.pct)}</Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(r.updatedAt)}</Td>
                  {canEdit && (
                    <Td>
                      <div className="flex flex-wrap items-start gap-2">
                        <MarginInlineForm
                          action={updateMarginRuleAction}
                          hidden={{ ruleId: r.id }}
                          value={r.pct}
                          max={max}
                          label={`Margem de ${r.title}${r.optionTitle ? ` — ${r.optionTitle}` : ""} (%)`}
                        />
                        <RemoveRuleForm action={deleteMarginRuleAction} ruleId={r.id} />
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
