import { Card, CardBody, Field, Input, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { requireSubrinhoUser } from "@/server/auth/session";
import { ReadOnlyNotice } from "../../../_components/bits";
import { canDo, PERMS } from "../../../_lib/labels";
import { createAffiliateAction } from "../actions";
import { AffiliateFields } from "../affiliate-fields";

export const metadata = { title: "Novo afiliado" };

export default async function NewAffiliatePage() {
  const user = await requireSubrinhoUser();
  const canEdit = canDo(user.role, PERMS.affiliates);

  return (
    <>
      <PageHeader title="Novo afiliado" subtitle="Cadastre a agência, a loja e o primeiro usuário ADMIN." back={{ href: "/subrinho/afiliados", label: "Afiliados" }} />
      {!canEdit ? (
        <ReadOnlyNotice>Somente Administradores podem cadastrar afiliados.</ReadOnlyNotice>
      ) : (
        <Card className="max-w-3xl">
          <CardBody className="py-6">
            <ActionForm action={createAffiliateAction} className="space-y-6">
              <AffiliateFields />
              <fieldset className="grid gap-4 sm:grid-cols-3">
                <legend className="mb-3 text-sm font-black uppercase tracking-wide text-muted">Primeiro usuário (ADMIN da agência)</legend>
                <Field label="Nome *">
                  <Input name="adminName" required maxLength={120} autoComplete="off" />
                </Field>
                <Field label="E-mail *">
                  <Input type="email" name="adminEmail" required maxLength={200} autoComplete="off" />
                </Field>
                <Field label="Senha inicial *" hint="Mínimo 8 caracteres">
                  <Input type="password" name="adminPassword" required minLength={8} autoComplete="new-password" />
                </Field>
              </fieldset>
              <div className="flex justify-end">
                <SubmitButton pendingText="Cadastrando…">Cadastrar afiliado</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </>
  );
}
