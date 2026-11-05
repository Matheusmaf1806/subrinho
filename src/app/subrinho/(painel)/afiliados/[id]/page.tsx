import Link from "next/link";
import { storePublicUrl } from "@/server/store-links";
import { notFound } from "next/navigation";
import { ExternalLink, Paperclip, UserPlus } from "lucide-react";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Stat,
  Table,
  Td,
  Th,
  THead,
  Tr,
  buttonClass,
} from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listAffiliateUsers } from "@/server/admin/affiliates";
import { listMarginRules } from "@/server/admin/margins";
import { listOrdersForSubrinho } from "@/server/orders/queries";
import { affiliatePayouts, getAffiliateWithStats } from "@/server/subrinho/affiliates";
import { brl, date, dateTime, orderNumber, pct } from "@/lib/format";
import { ActiveBadge, Fit, InfoList, OrderStatusBadge, PayoutStatusBadge, ReadOnlyNotice, SectionTitle } from "../../../_components/bits";
import { periodLabel } from "../../../_lib/dates";
import { isUuid } from "../../../_lib/form";
import { canDo, PERMS, SCOPE_LABEL } from "../../../_lib/labels";
import { ruleTarget } from "../../../_lib/rules";
import { addAffiliateUserAction, updateAffiliateAction, updateAffiliateBrandingAction, updateAffiliateDomainsAction, updateAffiliateLegalAction, verifyAffiliateDomainAction } from "../actions";
import { StoreDomainCard } from "@/components/store-domain-card";
import { StoreLegalCard } from "@/components/store-legal-card";
import { BrandingEditor } from "@/components/branding-editor";
import { brandingInitial, brandPresets } from "@/lib/branding-view";
import { AffiliateFields } from "../affiliate-fields";

export const metadata = { title: "Afiliado" };

export default async function AffiliateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSubrinhoUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const row = await getAffiliateWithStats(db, id);
  if (!row) notFound();
  const a = row.affiliate;
  const [users, rules, payoutRows, orders] = await Promise.all([
    listAffiliateUsers(db, id),
    listMarginRules(db, "AFFILIATE", id),
    affiliatePayouts(db, id),
    listOrdersForSubrinho(db, { affiliateId: id, limit: 10 }),
  ]);
  const canEdit = canDo(user.role, PERMS.affiliates);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/subrinho/afiliados" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand-ink">
            ← Afiliados
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            <span className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: a.brandColor }} aria-hidden />
            {a.name} <ActiveBadge active={a.active} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            {a.legalName ?? "Razão social não informada"} {a.document && <>· {a.document}</>} · cadastrado em {date(a.createdAt)}
          </p>
        </div>
        <ButtonLink href={storePublicUrl(a)} target="_blank" variant="outline">
          /loja/{a.slug} <ExternalLink className="h-4 w-4" aria-hidden />
          <span className="sr-only">(abre em nova aba)</span>
        </ButtonLink>
      </div>

      {sp.novo && (
        <Alert tone="success" className="mb-6" title="Afiliado cadastrado!">
          A loja já está disponível em /loja/{a.slug} e o usuário ADMIN pode entrar no Painel do Afiliado.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Stat label="Pedidos pagos" value={row.paidOrders} />
        <Stat label="GMV" value={<Fit>{brl(row.gmv)}</Fit>} tone="brand" />
        <Stat label="Receita Subrinho" value={<Fit>{brl(row.subrinhoRevenue)}</Fit>} tone="dark" />
        <Stat label="Comissão total" value={<Fit>{brl(row.commission)}</Fit>} />
        <Stat label="Clientes da loja" value={row.customersCount} />
      </div>

      <section className="mt-10">
        <h2 className="text-[1.75rem] font-semibold tracking-[-0.04em]">Identidade da loja (white-label)</h2>
        <p className="mb-5 mt-1 text-[15px] text-muted">Logo, cores, fonte e conteúdo: tudo personalizado para {a.name}. Aqui também se decide se a loja mostra “tecnologia Subrinho”.</p>
        <BrandingEditor
          action={updateAffiliateBrandingAction}
          initial={brandingInitial(a)}
          presets={brandPresets()}
          readOnly={!canEdit}
          allowPoweredBy
          hidden={{ id: a.id }}
        />
      </section>

      <div className="mt-6">
        <StoreDomainCard store={a} save={updateAffiliateDomainsAction} verify={verifyAffiliateDomainAction} readOnly={!canEdit} hidden={{ affiliateId: a.id }} />
        <StoreLegalCard store={a} save={updateAffiliateLegalAction} readOnly={!canEdit} hidden={{ affiliateId: a.id }} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title="Cadastro" subtitle="Dados da agência, da loja e para repasse" />
          <CardBody className="py-5">
            {canEdit ? (
              <ActionForm action={updateAffiliateAction} className="space-y-6">
                <input type="hidden" name="id" value={a.id} />
                <AffiliateFields a={a} />
                <div className="flex justify-end">
                  <SubmitButton>Salvar alterações</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <div className="space-y-4">
                <ReadOnlyNotice />
                <InfoList
                  items={[
                    { label: "E-mail", value: a.email },
                    { label: "Telefone", value: a.phone },
                    { label: "WhatsApp", value: a.whatsapp },
                    { label: "Chave Pix", value: a.pixKey },
                    { label: "Banco", value: a.bankName },
                    { label: "Agência / Conta", value: [a.bankAgency, a.bankAccount].filter(Boolean).join(" / ") || null },
                  ]}
                />
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title={`Usuários (${users.length})`}
              subtitle="Acesso ao Painel do Afiliado"
              actions={
                canEdit && (
                  <Modal
                    title="Novo usuário da agência"
                    triggerClassName={buttonClass("secondary", "sm")}
                    trigger={
                      <>
                        <UserPlus className="h-4 w-4" aria-hidden /> Adicionar
                      </>
                    }
                  >
                    <ActionForm action={addAffiliateUserAction} resetOnSuccess className="space-y-4">
                      <input type="hidden" name="affiliateId" value={a.id} />
                      <Field label="Nome">
                        <Input name="name" required maxLength={120} autoComplete="off" />
                      </Field>
                      <Field label="E-mail">
                        <Input type="email" name="email" required maxLength={200} autoComplete="off" />
                      </Field>
                      <Field label="Senha inicial" hint="Mínimo 8 caracteres">
                        <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
                      </Field>
                      <Field label="Perfil" hint="ADMIN altera margens, cupons e usa o modo ADMIN na loja.">
                        <Select name="role" defaultValue="AGENT">
                          <option value="AGENT">Agente</option>
                          <option value="ADMIN">ADMIN</option>
                        </Select>
                      </Field>
                      <SubmitButton pendingText="Criando…">Criar usuário</SubmitButton>
                    </ActionForm>
                  </Modal>
                )
              }
            />
            {users.length === 0 ? (
              <EmptyState title="Nenhum usuário" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Perfil</Th>
                    <Th>Status</Th>
                  </tr>
                </THead>
                <tbody>
                  {users.map((u) => (
                    <Tr key={u.id}>
                      <Td>
                        <div className="font-semibold">{u.name}</div>
                        <div className="break-all text-xs text-muted">{u.email}</div>
                      </Td>
                      <Td>
                        <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>{u.role === "ADMIN" ? "ADMIN" : "Agente"}</Badge>
                      </Td>
                      <Td>
                        <ActiveBadge active={u.active} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Margens do afiliado" subtitle="Definidas pela agência no Painel do Afiliado (somente leitura)" />
            {rules.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">Nenhuma regra. Usa a margem padrão do sistema.</p>
              </CardBody>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Escopo</Th>
                    <Th>Alvo</Th>
                    <Th className="text-right">Margem</Th>
                  </tr>
                </THead>
                <tbody>
                  {rules.map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap">{SCOPE_LABEL[r.scope]}</Td>
                      <Td>
                        {ruleTarget(r)}
                        <div className="text-[11px] text-muted">atualizada {dateTime(r.updatedAt)}</div>
                      </Td>
                      <Td className="text-right font-semibold tabular">{pct(r.marginPct)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      <SectionTitle>Repasses</SectionTitle>
      <Card>
        {payoutRows.length === 0 ? (
          <EmptyState title="Nenhum repasse ainda" description="Os repasses são gerados no fechamento de cada quinzena." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Quinzena</Th>
                <Th>Data prevista</Th>
                <Th className="text-right">Pedidos</Th>
                <Th className="text-right">Vendas</Th>
                <Th className="text-right">Valor</Th>
                <Th>Status</Th>
                <Th>Comprovantes</Th>
              </tr>
            </THead>
            <tbody>
              {payoutRows.map((p) => (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">{periodLabel(p.periodStart, p.periodEnd)}</Td>
                  <Td className="whitespace-nowrap">{date(p.scheduledDate)}</Td>
                  <Td className="text-right tabular">{p.ordersCount}</Td>
                  <Td className="text-right tabular">{brl(p.grossSales)}</Td>
                  <Td className="text-right font-semibold tabular">{brl(p.amount)}</Td>
                  <Td>
                    <PayoutStatusBadge status={p.status} />
                    {p.paidAt && <div className="text-[11px] text-muted">{dateTime(p.paidAt)}</div>}
                  </Td>
                  <Td>
                    {p.proofs.length === 0 ? (
                      <span className="text-muted">-</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {p.proofs.map((f) => (
                          <li key={f.id}>
                            <a href={`/api/files/${f.fileId}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline">
                              <Paperclip className="h-3 w-3" aria-hidden /> {f.filename}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-2 text-right">
        <Link href={`/subrinho/repasses?afiliado=${a.id}`} className="text-sm font-semibold text-brand-ink hover:underline">
          Gerenciar repasses deste afiliado →
        </Link>
      </div>

      <SectionTitle>Últimos pedidos</SectionTitle>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="Nenhum pedido nesta loja" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Pedido</Th>
                <Th>Cliente</Th>
                <Th>Status</Th>
                <Th>Criado em</Th>
                <Th className="text-right">Cobrado</Th>
                <Th className="text-right">Comissão</Th>
              </tr>
            </THead>
            <tbody>
              {orders.map(({ order: o }) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`/subrinho/pedidos/${o.id}`} className="font-semibold text-brand-ink hover:underline">
                      {orderNumber(o.number)}
                    </Link>
                  </Td>
                  <Td>{o.customerData.name}</Td>
                  <Td>
                    <OrderStatusBadge status={o.status} />
                  </Td>
                  <Td className="whitespace-nowrap">{dateTime(o.createdAt)}</Td>
                  <Td className="text-right font-semibold tabular">{brl(o.amountCharged)}</Td>
                  <Td className="text-right tabular">{brl(o.affiliateCommission)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-2 text-right">
        <Link href={`/subrinho/pedidos?afiliado=${a.id}`} className="text-sm font-semibold text-brand-ink hover:underline">
          Ver todos os pedidos →
        </Link>
      </div>
    </>
  );
}
