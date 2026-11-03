"use client";

import { useActionState, useState } from "react";
import { SubmitButton, type ActionState } from "@/components/ui-client";
import { Alert, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type StoreFormValues = {
  name: string;
  brandColor: string;
  logoUrl: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixKey: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function StoreForm({ action, initial, readOnly, storeUrl }: { action: Action; initial: StoreFormValues; readOnly: boolean; storeUrl: string }) {
  const [v, setV] = useState(initial);
  const set = (k: keyof StoreFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const color = HEX.test(v.brandColor) ? v.brandColor : "#E4113F";
  const [logoOk, setLogoOk] = useState(true);
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction}>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Identidade da loja" subtitle="Como a sua loja aparece para os clientes" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da loja" className="sm:col-span-2">
                <Input name="name" required minLength={2} maxLength={80} value={v.name} onChange={set("name")} />
              </Field>
              <Field label="Cor de destaque" hint="Usada em botões e detalhes da loja">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Escolher cor de destaque"
                    value={color.toLowerCase()}
                    onChange={(e) => setV((s) => ({ ...s, brandColor: e.target.value.toUpperCase() }))}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1 disabled:cursor-not-allowed"
                  />
                  <Input
                    name="brandColor"
                    required
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                    value={v.brandColor}
                    onChange={(e) => setV((s) => ({ ...s, brandColor: e.target.value.trim() }))}
                    className="font-mono uppercase"
                  />
                </div>
              </Field>
              <Field label="Logo (endereço da imagem)" hint="Link https:// para um PNG, JPG ou SVG">
                <Input
                  type="url"
                  name="logoUrl"
                  placeholder="https://…"
                  value={v.logoUrl}
                  onChange={(e) => {
                    setLogoOk(true);
                    set("logoUrl")(e);
                  }}
                />
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

        {/* Pré-visualização */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-8 xl:self-start">
          <Card className="overflow-hidden">
            <CardHeader title="Pré-visualização" />
            <div className="p-5">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex items-center gap-3 bg-white px-4 py-3">
                  {v.logoUrl && logoOk ? (
                    <img src={v.logoUrl} alt="" className="h-9 max-w-[8rem] object-contain" onError={() => setLogoOk(false)} />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-xl text-base font-semibold text-white" style={{ background: color }} aria-hidden>
                      {(v.name.trim()[0] ?? "L").toUpperCase()}
                    </span>
                  )}
                  <span className="truncate font-semibold text-ink">{v.name || "Nome da loja"}</span>
                </div>
                <div className="space-y-3 px-4 py-5">
                  <p className="text-lg font-semibold leading-tight text-ink">Ingressos, hotéis e muito mais</p>
                  <span className="inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm" style={{ background: color }}>
                    Ver ofertas
                  </span>
                  <p className="text-xs font-semibold" style={{ color }}>
                    10x sem juros no cartão
                  </p>
                </div>
              </div>
              {v.logoUrl && !logoOk && <p className="mt-2 text-xs font-semibold text-amber-700">Não foi possível carregar a imagem do logo.</p>}
              <p className="mt-3 break-all text-xs text-muted">{storeUrl}</p>
            </div>
          </Card>
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
