import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Mail } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Input, LinkTabs, PageHeader, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { dateTime, orderNumber } from "@/lib/format";
import { db } from "@/server/db";
import { emailOutbox, orders } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { emailMissing } from "@/server/email/provider";
import { InlineActionButton } from "../../_components/inline-action";
import { canDo } from "../../_lib/labels";
import { resendEmailAction } from "./actions";

export const metadata: Metadata = { title: "E-mails" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  SENT: { label: "Enviado", tone: "success" },
  PENDING: { label: "Na fila", tone: "info" },
  SENDING: { label: "Enviando", tone: "info" },
  FAILED: { label: "Falhou", tone: "danger" },
  SKIPPED: { label: "Não enviado", tone: "warning" },
};

const KIND: Record<string, string> = {
  "order.placed": "Pedido com Pix",
  "order.paid": "Pagamento confirmado",
  "order.paid.agency": "Nova venda (agência)",
  "item.voucher_ready": "Voucher pronto",
  "item.esim_ready": "eSIM pronto",
  "item.cancelled": "Reserva cancelada",
  "team.awaiting_issue": "Emitir (equipe)",
  "team.booking_failed": "Falha na emissão (equipe)",
  "team.paid_after_cancel": "Pagamento após cancelamento",
  "auth.reset": "Nova senha",
  "cart.reminder": "Carrinho abandonado",
  "alert.supplier": "Alerta de fornecedor",
  "alert.request": "Alerta de erro",
  "alert.cron": "Alerta de rotina",
  "alert.certificate": "Certificado vencendo",
};

type SP = Promise<Record<string, string | undefined>>;

export default async function SubrinhoEmailsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireSubrinhoUser();
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUS ? sp.status : null;
  const q = (sp.q ?? "").trim();
  const conds: SQL[] = [];
  if (status) conds.push(eq(emailOutbox.status, status));
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(emailOutbox.toEmail, like), ilike(emailOutbox.subject, like))!);
  }
  const rows = await db
    .select({ e: emailOutbox, number: orders.number })
    .from(emailOutbox)
    .leftJoin(orders, eq(orders.id, emailOutbox.orderId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(150);
  const missing = emailMissing();
  const canResend = canDo(user.role, ["ADMIN", "SUPPORT"]);
  const tab = (s: string | null) => `/subrinho/emails${s || q ? `?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}` : ""}`;

  return (
    <>
      <PageHeader title="E-mails" subtitle="Tudo o que a plataforma enviou (ou tentou enviar) para clientes, agências e equipe." back={{ href: "/subrinho/monitoramento", label: "Monitoramento" }} />
      {missing.length > 0 && (
        <Alert tone="warning" title="Envio de e-mail desligado" className="mb-4">
          Defina {missing.join(" e ")} na Vercel (Settings › Environment Variables) e faça Redeploy. Enquanto isso, os e-mails ficam aqui como “Não enviado” e podem ser
          reenviados depois.
        </Alert>
      )}
      <LinkTabs
        active={status ?? "ALL"}
        tabs={[{ key: "ALL", label: "Todos", href: tab(null) }, ...Object.entries(STATUS).filter(([k]) => k !== "SENDING").map(([k, v]) => ({ key: k, label: v.label, href: tab(k) }))]}
      />
      <form className="mb-4 flex max-w-md gap-2" action="/subrinho/emails">
        {status && <input type="hidden" name="status" value={status} />}
        <Input name="q" defaultValue={q} placeholder="Buscar por e-mail ou assunto" aria-label="Buscar e-mails" />
        <button className={buttonClass("outline", "md")}>Buscar</button>
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Mail className="h-10 w-10" aria-hidden />} title="Nenhum e-mail por aqui" description="Os e-mails aparecem quando acontece um pedido, pagamento, emissão ou pedido de nova senha." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Quando</Th>
                <Th>Para</Th>
                <Th>Assunto</Th>
                <Th>Tipo</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ e, number }) => {
                const st = STATUS[e.status] ?? { label: e.status, tone: "neutral" as const };
                return (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap">{dateTime(e.createdAt)}</Td>
                    <Td>
                      <span className="font-semibold">{e.toName ?? e.toEmail}</span>
                      {e.toName && <span className="block text-xs text-muted">{e.toEmail}</span>}
                    </Td>
                    <Td className="max-w-[22rem]">
                      <span className="line-clamp-2">{e.subject}</span>
                      {number && e.orderId && (
                        <Link href={`/subrinho/pedidos/${e.orderId}`} className="text-xs text-muted hover:underline">
                          Pedido {orderNumber(number)}
                        </Link>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{KIND[e.kind] ?? e.kind}</Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {e.lastError && e.status !== "SENT" && <span className="mt-1 block max-w-[16rem] text-xs text-muted">{e.lastError}</span>}
                      {e.sentAt && <span className="mt-1 block text-xs text-muted">{dateTime(e.sentAt)}</span>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Modal trigger={"Ver"} triggerClassName={buttonClass("ghost", "sm")} title={e.subject} size="lg">
                          <iframe title={`Prévia: ${e.subject}`} srcDoc={e.html} sandbox="" className="h-[70vh] w-full rounded-xl bg-white ring-1 ring-line" />
                        </Modal>
                        {canResend && (
                          <InlineActionButton action={resendEmailAction} fields={{ id: e.id }} confirmMessage={`Enviar de novo para ${e.toEmail}?`}>
                            Reenviar
                          </InlineActionButton>
                        )}
                      </div>
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
