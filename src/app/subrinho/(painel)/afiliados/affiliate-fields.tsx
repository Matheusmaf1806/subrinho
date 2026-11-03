/** Campos do cadastro de afiliado (criar/editar). */
import type { affiliates } from "@/server/db/schema";
import { Field, Input } from "@/components/ui";

type Affiliate = typeof affiliates.$inferSelect;

export function AffiliateFields({ a }: { a?: Affiliate }) {
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-black uppercase tracking-wide text-muted">Agência e loja</legend>
        <Field label="Nome fantasia *" hint="Exibido na loja">
          <Input name="name" required maxLength={120} defaultValue={a?.name} />
        </Field>
        <Field label="Endereço da loja (slug)" hint="Letras minúsculas, números e hífen. Vazio = gerado pelo nome.">
          <div className="flex items-center rounded-xl border border-line bg-cream/60 pl-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
            <span className="text-sm font-semibold text-muted">/loja/</span>
            <input
              name="slug"
              defaultValue={a?.slug}
              maxLength={48}
              pattern="[A-Za-z0-9\-]*"
              className="w-full min-w-0 rounded-r-xl bg-white px-2 py-2.5 text-sm text-ink outline-none"
              aria-label="Slug da loja"
            />
          </div>
        </Field>
        <Field label="Razão social">
          <Input name="legalName" maxLength={200} defaultValue={a?.legalName ?? ""} />
        </Field>
        <Field label="CNPJ / CPF">
          <Input name="document" maxLength={30} defaultValue={a?.document ?? ""} />
        </Field>
        <Field label="E-mail de contato">
          <Input type="email" name="email" maxLength={200} defaultValue={a?.email ?? ""} />
        </Field>
        <Field label="Telefone">
          <Input name="phone" maxLength={40} defaultValue={a?.phone ?? ""} />
        </Field>
        <Field label="WhatsApp" hint="Somente números, com DDI (ex.: 5511999990000)">
          <Input name="whatsapp" maxLength={20} inputMode="numeric" defaultValue={a?.whatsapp ?? ""} />
        </Field>
        <Field label="Cor da loja">
          <div className="flex items-center gap-3">
            <Input type="color" name="brandColor" defaultValue={a?.brandColor ?? "#E4113F"} className="h-11 w-16 cursor-pointer p-1" />
            <span className="text-xs text-muted">Cor de destaque usada na loja do afiliado</span>
          </div>
        </Field>
        <Field label="URL do logo" className="sm:col-span-2">
          <Input type="url" name="logoUrl" maxLength={500} placeholder="https://…" defaultValue={a?.logoUrl ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-black uppercase tracking-wide text-muted">Dados para repasse</legend>
        <Field label="Chave Pix" className="sm:col-span-2">
          <Input name="pixKey" maxLength={140} defaultValue={a?.pixKey ?? ""} />
        </Field>
        <Field label="Banco">
          <Input name="bankName" maxLength={80} defaultValue={a?.bankName ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Agência">
            <Input name="bankAgency" maxLength={20} defaultValue={a?.bankAgency ?? ""} />
          </Field>
          <Field label="Conta">
            <Input name="bankAccount" maxLength={30} defaultValue={a?.bankAccount ?? ""} />
          </Field>
        </div>
      </fieldset>

      {a && (
        <label className="flex items-start gap-3 rounded-xl border border-line bg-cream/40 px-4 py-3">
          <input type="checkbox" name="active" defaultChecked={a.active} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
          <span>
            <span className="block text-sm font-bold text-ink">Afiliado ativo</span>
            <span className="block text-xs text-muted">Inativo: a loja e o painel do afiliado deixam de funcionar.</span>
          </span>
        </label>
      )}
    </div>
  );
}
