import { Card, CardBody, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { affiliateOptions } from "@/server/subrinho/orders";
import { ACTIVE_CATEGORIES, CATEGORY_LABEL, FUTURE_CATEGORIES } from "@/server/suppliers/types";
import { ReadOnlyNotice } from "../../../_components/bits";
import { StickyActionForm } from "../../../_components/sticky-form";
import { canDo, PERMS } from "../../../_lib/labels";
import { createSubrinhoCouponAction } from "../actions";
import { CouponFields } from "../coupon-fields";

export const metadata = { title: "Novo cupom" };

export default async function NewSubrinhoCouponPage() {
  const user = await requireSubrinhoUser();
  const canEdit = canDo(user.role, PERMS.coupons);
  const affs = await affiliateOptions(db);
  const categories = [...ACTIVE_CATEGORIES, ...FUTURE_CATEGORIES].map((c) => ({ value: c, label: CATEGORY_LABEL[c], future: FUTURE_CATEGORIES.includes(c) }));

  return (
    <>
      <PageHeader title="Novo cupom Subrinho" subtitle="O desconto sai da margem Subrinho." back={{ href: "/subrinho/cupons", label: "Cupons" }} />
      {!canEdit ? (
        <ReadOnlyNotice>Somente Administradores podem criar cupons.</ReadOnlyNotice>
      ) : (
        <Card className="max-w-4xl">
          <CardBody className="py-6">
            <StickyActionForm action={createSubrinhoCouponAction} className="space-y-6">
              <CouponFields affiliates={affs.map((a) => ({ id: a.id, name: a.name }))} categories={categories} />
              <div className="flex justify-end">
                <SubmitButton pendingText="Criando…">Criar cupom</SubmitButton>
              </div>
            </StickyActionForm>
          </CardBody>
        </Card>
      )}
    </>
  );
}
