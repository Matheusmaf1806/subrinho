import type { Metadata } from "next";
import { ExternalLink, ShoppingCart } from "lucide-react";
import { Alert, Badge, Card, EmptyState, LinkTabs, PageHeader, Table, Td, Th, THead, Tr, buttonClass, statusTone } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { dateTime } from "@/lib/format";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { listCartsForAffiliate } from "@/server/orders/queries";
import { cartShareLink, firstParam } from "../../_lib/helpers";

export const metadata: Metadata = { title: "Carrinhos" };

const CART_STATUS_LABEL: Record<string, string> = { OPEN: "Aberto", CONVERTED: "Virou pedido" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AfiliadoCarrinhosPage({ searchParams }: { searchParams: SP }) {
  const { affiliate } = await requireAffiliateUser();
  const sp = await searchParams;
  const raw = firstParam(sp.status);
  const status = raw === "OPEN" || raw === "CONVERTED" ? raw : undefined;
  const carts = await listCartsForAffiliate(db, affiliate.id, { status, limit: 200 });

  return (
    <>
      <PageHeader
        title="Carrinhos"
        subtitle="Acompanhe quem montou cada carrinho, quantas vezes ele foi acessado e compartilhe o link com o cliente."
      />

      <LinkTabs
        active={status ?? "ALL"}
        tabs={[
          { key: "ALL", label: "Todos", href: "/afiliado/carrinhos" },
          { key: "OPEN", label: "Abertos", href: "/afiliado/carrinhos?status=OPEN" },
          { key: "CONVERTED", label: "Viraram pedido", href: "/afiliado/carrinhos?status=CONVERTED" },
        ]}
      />

      <Alert tone="info" className="mb-6">
        O carrinho <strong>nunca expira</strong>: o link pode ser enviado ao cliente a qualquer momento. Apenas itens cuja data já passou deixam de
        poder ser comprados e são retirados automaticamente.
      </Alert>

      <Card>
        {carts.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" aria-hidden />}
            title="Nenhum carrinho por aqui"
            description="Quando você ou seus clientes montarem carrinhos na sua loja, eles aparecem nesta lista."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Criado em</Th>
                <Th>Por quem</Th>
                <Th className="text-right">Itens</Th>
                <Th className="text-right">Acessos</Th>
                <Th>Último acesso</Th>
                <Th>Status</Th>
                <Th>Link de compartilhamento</Th>
              </tr>
            </THead>
            <tbody>
              {carts.map((c) => {
                const link = cartShareLink(affiliate, c.token);
                return (
                  <Tr key={c.id}>
                    <Td className="whitespace-nowrap">{dateTime(c.createdAt)}</Td>
                    <Td>
                      {c.createdByType === "AFFILIATE" && c.agentName ? (
                        <>
                          <span className="font-semibold">{c.agentName}</span>
                          <span className="block text-xs text-muted">agência</span>
                        </>
                      ) : c.createdByType === "CUSTOMER" && c.customerName ? (
                        <>
                          <span className="font-semibold">{c.customerName}</span>
                          <span className="block text-xs text-muted">cliente</span>
                        </>
                      ) : (
                        <span className="text-muted">Visitante sem login</span>
                      )}
                    </Td>
                    <Td className="text-right tabular">{c.items}</Td>
                    <Td className="text-right tabular">{c.viewCount}</Td>
                    <Td className="whitespace-nowrap text-muted">{c.lastViewedAt ? dateTime(c.lastViewedAt) : "-"}</Td>
                    <Td>
                      <Badge tone={statusTone(c.status)}>{CART_STATUS_LABEL[c.status] ?? c.status}</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <code className="hidden max-w-[16rem] truncate rounded-lg bg-surface px-2 py-1 text-xs text-muted xl:block" title={link}>
                          {link}
                        </code>
                        <CopyButton text={link} label="Copiar link" copiedLabel="Link copiado!" />
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClass("ghost", "sm")}
                          aria-label={`Abrir carrinho criado em ${dateTime(c.createdAt)} em nova aba`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                        </a>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {carts.length >= 200 && <p className="mt-3 text-xs text-muted">Mostrando os 200 carrinhos atualizados mais recentemente.</p>}
    </>
  );
}
