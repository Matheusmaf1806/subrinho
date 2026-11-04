import { Plug, Sparkles } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listSuppliersForSubrinho } from "@/server/subrinho/admin";
import { CATEGORY_LABEL, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { brl } from "@/lib/format";
import { ActiveBadge, ReadOnlyNotice } from "../../_components/bits";
import { InlineActionButton } from "../../_components/inline-action";
import { canDo, PERMS } from "../../_lib/labels";
import { syncDestinationsAction, testIntegrationAction, toggleSupplierAction } from "./actions";
import { hotelIntegrations } from "@/server/suppliers/hotels/admin";
import { supplierModes, suppliersMode } from "@/server/suppliers/registry";
import { dateTime } from "@/lib/format";

// sincronizar destinos baixa ~75 mil cidades da GGT (limite seguro do plano Hobby da Vercel)
export const maxDuration = 60;

export const metadata = { title: "Fornecedores" };

const FUTURE_HINT: Record<string, string> = {
  CAR_RENTAL: "Locadoras com retirada e devolução, seguros inclusos",
  REMOTE_GUIDE: "Guia brasileiro acompanhando a viagem pelo WhatsApp",
  CRUISE: "Cabines e roteiros de cruzeiros marítimos",
  TRANSFER: "Aeroporto ↔ hotel, privativo ou compartilhado",
  ITINERARY: "Roteiro personalizado dia a dia",
};

export default async function SubrinhoSuppliersPage() {
  const user = await requireSubrinhoUser();
  const canEdit = canDo(user.role, PERMS.suppliers);
  const [rows, integrations] = await Promise.all([listSuppliersForSubrinho(db), hotelIntegrations()]);
  const mode = suppliersMode();
  const modes = new Map(supplierModes().map((m) => [m.code, m.mode]));

  return (
    <>
      <PageHeader title="Fornecedores" subtitle="Integrações que abastecem o catálogo das lojas. Fornecedor inativo some da busca e não pode ser vendido." />

      <Alert tone={mode === "mock" ? "warning" : "info"} className="mb-6" title={mode === "mock" ? "Modo simulado (SUPPLIERS_MODE=mock)" : "Integrações automáticas"}>
        {mode === "mock" ? (
          <>
            Com <code className="rounded bg-white/70 px-1">SUPPLIERS_MODE=mock</code> todos os fornecedores usam o catálogo simulado, mesmo com credenciais. Remova a
            variável para ativar as APIs reais configuradas.
          </>
        ) : (
          <>
            Fornecedor com credenciais no ambiente usa a <strong>API real</strong>; sem credenciais, o catálogo simulado. Numa categoria com API real, os simulados
            saem da vitrine (nunca se mistura hotel fictício com real). Os valores das credenciais nunca são exibidos.
          </>
        )}
      </Alert>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {integrations.map((h) => (
          <Card key={h.code}>
            <CardHeader
              title={h.name}
              subtitle={h.live ? `API real · ambiente ${h.environment}` : h.configured ? "Credenciais configuradas — ative removendo SUPPLIERS_MODE=mock" : "Sem credenciais — usando catálogo simulado"}
            />
            <CardBody className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge tone={h.live ? "success" : "neutral"}>{h.live ? "API real" : "Simulado"}</Badge>
                {h.missing.length > 0 && <Badge tone="warning">Faltam: {h.missing.join(", ")}</Badge>}
                {h.certificate &&
                  (h.certificate.ok ? (
                    <Badge tone={(h.certificate.daysLeft ?? 0) < 30 ? "warning" : "success"}>Certificado válido · vence em {h.certificate.daysLeft} dias</Badge>
                  ) : (
                    <Badge tone="danger">{h.certificate.error ? "Certificado ilegível" : h.certificate.keyMatches === false ? "Chave não corresponde ao certificado" : "Certificado vencido"}</Badge>
                  ))}
              </div>
              <p className="text-muted">
                Destinos sincronizados: <strong className="text-ink">{h.destinations.toLocaleString("pt-BR")}</strong>
                {h.destinationsUpdatedAt ? ` · atualizado em ${dateTime(h.destinationsUpdatedAt)}` : " · baixados automaticamente na primeira busca"}
              </p>
              {canEdit && h.configured && (
                <div className="flex flex-wrap gap-2">
                  <InlineActionButton action={testIntegrationAction} fields={{ code: h.code }} variant="outline">
                    Testar conexão
                  </InlineActionButton>
                  <InlineActionButton action={syncDestinationsAction} fields={{ code: h.code }} variant="outline">
                    Atualizar destinos
                  </InlineActionButton>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      {!canEdit && <ReadOnlyNotice>Somente Administradores podem ativar ou desativar fornecedores.</ReadOnlyNotice>}

      <Card className="mt-4">
        <Table>
          <THead>
            <tr>
              <Th>Fornecedor</Th>
              <Th>Categoria</Th>
              <Th>Moeda</Th>
              <Th>Credenciais (ambiente)</Th>
              <Th className="text-right">Vendido</Th>
              <Th>Status</Th>
              {canEdit && (
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              )}
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => (
              <Tr key={s.code}>
                <Td>
                  <div className="font-semibold">{s.name}</div>
                  <div className="font-mono text-[11px] text-muted">{s.code}</div>
                  {s.notes && <div className="mt-0.5 max-w-xs text-xs text-muted">{s.notes}</div>}
                </Td>
                <Td className="whitespace-nowrap">{s.category ? CATEGORY_LABEL[s.category] : "—"}</Td>
                <Td>
                  <Badge tone={s.currency === "BRL" ? "neutral" : "info"}>{s.currency ?? "—"}</Badge>
                </Td>
                <Td>
                  {s.env.length === 0 ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    <ul className="space-y-1">
                      {s.env.map((e) => (
                        <li key={e.name} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink">{e.name}</code>
                          <Badge tone={e.configured ? "success" : "neutral"}>{e.configured ? "configurada" : "pendente"}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right text-sm tabular">
                  <div className="font-semibold">{s.itemsSold} item(ns)</div>
                  <div className="text-xs text-muted">custo {brl(s.costBrl)}</div>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    {s.registered ? <ActiveBadge active={s.active} /> : <Badge tone="warning">Não cadastrado</Badge>}
                    {modes.get(s.code) === "live" && <Badge tone="success">API real</Badge>}
                    {modes.get(s.code) === "mock" && <Badge tone="neutral">Simulado</Badge>}
                    {modes.get(s.code) === "hidden" && <Badge tone="neutral">Fora da vitrine (simulado)</Badge>}
                  </div>
                </Td>
                {canEdit && (
                  <Td className="whitespace-nowrap">
                    <InlineActionButton
                      action={toggleSupplierAction}
                      fields={{ code: s.code, active: s.active ? "0" : "1" }}
                      variant={s.active ? "outline" : "secondary"}
                      confirmMessage={s.active ? `Desativar ${s.name}? Os produtos deste fornecedor deixam de aparecer nas lojas.` : undefined}
                    >
                      {s.active ? "Desativar" : "Ativar"}
                    </InlineActionButton>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Em breve" subtitle="Categorias já previstas na plataforma — margens e cupons já podem ser configurados" />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FUTURE_CATEGORIES.map((c) => (
              <li key={c} className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-4">
                <div className="flex items-center gap-2 text-brand-ink">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Em breve</span>
                </div>
                <p className="mt-2 font-semibold text-ink">{CATEGORY_LABEL[c]}</p>
                <p className="mt-1 text-xs text-muted">{FUTURE_HINT[c]}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
            <Plug className="h-3.5 w-3.5" aria-hidden /> Novos fornecedores entram pelo mesmo contrato de adapter usado pelos atuais.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
