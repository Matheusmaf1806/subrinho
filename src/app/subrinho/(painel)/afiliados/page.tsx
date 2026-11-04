import Link from "next/link";
import { ExternalLink, Plus, Store } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listAffiliatesWithStats } from "@/server/subrinho/affiliates";
import { brl } from "@/lib/format";
import { ActiveBadge } from "../../_components/bits";
import { canDo, PERMS } from "../../_lib/labels";

export const metadata = { title: "Afiliados" };

export default async function SubrinhoAffiliatesPage() {
  const user = await requireSubrinhoUser();
  const rows = await listAffiliatesWithStats(db);
  const canEdit = canDo(user.role, PERMS.affiliates);

  return (
    <>
      <PageHeader
        title="Afiliados"
        subtitle="Agências parceiras, cada uma com a sua loja."
        actions={
          canEdit && (
            <ButtonLink href="/subrinho/afiliados/novo">
              <Plus className="h-4 w-4" aria-hidden /> Novo afiliado
            </ButtonLink>
          )
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhum afiliado cadastrado"
            icon={<Store className="h-10 w-10" />}
            action={canEdit && <ButtonLink href="/subrinho/afiliados/novo">Cadastrar o primeiro afiliado</ButtonLink>}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Afiliado</Th>
                <Th>Loja</Th>
                <Th>Status</Th>
                <Th className="text-right">Usuários</Th>
                <Th className="text-right">Pedidos pagos</Th>
                <Th className="text-right">GMV</Th>
                <Th className="text-right">Receita Subrinho</Th>
                <Th className="text-right">Comissão total</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ affiliate: a, paidOrders, gmv, commission, subrinhoRevenue, usersCount }) => (
                <Tr key={a.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line" style={{ background: a.brandColor }} aria-hidden />
                      <Link href={`/subrinho/afiliados/${a.id}`} className="font-semibold text-ink hover:text-brand-ink">
                        {a.name}
                      </Link>
                    </div>
                    {a.legalName && <div className="text-xs text-muted">{a.legalName}</div>}
                  </Td>
                  <Td>
                    <Link href={`/loja/${a.slug}`} target="_blank" className="inline-flex items-center gap-1 font-mono text-xs text-brand-ink hover:underline">
                      /loja/{a.slug} <ExternalLink className="h-3 w-3" aria-hidden />
                      <span className="sr-only">(abre em nova aba)</span>
                    </Link>
                  </Td>
                  <Td>
                    <ActiveBadge active={a.active} />
                  </Td>
                  <Td className="text-right tabular">{usersCount}</Td>
                  <Td className="text-right tabular">{paidOrders}</Td>
                  <Td className="text-right font-semibold tabular">{brl(gmv)}</Td>
                  <Td className="text-right tabular">{brl(subrinhoRevenue)}</Td>
                  <Td className="text-right tabular">{brl(commission)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
