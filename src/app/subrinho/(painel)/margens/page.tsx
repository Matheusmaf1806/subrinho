import Form from "next/form";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { db } from "@/server/db";
import type { marginRules } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listMarginRules } from "@/server/admin/margins";
import { getCurrentFx } from "@/server/fx";
import { getSettings } from "@/server/settings";
import { SUPPLIERS } from "@/server/suppliers/registry";
import { ACTIVE_CATEGORIES, CATEGORY_LABEL, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { productOptions, supplierProducts } from "@/server/subrinho/catalog";
import { dateTime, pct } from "@/lib/format";
import { ReadOnlyNotice } from "../../_components/bits";
import { AutoSubmitSelect, InlineActionButton, InlinePercentForm } from "../../_components/inline-action";
import { canDo, PERMS, SCOPE_LABEL } from "../../_lib/labels";
import { supplierName } from "../../_lib/rules";
import { deleteSubrinhoMarginAction, upsertSubrinhoMarginAction } from "./actions";
import { PriceCalculator } from "./calculator";

export const metadata = { title: "Margens" };

type Rule = typeof marginRules.$inferSelect;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pctInput = (v: string | null | undefined) => (v ? String(Number(v)).replace(".", ",") : "");

function RuleControls({ canEdit, rule, fields, label, placeholder }: { canEdit: boolean; rule?: Rule; fields: Record<string, string | null | undefined>; label: string; placeholder?: string }) {
  if (!canEdit) return <span className="font-extrabold tabular">{rule ? pct(rule.marginPct) : "—"}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InlinePercentForm action={upsertSubrinhoMarginAction} fields={fields} defaultValue={pctInput(rule?.marginPct)} placeholder={placeholder} label={label} />
      {rule && rule.scope !== "DEFAULT" && (
        <InlineActionButton action={deleteSubrinhoMarginAction} fields={{ id: rule.id }} variant="ghost" confirmMessage="Remover esta regra? O item passa a usar a regra menos específica.">
          Remover
        </InlineActionButton>
      )}
    </div>
  );
}

export default async function SubrinhoMarginsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSubrinhoUser();
  const sp = await searchParams;
  const canEdit = canDo(user.role, PERMS.margins);
  const [rules, settings, fx] = await Promise.all([listMarginRules(db, "SUBRINHO"), getSettings(db), getCurrentFx(db)]);

  const def = rules.find((r) => r.scope === "DEFAULT");
  const defaultPct = def?.marginPct ?? settings.fallbackSubrinhoMarginPct;
  const byCat = new Map(rules.filter((r) => r.scope === "CATEGORY").map((r) => [r.category, r]));
  const bySup = new Map(rules.filter((r) => r.scope === "SUPPLIER").map((r) => [r.supplierCode, r]));
  const productRules = rules.filter((r) => r.scope === "PRODUCT" || r.scope === "PRODUCT_OPTION");

  const supplierCode = SUPPLIERS.some((s) => s.code === one(sp.fornecedor)) ? one(sp.fornecedor) : "";
  const supplierMeta = SUPPLIERS.find((s) => s.code === supplierCode);
  const products = supplierCode ? await supplierProducts(supplierCode) : [];
  const productId = products.some((p) => p.productId === one(sp.produto)) ? one(sp.produto) : "";
  const picked = supplierCode && productId ? await productOptions(supplierCode, productId) : null;
  const pickedProduct = picked?.product ?? products.find((p) => p.productId === productId) ?? null;

  const inherited = (category: string | null) => (category ? (byCat.get(category as never)?.marginPct ?? defaultPct) : defaultPct);
  const productRule = (pid: string) => productRules.find((r) => r.scope === "PRODUCT" && r.supplierCode === supplierCode && r.productId === pid);
  const optionRule = (pid: string, oid: string) =>
    productRules.find((r) => r.scope === "PRODUCT_OPTION" && r.supplierCode === supplierCode && r.productId === pid && r.optionId === oid);

  return (
    <>
      <PageHeader
        title="Margens Subrinho"
        subtitle="A regra mais específica vence: opção do produto › produto › fornecedor › categoria › padrão."
      />
      {!canEdit && <ReadOnlyNotice>Somente Administradores podem alterar as margens.</ReadOnlyNotice>}

      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_1.35fr]">
        <Card>
          <CardHeader title="Margem padrão" subtitle="Vale para tudo que não tiver uma regra mais específica" />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-black tabular text-brand">{pct(defaultPct)}</p>
                <p className="text-xs text-muted">
                  {def ? `Atualizada em ${dateTime(def.updatedAt)}` : `Sem regra padrão — usando a margem do sistema (${pct(settings.fallbackSubrinhoMarginPct)}, em Configurações)`}
                </p>
              </div>
              {canEdit && (
                <InlinePercentForm action={upsertSubrinhoMarginAction} fields={{ scope: "DEFAULT", label: "Padrão Subrinho" }} defaultValue={pctInput(defaultPct)} label="Margem padrão Subrinho" />
              )}
            </div>
            <div className="rounded-xl bg-cream/70 p-4 text-sm text-muted">
              <p className="font-bold text-ink">Como o preço é formado</p>
              <p className="mt-1">
                Custo R$ ÷ (1 − margem Subrinho) = <strong className="text-ink">NET Subrinho</strong> ÷ (1 − margem afiliado) ={" "}
                <strong className="text-ink">NET Afiliado (PIX)</strong> ÷ (1 − taxa {pct(settings.installmentFeePct)}) = <strong className="text-ink">PARCELADO</strong>.
                Cupons Subrinho descontam apenas da margem Subrinho, nunca abaixo de 0%.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Calculadora" subtitle="Reproduz o exemplo da especificação: $100 × 5 × 4,93 → R$ 2.967,58 no parcelado" />
          <CardBody>
            <PriceCalculator
              defaults={{
                fx: { USD: fx.USD?.rate, EUR: fx.EUR?.rate },
                subrinhoMarginPct: defaultPct,
                affiliateMarginPct: settings.fallbackAffiliateMarginPct,
                installmentFeePct: settings.installmentFeePct,
                maxInstallments: settings.maxInstallments,
              }}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Por categoria" subtitle="Vazio = herda a margem padrão" />
          <Table>
            <THead>
              <tr>
                <Th>Categoria</Th>
                <Th>Vigente</Th>
                <Th>Regra</Th>
              </tr>
            </THead>
            <tbody>
              {[...ACTIVE_CATEGORIES, ...FUTURE_CATEGORIES].map((c) => {
                const rule = byCat.get(c);
                const future = FUTURE_CATEGORIES.includes(c);
                return (
                  <Tr key={c}>
                    <Td className="font-bold">
                      {CATEGORY_LABEL[c]} {future && <Badge tone="info">em breve</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap tabular">
                      <span className={rule ? "font-extrabold text-ink" : "text-muted"}>{pct(rule?.marginPct ?? defaultPct)}</span>
                      {!rule && <span className="block text-[11px] text-muted">herdada</span>}
                    </Td>
                    <Td>
                      <RuleControls
                        canEdit={canEdit}
                        rule={rule}
                        fields={{ scope: "CATEGORY", category: c, label: CATEGORY_LABEL[c] }}
                        label={`Margem Subrinho para ${CATEGORY_LABEL[c]}`}
                        placeholder={pctInput(defaultPct)}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Por fornecedor" subtitle="Vazio = herda a margem da categoria" />
          <Table>
            <THead>
              <tr>
                <Th>Fornecedor</Th>
                <Th>Vigente</Th>
                <Th>Regra</Th>
              </tr>
            </THead>
            <tbody>
              {SUPPLIERS.map((s) => {
                const rule = bySup.get(s.code);
                return (
                  <Tr key={s.code}>
                    <Td>
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted">
                        {CATEGORY_LABEL[s.category]} · {s.defaultCurrency}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap tabular">
                      <span className={rule ? "font-extrabold text-ink" : "text-muted"}>{pct(rule?.marginPct ?? inherited(s.category))}</span>
                      {!rule && <span className="block text-[11px] text-muted">herdada</span>}
                    </Td>
                    <Td>
                      <RuleControls
                        canEdit={canEdit}
                        rule={rule}
                        fields={{ scope: "SUPPLIER", supplierCode: s.code, label: s.name }}
                        label={`Margem Subrinho para ${s.name}`}
                        placeholder={pctInput(inherited(s.category))}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Por produto e opção" subtitle="Ex.: “Coliseu” (produto) ou “Coliseu + Vaticano” (opção do produto)" />
        {productRules.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">Nenhuma regra por produto ainda. Use o seletor abaixo para criar.</p>
          </CardBody>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Escopo</Th>
                <Th>Produto / opção</Th>
                <Th>Fornecedor</Th>
                <Th>Margem</Th>
              </tr>
            </THead>
            <tbody>
              {productRules.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">
                    <Badge tone={r.scope === "PRODUCT_OPTION" ? "brand" : "info"}>{SCOPE_LABEL[r.scope]}</Badge>
                  </Td>
                  <Td>
                    <div className="font-bold">{r.label ?? r.productId}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {r.productId}
                      {r.optionId ? ` / ${r.optionId}` : ""}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{supplierName(r.supplierCode)}</Td>
                  <Td>
                    <RuleControls
                      canEdit={canEdit}
                      rule={r}
                      fields={{ scope: r.scope, supplierCode: r.supplierCode, productId: r.productId, optionId: r.optionId, label: r.label }}
                      label={`Margem Subrinho para ${r.label ?? r.productId}`}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        {canEdit && (
          <CardBody className="border-t border-line bg-cream/30" id="seletor">
            <h4 className="mb-3 text-sm font-black uppercase tracking-wide text-muted">Nova regra por produto</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <Form action="/subrinho/margens" className="flex items-end gap-2">
                <Field label="1. Fornecedor" className="flex-1">
                  <AutoSubmitSelect name="fornecedor" defaultValue={supplierCode}>
                    <option value="">Escolha…</option>
                    {SUPPLIERS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} — {CATEGORY_LABEL[s.category]}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                </Field>
                <noscript>
                  <button type="submit" className={buttonClass("outline", "md")}>
                    Carregar
                  </button>
                </noscript>
              </Form>
              {supplierCode && (
                <Form action="/subrinho/margens" className="flex items-end gap-2">
                  <input type="hidden" name="fornecedor" value={supplierCode} />
                  <Field label="2. Produto" className="flex-1">
                    <AutoSubmitSelect name="produto" defaultValue={productId} key={supplierCode}>
                      <option value="">{products.length ? "Escolha…" : "Nenhum produto encontrado"}</option>
                      {products.map((p) => (
                        <option key={p.productId} value={p.productId}>
                          {p.title} — {p.location}
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </Field>
                  <noscript>
                    <button type="submit" className={buttonClass("outline", "md")}>
                      Ver opções
                    </button>
                  </noscript>
                </Form>
              )}
            </div>

            {supplierMeta && pickedProduct && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white">
                <div className="border-b border-line px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {supplierMeta.name} · {CATEGORY_LABEL[supplierMeta.category]}
                  </p>
                  <p className="font-extrabold text-ink">{pickedProduct.title}</p>
                  <p className="text-xs text-muted">
                    {pickedProduct.location} · <span className="font-mono">{pickedProduct.productId}</span>
                  </p>
                </div>
                <Table>
                  <THead>
                    <tr>
                      <Th>Alvo</Th>
                      <Th>Vigente</Th>
                      <Th>Margem Subrinho</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {(() => {
                      const pr = productRule(pickedProduct.productId);
                      const supplierPct = bySup.get(supplierMeta.code)?.marginPct ?? inherited(supplierMeta.category);
                      const productPct = pr?.marginPct ?? supplierPct;
                      return (
                        <>
                          <Tr>
                            <Td>
                              <span className="font-bold">Produto inteiro</span>
                              <span className="block text-xs text-muted">todas as opções</span>
                            </Td>
                            <Td className="tabular">
                              <span className={pr ? "font-extrabold" : "text-muted"}>{pct(productPct)}</span>
                            </Td>
                            <Td>
                              <RuleControls
                                canEdit={canEdit}
                                rule={pr}
                                fields={{ scope: "PRODUCT", supplierCode: supplierMeta.code, productId: pickedProduct.productId, label: pickedProduct.title }}
                                label={`Margem para o produto ${pickedProduct.title}`}
                                placeholder={pctInput(supplierPct)}
                              />
                            </Td>
                          </Tr>
                          {(picked?.options ?? []).map((o) => {
                            const or = optionRule(pickedProduct.productId, o.optionId);
                            return (
                              <Tr key={o.optionId}>
                                <Td>
                                  <span className="font-bold">{o.title}</span>
                                  <span className="block font-mono text-[11px] text-muted">{o.optionId}</span>
                                </Td>
                                <Td className="tabular">
                                  <span className={or ? "font-extrabold" : "text-muted"}>{pct(or?.marginPct ?? productPct)}</span>
                                </Td>
                                <Td>
                                  <RuleControls
                                    canEdit={canEdit}
                                    rule={or}
                                    fields={{
                                      scope: "PRODUCT_OPTION",
                                      supplierCode: supplierMeta.code,
                                      productId: pickedProduct.productId,
                                      optionId: o.optionId,
                                      label: `${pickedProduct.title} — ${o.title}`,
                                    }}
                                    label={`Margem para a opção ${o.title}`}
                                    placeholder={pctInput(productPct)}
                                  />
                                </Td>
                              </Tr>
                            );
                          })}
                        </>
                      );
                    })()}
                  </tbody>
                </Table>
                {(picked?.options ?? []).length === 0 && <EmptyState title="Este produto não tem opções separadas" />}
              </div>
            )}
          </CardBody>
        )}
      </Card>
    </>
  );
}
