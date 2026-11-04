import Link from "next/link";
import { Plus, TicketPercent } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listCoupons } from "@/server/admin/coupons";
import { describeCoupon } from "@/server/coupons/engine";
import { affiliateOptions } from "@/server/subrinho/orders";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { brl, dateTime } from "@/lib/format";
import { ActiveBadge } from "../../_components/bits";
import { InlineActionButton } from "../../_components/inline-action";
import { canDo, PERMS } from "../../_lib/labels";
import { toggleSubrinhoCouponAction } from "./actions";

export const metadata = { title: "Cupons" };

export default async function SubrinhoCouponsPage() {
  const user = await requireSubrinhoUser();
  const canEdit = canDo(user.role, PERMS.coupons);
  const [coupons, affs] = await Promise.all([listCoupons(db, { issuer: "SUBRINHO" }), affiliateOptions(db)]);
  const affName = new Map(affs.map((a) => [a.id, a.name]));
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Cupons Subrinho"
        subtitle="Descontam somente da margem Subrinho. Podem valer em todas as lojas ou em uma loja específica."
        actions={
          canEdit && (
            <ButtonLink href="/subrinho/cupons/novo">
              <Plus className="h-4 w-4" aria-hidden /> Novo cupom
            </ButtonLink>
          )
        }
      />
      <Card>
        {coupons.length === 0 ? (
          <EmptyState
            title="Nenhum cupom Subrinho"
            icon={<TicketPercent className="h-10 w-10" />}
            action={canEdit && <ButtonLink href="/subrinho/cupons/novo">Criar o primeiro cupom</ButtonLink>}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Código</Th>
                <Th>Regra</Th>
                <Th>Categorias</Th>
                <Th>Loja</Th>
                <Th>Validade</Th>
                <Th className="text-right">Usos</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </THead>
            <tbody>
              {coupons.map((c) => {
                const expired = c.endsAt && c.endsAt < now;
                const notYet = c.startsAt && c.startsAt > now;
                const exhausted = c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions;
                return (
                  <Tr key={c.id}>
                    <Td>
                      <Link href={`/subrinho/cupons/${c.id}`} className="font-mono font-semibold text-brand-ink hover:underline">
                        {c.code}
                      </Link>
                      {c.description && <div className="max-w-[16rem] text-xs text-muted">{c.description}</div>}
                    </Td>
                    <Td className="text-sm">
                      <div className="font-semibold">{describeCoupon(c)}</div>
                      <div className="text-xs text-muted">
                        {[c.minSubtotal && `mín. ${brl(c.minSubtotal)}`, c.maxDiscount && `teto ${brl(c.maxDiscount)}`].filter(Boolean).join(" · ")}
                      </div>
                    </Td>
                    <Td className="text-xs">
                      {c.categories.length === 0 ? "Todas" : c.categories.map((k) => CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL] ?? k).join(", ")}
                    </Td>
                    <Td className="text-sm">{c.affiliateId ? (affName.get(c.affiliateId) ?? "-") : "Todas as lojas"}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      <div>{c.startsAt ? `de ${dateTime(c.startsAt)}` : "sem início"}</div>
                      <div>{c.endsAt ? `até ${dateTime(c.endsAt)}` : "sem fim"}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular">
                      <span className="font-semibold">{c.redemptions}</span>
                      <span className="text-muted"> / {c.maxRedemptions ?? "∞"}</span>
                    </Td>
                    <Td className="space-y-1">
                      <ActiveBadge active={c.active} />
                      {expired && <Badge tone="danger">Expirado</Badge>}
                      {notYet && <Badge tone="info">Agendado</Badge>}
                      {exhausted && <Badge tone="warning">Esgotado</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <ButtonLink href={`/subrinho/cupons/${c.id}`} variant="ghost" size="sm">
                          {canEdit ? "Editar" : "Ver"}
                        </ButtonLink>
                        {canEdit && (
                          <InlineActionButton action={toggleSubrinhoCouponAction} fields={{ id: c.id, active: c.active ? "0" : "1" }} variant={c.active ? "outline" : "secondary"}>
                            {c.active ? "Desativar" : "Ativar"}
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
