import { DateInput } from "@/components/date-picker";
import { CalendarDays, UserPlus } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { nationalHolidays } from "@/server/payouts/calendar";
import { listExtraHolidays, listSubrinhoUsers } from "@/server/subrinho/admin";
import { todayLocal } from "@/lib/tz";
import { dateTime, weekdayDate } from "@/lib/format";
import { ActiveBadge, ReadOnlyNotice, SectionTitle } from "../../_components/bits";
import { InlineActionButton } from "../../_components/inline-action";
import { canDo, PERMS, ROLE_LABEL } from "../../_lib/labels";
import { addHolidayAction, createSubrinhoUserAction, deleteHolidayAction, toggleSubrinhoUserAction, updateSettingsAction } from "./actions";
import { resetUserTotpAction } from "../seguranca/actions";

export const metadata = { title: "Configurações" };

const br = (v: string | number) => String(v).replace(".", ",");

function Suffix({ children }: { children: string }) {
  return <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{children}</span>;
}

export default async function SubrinhoSettingsPage() {
  const user = await requireSubrinhoUser();
  const canEdit = canDo(user.role, PERMS.settings);
  const today = todayLocal();
  const year = Number(today.slice(0, 4));
  const [s, extra, users] = await Promise.all([getSettings(db), listExtraHolidays(db), listSubrinhoUsers(db)]);
  const national = [...nationalHolidays(year), ...nationalHolidays(year + 1)]
    .filter(([dt]) => dt >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 10);
  const upcomingExtra = extra.filter((h) => h.date >= today);
  const pastExtra = extra.filter((h) => h.date < today);

  return (
    <>
      <PageHeader title="Configurações" subtitle="Parâmetros da plataforma, feriados para o calendário de repasses e equipe Subrinho." />
      {!canEdit && <ReadOnlyNotice>Somente Proprietários e Administradores podem alterar as configurações.</ReadOnlyNotice>}

      <Card className="mt-4">
        <CardHeader title="Parâmetros da plataforma" subtitle="Valem para novos preços, carrinhos e cobranças" />
        <CardBody className="py-5">
          <ActionForm action={updateSettingsAction}>
            <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <legend className="sr-only">Parâmetros</legend>
              <Field label="Taxa do parcelado" hint="Embutida no preço parcelado (0 a 99,99%)">
                <div className="relative">
                  <Input name="installmentFeePct" inputMode="decimal" required defaultValue={br(s.installmentFeePct)} className="pr-8" />
                  <Suffix>%</Suffix>
                </div>
              </Field>
              <Field label="Parcelas sem juros (máx.)" hint="1 a 24">
                <Input name="maxInstallments" type="number" min={1} max={24} step={1} required defaultValue={s.maxInstallments} />
              </Field>
              <Field label="Dias úteis para o repasse" hint="Após o fim da quinzena (padrão 5)">
                <Input name="payoutBusinessDays" type="number" min={1} max={30} step={1} required defaultValue={s.payoutBusinessDays} />
              </Field>
              <Field label="Validade da cobrança Pix" hint="Em minutos (5 a 1.440)">
                <div className="relative">
                  <Input name="pixExpirationMinutes" type="number" min={5} max={1440} step={1} required defaultValue={s.pixExpirationMinutes} className="pr-12" />
                  <Suffix>min</Suffix>
                </div>
              </Field>
              <Field label="Margem Subrinho do sistema" hint="Usada só se não existir a regra padrão em Margens">
                <div className="relative">
                  <Input name="fallbackSubrinhoMarginPct" inputMode="decimal" required defaultValue={br(s.fallbackSubrinhoMarginPct)} className="pr-8" />
                  <Suffix>%</Suffix>
                </div>
              </Field>
              <Field label="Margem padrão do afiliado" hint="Quando a agência não configurou margens">
                <div className="relative">
                  <Input name="fallbackAffiliateMarginPct" inputMode="decimal" required defaultValue={br(s.fallbackAffiliateMarginPct)} className="pr-8" />
                  <Suffix>%</Suffix>
                </div>
              </Field>
              <Field label="Margem máxima do afiliado" hint="Limite para regras e para alteração no checkout">
                <div className="relative">
                  <Input name="maxAffiliateMarginPct" inputMode="decimal" required defaultValue={br(s.maxAffiliateMarginPct)} className="pr-8" />
                  <Suffix>%</Suffix>
                </div>
              </Field>
              {canEdit && (
                <div className="flex items-end">
                  <SubmitButton className="w-full">Salvar parâmetros</SubmitButton>
                </div>
              )}
            </fieldset>
          </ActionForm>
        </CardBody>
      </Card>

      <SectionTitle hint="Dias úteis = segunda a sexta, exceto feriados nacionais (automáticos) e os feriados extras cadastrados aqui.">Feriados</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Feriados extras" subtitle="Ex.: feriados municipais/estaduais sem expediente bancário" />
          {canEdit && (
            <CardBody className="border-b border-line">
              <ActionForm action={addHolidayAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                <Field label="Data">
                  <DateInput name="date" />
                </Field>
                <Field label="Nome">
                  <Input name="name" required minLength={2} maxLength={120} placeholder="Aniversário de São Paulo" />
                </Field>
                <SubmitButton>Adicionar</SubmitButton>
              </ActionForm>
            </CardBody>
          )}
          {extra.length === 0 ? (
            <EmptyState title="Nenhum feriado extra" icon={<CalendarDays className="h-10 w-10" />} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Data</Th>
                  <Th>Nome</Th>
                  {canEdit && (
                    <Th>
                      <span className="sr-only">Ações</span>
                    </Th>
                  )}
                </tr>
              </THead>
              <tbody>
                {[...upcomingExtra, ...pastExtra].map((h) => (
                  <Tr key={h.date} className={h.date < today ? "opacity-60" : undefined}>
                    <Td className="whitespace-nowrap font-semibold capitalize">{weekdayDate(h.date)}</Td>
                    <Td>
                      {h.name} {h.date < today && <Badge>passado</Badge>}
                    </Td>
                    {canEdit && (
                      <Td className="text-right">
                        <InlineActionButton action={deleteHolidayAction} fields={{ date: h.date }} variant="ghost" confirmMessage={`Remover o feriado “${h.name}”?`}>
                          Remover
                        </InlineActionButton>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Próximos feriados nacionais" subtitle="Calculados automaticamente (inclui Carnaval e Corpus Christi)" />
          <Table>
            <THead>
              <tr>
                <Th>Data</Th>
                <Th>Feriado</Th>
              </tr>
            </THead>
            <tbody>
              {national.map(([dt, name]) => (
                <Tr key={dt}>
                  <Td className="whitespace-nowrap font-semibold capitalize">{weekdayDate(dt)}</Td>
                  <Td>{name}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <SectionTitle>Equipe Subrinho</SectionTitle>
      <Card>
        <CardHeader
          title={`Usuários (${users.length})`}
          subtitle="Proprietário e Administrador alteram tudo · Financeiro: pedidos, câmbio, repasses e relatórios · Suporte: somente leitura"
          actions={
            canEdit && (
              <Modal
                title="Novo usuário da equipe"
                triggerClassName={buttonClass("primary", "sm")}
                trigger={
                  <>
                    <UserPlus className="h-4 w-4" aria-hidden /> Novo usuário
                  </>
                }
              >
                <ActionForm action={createSubrinhoUserAction} resetOnSuccess className="space-y-4">
                  <Field label="Nome">
                    <Input name="name" required maxLength={120} autoComplete="off" />
                  </Field>
                  <Field label="E-mail">
                    <Input type="email" name="email" required maxLength={200} autoComplete="off" />
                  </Field>
                  <Field label="Senha inicial" hint="Mínimo 8 caracteres">
                    <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
                  </Field>
                  <Field label="Perfil">
                    <Select name="role" defaultValue="FINANCE">
                      {(["ADMIN", "FINANCE", "SUPPORT", ...(user.role === "OWNER" ? (["OWNER"] as const) : [])] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton pendingText="Criando…">Criar usuário</SubmitButton>
                </ActionForm>
              </Modal>
            )
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>Nome</Th>
              <Th>Perfil</Th>
              <Th>Status</Th>
              <Th>Desde</Th>
              {canEdit && (
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              )}
            </tr>
          </THead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="font-semibold">
                    {u.name} {u.id === user.id && <span className="text-xs font-semibold text-muted">(você)</span>}
                  </div>
                  <div className="break-all text-xs text-muted">{u.email}</div>
                </Td>
                <Td>
                  <Badge tone={u.role === "OWNER" ? "dark" : u.role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                </Td>
                <Td>
                  <ActiveBadge active={u.active} />
                  <span className="mt-1 block text-xs text-muted">{u.totpEnabledAt ? "Duas etapas: ligada" : "Duas etapas: desligada"}</span>
                </Td>
                <Td className="whitespace-nowrap text-xs">{dateTime(u.createdAt)}</Td>
                {canEdit && (
                  <Td className="text-right">
                    {u.id !== user.id && (u.role !== "OWNER" || user.role === "OWNER") && (
                      <InlineActionButton
                        action={toggleSubrinhoUserAction}
                        fields={{ id: u.id, active: u.active ? "0" : "1" }}
                        variant={u.active ? "ghost" : "secondary"}
                        confirmMessage={u.active ? `Desativar o acesso de ${u.name}? As sessões abertas serão encerradas.` : undefined}
                      >
                        {u.active ? "Desativar" : "Reativar"}
                      </InlineActionButton>
                    )}
                    {user.role === "OWNER" && u.id !== user.id && u.totpEnabledAt && (
                      <InlineActionButton action={resetUserTotpAction} fields={{ id: u.id }} variant="ghost" confirmMessage={`Desligar a verificação em duas etapas de ${u.name}? Use quando a pessoa perdeu o celular.`}>
                        Desligar duas etapas
                      </InlineActionButton>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
