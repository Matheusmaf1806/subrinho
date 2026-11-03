"use client";

import { useActionState, useState } from "react";
import { SubmitButton, type ActionState } from "@/components/ui-client";
import { Alert, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type StoreFormValues = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixKey: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
};

export function StoreForm({ action, initial, readOnly, storeUrl }: { action: Action; initial: StoreFormValues; readOnly: boolean; storeUrl: string }) {
  const [v, setV] = useState(initial);
  const set = (k: keyof StoreFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction}>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Nome da loja" subtitle="Como a agência aparece para os clientes" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da loja" className="sm:col-span-2">
                <Input name="name" required minLength={2} maxLength={80} value={v.name} onChange={set("name")} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contato" subtitle="Exibido na loja para os clientes falarem com a agência" />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Field label="E-mail">
                <Input type="email" name="email" inputMode="email" value={v.email} onChange={set("email")} />
              </Field>
              <Field label="Telefone">
                <Input type="tel" name="phone" inputMode="tel" placeholder="(11) 3333-4444" value={v.phone} onChange={set("phone")} />
              </Field>
              <Field label="WhatsApp" hint="Com DDI e DDD, ex.: 5511999990000">
                <Input type="tel" name="whatsapp" inputMode="tel" placeholder="5511999990000" value={v.whatsapp} onChange={set("whatsapp")} />
              </Field>
            </CardBody>
          </Card>

          <Card id="dados-bancarios">
            <CardHeader title="Dados para repasse" subtitle="Conta onde a Subrinho deposita a sua comissão" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Chave Pix" className="sm:col-span-2">
                <Input name="pixKey" maxLength={140} placeholder="CNPJ, e-mail, telefone ou chave aleatória" value={v.pixKey} onChange={set("pixKey")} />
              </Field>
              <Field label="Banco">
                <Input name="bankName" maxLength={80} value={v.bankName} onChange={set("bankName")} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Agência">
                  <Input name="bankAgency" maxLength={20} inputMode="numeric" value={v.bankAgency} onChange={set("bankAgency")} />
                </Field>
                <Field label="Conta">
                  <Input name="bankAccount" maxLength={30} inputMode="numeric" value={v.bankAccount} onChange={set("bankAccount")} />
                </Field>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-8 xl:self-start">
          {!readOnly && (
            <div className="space-y-3">
              {state?.error && <Alert tone="danger">{state.error}</Alert>}
              {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
              <SubmitButton size="lg" className="w-full">
                Salvar alterações
              </SubmitButton>
            </div>
          )}
        </div>
      </fieldset>
    </form>
  );
}
