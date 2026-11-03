import type { Metadata } from "next";
import { Lock, Plus, TicketPercent } from "lucide-react";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { brl, date, pct } from "@/lib/format";
import { localDate } from "@/lib/tz";
import { db } from "@/server/db";
import type { coupons as couponsTable } from "@/server/db/schema";
import { requireAffiliateUser } from "@/server/auth/session";
import { listCoupons, subrinhoCouponsForStore } from "@/server/admin/coupons";
import { ACTIVE_CATEGORIES, CATEGORY_LABEL } from "@/server/suppliers/types";
import { createCouponAction, setCouponActiveAction, updateCouponAction } from "./actions";
import { CouponModal, ToggleCouponForm, type CouponFormValues } from "./coupon-form";

export const metadata: Metadata = { title: "Cupons" };

type Coupon = typeof couponsTable.$inferSelect;

const num = (v: string | null) => (v === null ? "" : String(Number(v)));
/** Valor em R$ para o campo de texto do formulário ("10000.00" → "10000", "1500.50" → "1500,5"). */
const money = (v: string | null) => (v === null ? "" : String(Number(v)).replace(".", ","));

function toFormValues(c: Coupon): CouponFormValues {
  return {
    id: c.id,
    code: c.code,
    description: c.description ?? "",
    discountType: c.discountType,
    percentOff: num(c.percentOff),
    amountOff: money(c.amountOff),
    stepAmount: money(c.stepAmount),
    maxDiscount: money(c.maxDiscount),
    minSubtotal: money(c.minSubtotal),
    categories: c.categories,
    startsAt: c.startsAt ? localDate(c.startsAt) : "",
    endsAt: c.endsAt ? localDate(c.endsAt) : "",
    maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : "",
    active: c.active,
  };
}

function couponStatus(c: Coupon, now: Date): { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" } {
  if (!c.active) return { label: "Inativo", tone: "neutral" };
  if (c.endsAt && now > c.endsAt) return { label: "Expirado", tone: "danger" };
  if (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions) return { label: "Esgotado", tone: "warning" };
  if (c.startsAt && now < c.startsAt) return { label: "Agendado", tone: "info" };
  return { label: "Ativo", tone: "success" };
}

/** Regra do cupom em texto (mesma lógica de describeCoupon, com R$ no formato brasileiro). */
function ruleText(c: Coupon) {
  switch (c.discountType) {
    case "PERCENT":
      return `${pct(c.percentOff)} de desconto`;
    case "FIXED":
      return `${brl(c.amountOff)} de desconto`;
    case "CONDITIONAL":
      return `${brl(c.amountOff)} a cada ${brl(c.stepAmount)}`;
  }
}

function validity(c: Coupon) {
  if (c.startsAt && c.endsAt) return `${date(c.startsAt)} a ${date(c.endsAt)}`;
  if (c.endsAt) return `Até ${date(c.endsAt)}`;
  if (c.startsAt) return `A partir de ${date(c.startsAt)}`;
  return "Sem prazo";
}

function categoriesText(c: Coupon) {
  return c.categories.length ? c.categories.map((x) => CATEGORY_LABEL[x as keyof typeof CATEGORY_LABEL] ?? x).join(", ") : "Todas";
}

function conditions(c: Coupon) {
  const parts: string[] = [];
  if (c.minSubtotal) parts.push(`Mínimo ${brl(c.minSubtotal)}`);
  if (c.maxDiscount) parts.push(`Máx. ${brl(c.maxDiscount)}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default async function AfiliadoCuponsPage() {
  const { user, affiliate } = await requireAffiliateUser();
  const canEdit = user.role === "ADMIN";
  const [mine, subrinho] = await Promise.all([
    listCoupons(db, { issuer: "AFFILIATE", affiliateId: affiliate.id }),
    subrinhoCouponsForStore(db, affiliate.id),
  ]);
  const now = new Date();
  const categories = ACTIVE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
  const subrinhoValid = subrinho.filter((c) => couponStatus(c, now).label === "Ativo" || couponStatus(c, now).label === "Agendado");

  return (
    <>
      <PageHeader
        title="Cupons"
        subtitle="Crie cupons de desconto para a sua loja. O desconto sai somente da sua margem."
        actions={
          canEdit ? (
            <CouponModal
              action={createCouponAction}
              categories={categories}
              title="Novo cupom"
              triggerClassName={buttonClass("primary")}
              trigger={
                <>
                  <Plus className="h-4 w-4" aria-hidden /> Novo cupom
                </>
              }
            />
          ) : null
        }
      />

      {!canEdit && (
        <Alert tone="warning" className="mb-6" title="Somente leitura">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-4 w-4" aria-hidden /> Apenas usuários ADMIN da agência podem criar ou alterar cupons.
          </span>
        </Alert>
      )}

      <Alert tone="info" className="mb-6">
        Os cupons da agência descontam <strong>apenas da sua margem</strong> — nunca abaixo de 0%. Se o desconto pedido for maior que a sua margem nos
        itens elegíveis, ele é limitado automaticamente. Cada carrinho aceita 1 cupom da agência (além de 1 cupom da Subrinho, se houver).
      </Alert>

      <Card className="mb-6">
        <CardHeader title="Cupons da agência" subtitle={`${mine.length} cupo${mine.length === 1 ? "m" : "ns"}`} />
        {mine.length === 0 ? (
          <EmptyState
            icon={<TicketPercent className="h-10 w-10" aria-hidden />}
            title="Nenhum cupom criado"
            description="Crie cupons percentuais, de valor fixo ou do tipo “R$ 100 a cada R$ 10.000” para atrair seus clientes."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Cupom</Th>
                <Th>Desconto</Th>
                <Th>Categorias</Th>
                <Th>Condições</Th>
                <Th>Validade</Th>
                <Th className="text-right">Usos</Th>
                <Th>Status</Th>
                {canEdit && <Th>Ações</Th>}
              </tr>
            </THead>
            <tbody>
              {mine.map((c) => {
                const st = couponStatus(c, now);
                return (
                  <Tr key={c.id}>
                    <Td>
                      <p className="font-semibold tracking-wide text-ink">{c.code}</p>
                      {c.description && <p className="max-w-xs text-xs text-muted">{c.description}</p>}
                    </Td>
                    <Td className="whitespace-nowrap font-semibold">{ruleText(c)}</Td>
                    <Td className="text-muted">{categoriesText(c)}</Td>
                    <Td className="whitespace-nowrap text-muted">{conditions(c)}</Td>
                    <Td className="whitespace-nowrap text-muted">{validity(c)}</Td>
                    <Td className="text-right tabular whitespace-nowrap">
                      {c.redemptions}
                      {c.maxRedemptions !== null && <span className="text-muted"> / {c.maxRedemptions}</span>}
                    </Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </Td>
                    {canEdit && (
                      <Td>
                        <div className="flex items-start gap-2">
                          <CouponModal
                            action={updateCouponAction}
                            initial={toFormValues(c)}
                            categories={categories}
                            title={`Editar cupom ${c.code}`}
                            trigger="Editar"
                          />
                          <ToggleCouponForm action={setCouponActiveAction} id={c.id} active={c.active} />
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Cupons da Subrinho válidos na sua loja"
          subtitle="Campanhas da Subrinho: o desconto sai da margem da Subrinho e não altera a sua comissão."
        />
        {subrinhoValid.length === 0 ? (
          <EmptyState title="Nenhuma campanha da Subrinho no momento" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Cupom</Th>
                <Th>Desconto</Th>
                <Th>Categorias</Th>
                <Th>Condições</Th>
                <Th>Validade</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {subrinhoValid.map((c) => {
                const st = couponStatus(c, now);
                return (
                  <Tr key={c.id}>
                    <Td>
                      <p className="font-semibold tracking-wide text-ink">{c.code}</p>
                      {c.description && <p className="max-w-xs text-xs text-muted">{c.description}</p>}
                    </Td>
                    <Td className="whitespace-nowrap font-semibold">{ruleText(c)}</Td>
                    <Td className="text-muted">{categoriesText(c)}</Td>
                    <Td className="whitespace-nowrap text-muted">{conditions(c)}</Td>
                    <Td className="whitespace-nowrap text-muted">{validity(c)}</Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
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
