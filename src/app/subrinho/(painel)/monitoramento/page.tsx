import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CircleCheck, Mail } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { emailMissing } from "@/server/email/provider";
import { emailStats, recentErrors, supplierHealth } from "@/server/monitoring";

export const metadata: Metadata = { title: "Monitoramento" };

const SOURCE: Record<string, string> = { request: "Página/ação", supplier: "Fornecedor", email: "E-mail", cron: "Rotina" };

export default async function MonitoringPage() {
  await requireSubrinhoUser();
  const [suppliers, errors, mail] = await Promise.all([supplierHealth(db, 24), recentErrors(db, { limit: 60 }), emailStats(db)]);
  const platformErrors = errors.filter((e) => e.source !== "supplier");
  const missing = emailMissing();

  return (
    <>
      <PageHeader
        title="Monitoramento"
        subtitle="Fornecedores com falha, erros da plataforma e envio de e-mails. A equipe recebe alerta por e-mail quando algo começa a falhar."
        actions={
          <Link href="/subrinho/emails" className={buttonClass("outline", "md")}>
            <Mail className="h-4 w-4" aria-hidden /> Ver e-mails
          </Link>
        }
      />
      {missing.length > 0 && (
        <Alert tone="warning" title="E-mails e alertas desligados" className="mb-4">
          Sem {missing.join(" e ")}, nenhum e-mail sai (nem para clientes, nem os alertas da equipe). Configure na Vercel e faça Redeploy.
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Fornecedores com falha (24 h)" value={suppliers.length} tone={suppliers.length ? "brand" : "default"} />
        <Stat label="Erros da plataforma (recentes)" value={platformErrors.length} />
        <Stat label="E-mails enviados (7 dias)" value={mail.SENT ?? 0} />
        <Stat label="E-mails com falha ou não enviados (7 dias)" value={(mail.FAILED ?? 0) + (mail.SKIPPED ?? 0)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Fornecedores" subtitle="Falhas nas últimas 24 horas (busca, página do produto e emissão)" />
        {suppliers.length === 0 ? (
          <EmptyState icon={<CircleCheck className="h-10 w-10" aria-hidden />} title="Nenhuma falha de fornecedor nas últimas 24 horas" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Fornecedor</Th>
                <Th className="text-right">Falhas</Th>
                <Th>Código</Th>
                <Th>Última falha</Th>
              </tr>
            </THead>
            <tbody>
              {suppliers.map((s) => (
                <Tr key={s.supplier}>
                  <Td className="font-semibold">{s.supplier}</Td>
                  <Td className="text-right tabular">{s.failures}</Td>
                  <Td>{s.lastCode ? <Badge tone="danger">{s.lastCode}</Badge> : "-"}</Td>
                  <Td>
                    <span className="block text-xs text-muted">{dateTime(s.lastAt)}</span>
                    <span className="line-clamp-2 max-w-[36rem] text-sm">{s.lastMessage}</span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardBody className="border-t border-line text-xs text-muted">
          Códigos: F403 firewall do fornecedor (c = desafio anti-robô), K401 chave recusada, T sem resposta, N conexão, H resposta inesperada.
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Erros da plataforma" subtitle="Páginas, ações, rotinas e e-mails que não saíram" />
        {platformErrors.length === 0 ? (
          <EmptyState icon={<Activity className="h-10 w-10" aria-hidden />} title="Nenhum erro registrado" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Quando</Th>
                <Th>Origem</Th>
                <Th>Onde</Th>
                <Th>Mensagem</Th>
              </tr>
            </THead>
            <tbody>
              {platformErrors.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap">{dateTime(e.createdAt)}</Td>
                  <Td>{SOURCE[e.source] ?? e.source}</Td>
                  <Td className="max-w-[16rem] text-xs">
                    <span className="block font-mono">{e.key}</span>
                    {e.path && <span className="block text-muted">{e.path}</span>}
                  </Td>
                  <Td className="max-w-[32rem] text-sm">
                    <span className="line-clamp-3">{e.message}</span>
                    {e.digest && <span className="block text-xs text-muted">digest {e.digest}</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
