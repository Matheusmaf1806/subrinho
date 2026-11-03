import { RefreshCw } from "lucide-react";
import { inArray } from "drizzle-orm";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th, THead, Tr } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { subrinhoUsers } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { FOREIGN_CURRENCIES, fxHistory, getCurrentFx } from "@/server/fx";
import { dateTime, fxRate } from "@/lib/format";
import { ReadOnlyNotice } from "../../_components/bits";
import { canDo, CURRENCY_LABEL, PERMS } from "../../_lib/labels";
import { recordManualFxAction, refreshFxAction } from "./actions";

export const metadata = { title: "Câmbio" };

const PROVIDER_LABEL: Record<string, string> = {
  poolvo: "Dólar Poolvo (API)",
  awesomeapi: "AwesomeAPI",
  manual: "Manual (sem provedor automático)",
};

export default async function SubrinhoFxPage() {
  const user = await requireSubrinhoUser();
  const canEdit = canDo(user.role, PERMS.fx);
  const [current, history] = await Promise.all([getCurrentFx(db), fxHistory(db, 100)]);
  const creatorIds = [...new Set(history.map((h) => h.createdBy).filter((x): x is string => !!x))];
  const creators = creatorIds.length
    ? await db.select({ id: subrinhoUsers.id, name: subrinhoUsers.name }).from(subrinhoUsers).where(inArray(subrinhoUsers.id, creatorIds))
    : [];
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));
  const provider = process.env.FX_PROVIDER || "manual";

  // variação em relação à cotação anterior da mesma moeda
  const prevOf = new Map<number, string>();
  for (const c of FOREIGN_CURRENCIES) {
    const list = history.filter((h) => h.currency === c);
    list.forEach((h, i) => {
      if (list[i + 1]) prevOf.set(h.id, list[i + 1].rate);
    });
  }

  return (
    <>
      <PageHeader
        title="Câmbio"
        subtitle="O preço de todo item em moeda estrangeira usa a cotação mais recente. Cada pedido congela a cotação usada."
        actions={
          canEdit && (
            <ActionForm action={refreshFxAction}>
              <SubmitButton variant="outline" pendingText="Consultando…">
                <RefreshCw className="h-4 w-4" aria-hidden /> Atualizar pela API
              </SubmitButton>
            </ActionForm>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FOREIGN_CURRENCIES.map((c) => {
          const r = current[c];
          return (
            <Card key={c} className="p-5">
              <p className="text-sm font-semibold text-muted">{CURRENCY_LABEL[c]} → BRL</p>
              <p className="mt-2 text-4xl font-semibold tabular text-ink">{r ? `R$ ${fxRate(r.rate)}` : "—"}</p>
              <p className="mt-1 text-xs text-muted">
                {r ? (
                  <>
                    Fonte <strong className="text-ink">{r.source}</strong> · {dateTime(r.fetchedAt)}
                  </>
                ) : (
                  "Sem cotação — itens nesta moeda não podem ser vendidos"
                )}
              </p>
            </Card>
          );
        })}
        <Card className="p-5 sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-semibold text-muted">Provedor automático</p>
          <p className="mt-2 text-lg font-semibold text-ink">{PROVIDER_LABEL[provider] ?? provider}</p>
          <p className="mt-1 text-xs text-muted">
            Definido por <code className="rounded bg-surface px-1">FX_PROVIDER</code> no servidor. O agendador chama{" "}
            <code className="rounded bg-surface px-1">/api/cron/fx-refresh</code>.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card className="self-start">
          <CardHeader title="Registrar cotação manual" subtitle="Passa a valer imediatamente para novos preços" />
          <CardBody>
            {canEdit ? (
              <ActionForm action={recordManualFxAction} resetOnSuccess className="space-y-4">
                <Field label="Moeda">
                  <Select name="currency" defaultValue="USD">
                    {FOREIGN_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {CURRENCY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cotação em R$" hint="Ex.: 4,93 (até 6 casas decimais)">
                  <Input name="rate" inputMode="decimal" required placeholder="4,93" autoComplete="off" />
                </Field>
                <SubmitButton pendingText="Registrando…">Registrar cotação</SubmitButton>
              </ActionForm>
            ) : (
              <ReadOnlyNotice>Somente Administradores e Financeiro podem registrar cotações.</ReadOnlyNotice>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Histórico" subtitle="Últimas 100 cotações" />
          {history.length === 0 ? (
            <EmptyState title="Nenhuma cotação registrada" />
          ) : (
            <Table className="max-h-[32rem] overflow-y-auto">
              <THead>
                <tr>
                  <Th>Data/hora</Th>
                  <Th>Moeda</Th>
                  <Th className="text-right">Cotação</Th>
                  <Th className="text-right">Variação</Th>
                  <Th>Fonte</Th>
                  <Th>Registrada por</Th>
                </tr>
              </THead>
              <tbody>
                {history.map((h) => {
                  const prev = prevOf.get(h.id);
                  const delta = prev ? ((Number(h.rate) - Number(prev)) / Number(prev)) * 100 : null;
                  return (
                    <Tr key={h.id}>
                      <Td className="whitespace-nowrap">{dateTime(h.fetchedAt)}</Td>
                      <Td className="font-semibold">{h.currency}</Td>
                      <Td className="text-right font-semibold tabular">{fxRate(h.rate)}</Td>
                      <Td className={`text-right text-xs font-semibold tabular ${delta === null ? "text-muted" : delta > 0 ? "text-red-700" : delta < 0 ? "text-emerald-700" : "text-muted"}`}>
                        {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2).replace(".", ",")}%`}
                      </Td>
                      <Td>
                        <Badge tone={h.source === "manual" ? "neutral" : "info"}>{h.source}</Badge>
                      </Td>
                      <Td className="text-sm">{h.createdBy ? (creatorName.get(h.createdBy) ?? "—") : h.source === "manual" ? "—" : "Automático"}</Td>
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
