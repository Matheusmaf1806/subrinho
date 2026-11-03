import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th, THead, Tr } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { getOwnedCoupon } from "@/server/admin/coupons";
import { describeCoupon } from "@/server/coupons/engine";
import { couponOrders } from "@/server/subrinho/coupons";
import { affiliateOptions } from "@/server/subrinho/orders";
import { sum } from "@/server/pricing/money";
import { ACTIVE_CATEGORIES, CATEGORY_LABEL, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { brl, dateTime, orderNumber } from "@/lib/format";
import { ActiveBadge, Fit, OrderStatusBadge, ReadOnlyNotice } from "../../../_components/bits";
import { InlineActionButton } from "../../../_components/inline-action";
import { toLocalInput } from "../../../_lib/dates";
import { isUuid } from "../../../_lib/form";
import { canDo, PERMS } from "../../../_lib/labels";
import { toggleSubrinhoCouponAction, updateSubrinhoCouponAction } from "../actions";
import { CouponFields } from "../coupon-fields";

export const metadata = { title: "Cupom" };

export default async function SubrinhoCouponPage({
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
  const c = await getOwnedCoupon(db, id, { issuer: "SUBRINHO" }).catch(() => null);
  if (!c) notFound();
  const canEdit = canDo(user.role, PERMS.coupons);
  const [affs, orders] = await Promise.all([affiliateOptions(db), couponOrders(db, id)]);
  const paid = orders.filter((o) => o.status === "PAID");
  const categories = [...ACTIVE_CATEGORIES, ...FUTURE_CATEGORIES].map((k) => ({ value: k, label: CATEGORY_LABEL[k], future: FUTURE_CATEGORIES.includes(k) }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{c.code}</span> <ActiveBadge active={c.active} />
          </span>
        }
        subtitle={`${describeCoupon(c)} · criado em ${dateTime(c.createdAt)}`}
        back={{ href: "/subrinho/cupons", label: "Cupons" }}
        actions={
          canEdit && (
            <InlineActionButton action={toggleSubrinhoCouponAction} fields={{ id: c.id, active: c.active ? "0" : "1" }} variant={c.active ? "outline" : "secondary"}>
              {c.active ? "Desativar cupom" : "Ativar cupom"}
            </InlineActionButton>
          )
        }
      />
      {sp.novo && (
        <Alert tone="success" className="mb-6">
          Cupom criado! Ele já pode ser usado nas lojas {c.affiliateId ? "selecionadas" : "de todos os afiliados"}.
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <Stat label="Usos (pagos)" value={`${c.redemptions}${c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}`} tone="brand" />
        <Stat label="Desconto concedido" value={<Fit>{brl(sum(paid.map((o) => o.applied)))}</Fit>} hint="em pedidos pagos" />
        <Stat label="Vendas com o cupom" value={<Fit>{brl(sum(paid.map((o) => o.amountCharged)))}</Fit>} />
        <Stat label="Pedidos (todos os status)" value={orders.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title="Configuração" />
          <CardBody className="py-5">
            {!canEdit && <ReadOnlyNotice>Somente Administradores podem alterar cupons.</ReadOnlyNotice>}
            <ActionForm action={updateSubrinhoCouponAction} className="mt-2 space-y-6">
              <input type="hidden" name="id" value={c.id} />
              <fieldset disabled={!canEdit} className="disabled:opacity-80">
                <CouponFields
                  c={{
                    code: c.code,
                    description: c.description,
                    discountType: c.discountType,
                    percentOff: c.percentOff,
                    amountOff: c.amountOff,
                    stepAmount: c.stepAmount,
                    maxDiscount: c.maxDiscount,
                    minSubtotal: c.minSubtotal,
                    categories: c.categories,
                    affiliateId: c.affiliateId,
                    startsAt: toLocalInput(c.startsAt),
                    endsAt: toLocalInput(c.endsAt),
                    maxRedemptions: c.maxRedemptions,
                    active: c.active,
                  }}
                  affiliates={affs.map((a) => ({ id: a.id, name: a.name }))}
                  categories={categories}
                />
              </fieldset>
              {canEdit && (
                <div className="flex justify-end">
                  <SubmitButton>Salvar cupom</SubmitButton>
                </div>
              )}
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Uso do cupom" subtitle="Pedidos em que o cupom foi aplicado" />
          {orders.length === 0 ? (
            <EmptyState title="Ainda não foi usado" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Loja / cliente</Th>
                  <Th className="text-right">Desconto</Th>
                </tr>
              </THead>
              <tbody>
                {orders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`/subrinho/pedidos/${o.id}`} className="font-semibold text-brand hover:underline">
                        {orderNumber(o.number)}
                      </Link>
                      <div className="mt-1">
                        <OrderStatusBadge status={o.status} />
                      </div>
                      <div className="text-[11px] text-muted">{dateTime(o.paidAt ?? o.createdAt)}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold">{o.affiliateName}</div>
                      <div className="text-xs text-muted">{o.customerData.name}</div>
                    </Td>
                    <Td className="text-right tabular">
                      <span className="font-semibold">{brl(o.applied)}</span>
                      {o.limitedByMargin && <div className="text-[11px] font-semibold text-amber-700">limitado pela margem</div>}
                      <div className="text-[11px] text-muted">pedido {brl(o.amountCharged)}</div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
