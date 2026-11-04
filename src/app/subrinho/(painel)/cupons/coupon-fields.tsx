"use client";

/** Campos do cupom da Subrinho (criar/editar). Mostra só os campos do tipo de desconto escolhido. */
import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";

export type CouponDefaults = {
  code?: string;
  description?: string | null;
  discountType?: "PERCENT" | "FIXED" | "CONDITIONAL";
  percentOff?: string | null;
  amountOff?: string | null;
  stepAmount?: string | null;
  maxDiscount?: string | null;
  minSubtotal?: string | null;
  categories?: string[];
  affiliateId?: string | null;
  startsAt?: string;
  endsAt?: string;
  maxRedemptions?: number | null;
  active?: boolean;
};

const num = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(Number(v)).replace(".", ","));

export function CouponFields({
  c = {},
  affiliates,
  categories,
}: {
  c?: CouponDefaults;
  affiliates: { id: string; name: string }[];
  categories: { value: string; label: string; future: boolean }[];
}) {
  const [type, setType] = useState<CouponDefaults["discountType"]>(c.discountType ?? "PERCENT");

  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Cupom</legend>
        <Field label="Código *" hint="3 a 30 caracteres: letras, números, - ou _ (fica em MAIÚSCULAS)">
          <Input name="code" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_\-]+" defaultValue={c.code} className="font-mono uppercase" autoComplete="off" />
        </Field>
        <Field label="Tipo de desconto *">
          <Select name="discountType" value={type} onChange={(e) => setType(e.target.value as CouponDefaults["discountType"])}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
            <option value="CONDITIONAL">Condicional (R$ X a cada R$ Y)</option>
          </Select>
        </Field>
        <Field label="Descrição" className="sm:col-span-2" hint="Uso interno e exibida ao aplicar o cupom">
          <Textarea name="description" maxLength={300} defaultValue={c.description ?? ""} className="min-h-16" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Desconto</legend>
        {type === "PERCENT" && (
          <Field label="Percentual *" hint="Sobre o preço PIX dos itens elegíveis">
            <Input name="percentOff" inputMode="decimal" required defaultValue={num(c.percentOff)} placeholder="5" />
          </Field>
        )}
        {type === "FIXED" && (
          <Field label="Valor do desconto (R$) *">
            <Input name="amountOff" inputMode="decimal" required defaultValue={num(c.amountOff)} placeholder="50,00" />
          </Field>
        )}
        {type === "CONDITIONAL" && (
          <>
            <Field label="Desconto (R$) *" hint="R$ X…">
              <Input name="amountOff" inputMode="decimal" required defaultValue={num(c.amountOff)} placeholder="100,00" />
            </Field>
            <Field label="A cada (R$) *" hint="…a cada R$ Y em compras">
              <Input name="stepAmount" inputMode="decimal" required defaultValue={num(c.stepAmount)} placeholder="10.000,00" />
            </Field>
          </>
        )}
        <Field label="Desconto máximo (R$)" hint="Opcional: teto do desconto">
          <Input name="maxDiscount" inputMode="decimal" defaultValue={num(c.maxDiscount)} />
        </Field>
        <Field label="Compra mínima (R$)" hint="Opcional: nos itens elegíveis">
          <Input name="minSubtotal" inputMode="decimal" defaultValue={num(c.minSubtotal)} />
        </Field>
      </fieldset>
      <p className="-mt-3 text-xs text-muted">
        O desconto sai somente da margem Subrinho de cada item e nunca a deixa abaixo de 0%. Se não houver margem suficiente, o desconto é limitado.
      </p>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Categorias elegíveis</legend>
        <p className="mb-2 text-xs text-muted">Nenhuma marcada = todas as categorias.</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <label
              key={cat.value}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
            >
              <input type="checkbox" name="categories" value={cat.value} defaultChecked={c.categories?.includes(cat.value)} className="h-4 w-4 accent-[var(--color-brand)]" />
              {cat.label}
              {cat.future && <span className="text-[10px] font-semibold uppercase text-muted">em breve</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Onde e quando</legend>
        <Field label="Loja" hint="Restringir a uma loja (opcional)" className="lg:col-span-2">
          <Select name="affiliateId" defaultValue={c.affiliateId ?? ""}>
            <option value="">Todas as lojas</option>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Limite de usos" hint="Vazio = ilimitado">
          <Input name="maxRedemptions" inputMode="numeric" pattern="[0-9]*" defaultValue={c.maxRedemptions ?? ""} />
        </Field>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="active" defaultChecked={c.active ?? true} className="h-4 w-4 accent-[var(--color-brand)]" />
            Cupom ativo
          </label>
        </div>
        <Field label="Válido a partir de" hint="Horário de Brasília" className="lg:col-span-2">
          <Input type="datetime-local" name="startsAt" defaultValue={c.startsAt ?? ""} />
        </Field>
        <Field label="Válido até" hint="Horário de Brasília" className="lg:col-span-2">
          <Input type="datetime-local" name="endsAt" defaultValue={c.endsAt ?? ""} />
        </Field>
      </fieldset>
    </div>
  );
}
