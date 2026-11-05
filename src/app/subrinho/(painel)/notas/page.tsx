import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { InvoiceForm } from "@/components/invoice-form";
import { brl, date, dateTime, orderNumber, PAYOUT_STATUS_LABEL } from "@/lib/format";
import { todayLocal } from "@/lib/tz";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { ordersWithoutInvoice, payoutsWithoutInvoice, recentInvoices } from "@/server/invoices";
import { canDo, PERMS } from "../../_lib/labels";
import { registerPayoutInvoiceSubrinhoAction } from "./actions";

export const metadata: Metadata = { title: "Notas fiscais" };

export default async function InvoicesPage() {
  const user = await requireSubrinhoUser();
  const [pendingOrders, pendingPayouts, recent] = await Promise.all([ordersWithoutInvoice(db), payoutsWithoutInvoice(db), recentInvoices(db)]);
  const today = todayLocal();
  const canPayout = canDo(user.role, PERMS.payouts);
  return (
    <>
      <PageHeader title="Notas fiscais" subtitle="Notas dos pedidos (para o cliente) e notas das agências pela comissão de cada repasse." />
      <Alert tone="info" className="mb-6">
        A emissão é feita no emissor da prefeitura ou no sistema fiscal da empresa. Aqui você registra o número, o valor e o PDF/XML: o cliente baixa a nota na página do pedido e
        recebe o aviso por e-mail. O valor de cada nota segue a orientação da contabilidade (total do pedido ou só a receita de intermediação).
      </Alert>

      <Card className="mb-6">
        <CardHeader title={`Pedidos pagos sem nota (${pendingOrders.length})`} subtitle="Abra o pedido para registrar a nota" />
        {pendingOrders.length === 0 ? (
          <EmptyState icon={<Receipt className="h-10 w-10" aria-hidden />} title="Todos os pedidos pagos têm nota registrada" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Pedido</Th>
                <Th>Loja</Th>
                <Th>Cliente</Th>
                <Th>Pago em</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Receita Subrinho</Th>
                <Th className="text-right">Comissão agência</Th>
              </tr>
            </THead>
            <tbody>
              {pendingOrders.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`/subrinho/pedidos/${o.id}`} className="font-semibold hover:underline">
                      {orderNumber(o.number)}
                    </Link>
                  </Td>
                  <Td>{o.store}</Td>
                  <Td className="text-muted">{o.customer?.name ?? "-"}</Td>
                  <Td className="whitespace-nowrap">{dateTime(o.paidAt)}</Td>
                  <Td className="text-right tabular">{brl(o.amount)}</Td>
                  <Td className="text-right tabular">{brl(o.revenue)}</Td>
                  <Td className="text-right tabular">{brl(o.commission)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader title={`Repasses sem a nota da agência (${pendingPayouts.length})`} subtitle="A agência envia em Painel do Afiliado › Financeiro; a equipe também pode registrar aqui" />
        {pendingPayouts.length === 0 ? (
          <EmptyState icon={<Receipt className="h-10 w-10" aria-hidden />} title="Nenhum repasse aguardando nota" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Loja</Th>
                <Th>Período</Th>
                <Th>Repasse</Th>
                <Th className="text-right">Comissão</Th>
                {canPayout && <Th className="text-right">Ação</Th>}
              </tr>
            </THead>
            <tbody>
              {pendingPayouts.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-semibold">{p.store}</Td>
                  <Td className="whitespace-nowrap">
                    {date(p.periodStart)} a {date(p.periodEnd)}
                  </Td>
                  <Td>
                    <Badge tone={p.status === "PAID" ? "success" : "info"}>{PAYOUT_STATUS_LABEL[p.status] ?? p.status}</Badge>
                    <span className="block text-xs text-muted">{date(p.scheduledDate)}</span>
                  </Td>
                  <Td className="text-right tabular">{brl(p.amount)}</Td>
                  {canPayout && (
                    <Td className="text-right">
                      <Modal trigger={<span className={buttonClass("outline", "sm")}>Registrar nota</span>} title={`Nota da comissão: ${p.store}`} size="lg">
                        <InvoiceForm action={registerPayoutInvoiceSubrinhoAction} hidden={{ payoutId: p.id }} amount={p.amount} today={today} />
                      </Modal>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Notas registradas" subtitle="As 100 mais recentes" />
        {recent.length === 0 ? (
          <CardBody className="text-sm text-muted">Nenhuma nota registrada ainda.</CardBody>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Nota</Th>
                <Th>Tipo</Th>
                <Th>Loja</Th>
                <Th>Emissão</Th>
                <Th className="text-right">Valor</Th>
                <Th>Arquivos</Th>
              </tr>
            </THead>
            <tbody>
              {recent.map(({ inv, store, orderNumber: n }) => (
                <Tr key={inv.id}>
                  <Td className="font-semibold">
                    {inv.number}
                    {inv.status === "CANCELLED" && <Badge tone="danger" className="ml-2">Cancelada</Badge>}
                  </Td>
                  <Td>
                    {inv.kind === "ORDER" ? (
                      <Link href={`/subrinho/pedidos/${inv.orderId}`} className="hover:underline">
                        Pedido {n ? orderNumber(n) : ""}
                      </Link>
                    ) : (
                      "Comissão do repasse"
                    )}
                  </Td>
                  <Td>{store}</Td>
                  <Td className="whitespace-nowrap">{date(inv.issuedAt)}</Td>
                  <Td className="text-right tabular">{brl(inv.amount)}</Td>
                  <Td className="space-x-2 text-sm">
                    {inv.fileId && (
                      <a href={`/api/files/${inv.fileId}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink hover:underline">
                        PDF
                      </a>
                    )}
                    {inv.xmlFileId && (
                      <a href={`/api/files/${inv.xmlFileId}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink hover:underline">
                        XML
                      </a>
                    )}
                    {inv.url && (
                      <a href={inv.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink hover:underline">
                        Link
                      </a>
                    )}
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
