"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, Modal, SubmitButton, type ActionState } from "@/components/ui-client";
import { buttonClass, cn, Field, Input, Textarea } from "@/components/ui";
import { SyncedCheckable } from "../../_components/synced-inputs";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type DiscountType = "PERCENT" | "FIXED" | "CONDITIONAL";

export type CouponFormValues = {
  id?: string;
  code: string;
  description: string;
  discountType: DiscountType;
  percentOff: string;
  amountOff: string;
  stepAmount: string;
  maxDiscount: string;
  minSubtotal: string;
  categories: string[];
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  active: boolean;
};

const EMPTY_COUPON: CouponFormValues = {
  code: "",
  description: "",
  discountType: "PERCENT",
  percentOff: "",
  amountOff: "",
  stepAmount: "",
  maxDiscount: "",
  minSubtotal: "",
  categories: [],
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
  active: true,
};

const TYPE_OPTIONS: { value: DiscountType; title: string; hint: string }[] = [
  { value: "PERCENT", title: "Percentual", hint: "Ex.: 10% de desconto" },
  { value: "FIXED", title: "Valor fixo", hint: "Ex.: R$ 50 de desconto" },
  { value: "CONDITIONAL", title: "A cada R$ em compras", hint: "Ex.: R$ 100 a cada R$ 10.000" },
];

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Mesmo critério do servidor: "10.000" = dez mil, "1.234,56", "1234,5" ou "1500.75". */
function parseBrMoney(raw: string): number {
  let v = raw.replace(/\s/g, "").replace(/^R\$/i, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  return v ? Number(v) : NaN;
}
const fmt = (v: string) => {
  const n = parseBrMoney(v);
  return Number.isFinite(n) ? brlFmt.format(n) : "R$ —";
};

function preview(v: CouponFormValues, labels: Record<string, string>) {
  let main: string;
  if (v.discountType === "PERCENT") main = `${v.percentOff ? v.percentOff.replace(".", ",") : "—"}% de desconto`;
  else if (v.discountType === "FIXED") main = `${fmt(v.amountOff)} de desconto`;
  else main = `${fmt(v.amountOff)} a cada ${fmt(v.stepAmount)} em compras`;
  const parts = [main];
  parts.push(v.categories.length ? `em ${v.categories.map((c) => labels[c] ?? c).join(", ")}` : "em todas as categorias");
  if (v.minSubtotal) parts.push(`compra mínima de ${fmt(v.minSubtotal)}`);
  if (v.maxDiscount && v.discountType !== "FIXED") parts.push(`desconto máximo de ${fmt(v.maxDiscount)}`);
  return parts.join(" · ");
}

function MoneyInput(props: { name: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm font-bold text-muted">R$</span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        pattern={"[0-9.,]*"}
        title="Valor em reais, ex.: 10.000,00"
        name={props.name}
        required={props.required}
        placeholder={props.placeholder ?? "0,00"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="pl-10 tabular"
      />
    </div>
  );
}

function CouponFields({ initial, categories }: { initial: CouponFormValues; categories: { value: string; label: string }[] }) {
  const [v, setV] = useState<CouponFormValues>(initial);
  const set = <K extends keyof CouponFormValues>(k: K, val: CouponFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const labels = Object.fromEntries(categories.map((c) => [c.value, c.label]));
  const typeGroup = useId();

  return (
    <div className="space-y-5">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código do cupom" hint="3 a 30 caracteres: letras, números, - ou _">
          <Input
            name="code"
            required
            minLength={3}
            maxLength={30}
            pattern={"[A-Za-z0-9_\\-]{3,30}"}
            autoComplete="off"
            placeholder="EX.: VERAO10"
            value={v.code}
            onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
            className="font-bold uppercase tracking-wide"
          />
        </Field>
        <Field label="Limite de usos (opcional)" hint="Em branco = ilimitado">
          <Input
            type="number"
            name="maxRedemptions"
            min="1"
            step="1"
            inputMode="numeric"
            value={v.maxRedemptions}
            onChange={(e) => set("maxRedemptions", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Descrição (opcional)">
        <Textarea
          name="description"
          maxLength={200}
          className="min-h-16"
          placeholder="Ex.: Campanha de férias para clientes da agência"
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold text-ink">Tipo de desconto</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((t) => (
            <label
              key={t.value}
              className={cn(
                "cursor-pointer rounded-xl border px-3 py-2.5 transition",
                v.discountType === t.value ? "border-brand bg-brand-50 ring-2 ring-brand/15" : "border-line bg-white hover:border-brand-200",
              )}
            >
              <SyncedCheckable
                type="radio"
                name="discountType"
                value={t.value}
                checked={v.discountType === t.value}
                onChange={() => set("discountType", t.value)}
                className="sr-only"
                aria-describedby={`${typeGroup}-${t.value}`}
              />
              <span className="block text-sm font-extrabold text-ink">{t.title}</span>
              <span id={`${typeGroup}-${t.value}`} className="block text-xs text-muted">
                {t.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {v.discountType === "PERCENT" && (
          <Field label="Percentual de desconto">
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max="100"
                name="percentOff"
                required
                value={v.percentOff}
                onChange={(e) => set("percentOff", e.target.value)}
                className="pr-8 tabular"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-bold text-muted">%</span>
            </div>
          </Field>
        )}
        {v.discountType !== "PERCENT" && (
          <Field label={v.discountType === "FIXED" ? "Valor do desconto" : "Desconto de"}>
            <MoneyInput name="amountOff" required value={v.amountOff} onChange={(x) => set("amountOff", x)} />
          </Field>
        )}
        {v.discountType === "CONDITIONAL" && (
          <Field label="A cada (em compras elegíveis)">
            <MoneyInput name="stepAmount" required value={v.stepAmount} onChange={(x) => set("stepAmount", x)} placeholder="10.000,00" />
          </Field>
        )}
        {v.discountType !== "FIXED" && (
          <Field label="Desconto máximo (opcional)" hint="Teto do desconto por carrinho">
            <MoneyInput name="maxDiscount" value={v.maxDiscount} onChange={(x) => set("maxDiscount", x)} />
          </Field>
        )}
        <Field label="Compra mínima (opcional)" hint="Subtotal mínimo dos itens elegíveis">
          <MoneyInput name="minSubtotal" value={v.minSubtotal} onChange={(x) => set("minSubtotal", x)} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold text-ink">Categorias</legend>
        <p className="mb-2 text-xs text-muted">Nenhuma marcada = vale para todas as categorias.</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = v.categories.includes(c.value);
            return (
              <label
                key={c.value}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold transition",
                  on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand-200",
                )}
              >
                <SyncedCheckable
                  type="checkbox"
                  name="categories"
                  value={c.value}
                  checked={on}
                  onChange={(e) => set("categories", e.target.checked ? [...v.categories, c.value] : v.categories.filter((x) => x !== c.value))}
                  className="sr-only"
                />
                {c.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Válido a partir de (opcional)">
          <Input type="date" name="startsAt" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </Field>
        <Field label="Válido até (opcional)" hint="Inclui o dia inteiro (horário de Brasília)">
          <Input type="date" name="endsAt" min={v.startsAt || undefined} value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-bold text-ink">
        <SyncedCheckable
          type="checkbox"
          name="active"
          checked={v.active}
          onChange={(e) => set("active", e.target.checked)}
          className="h-4 w-4 rounded border-line accent-brand"
        />
        Cupom ativo
      </label>

      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/50 px-4 py-3 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Resumo</p>
        <p className="mt-0.5 font-semibold text-ink">
          {v.code || "CÓDIGO"}: {preview(v, labels)}
        </p>
        <p className="mt-1 text-xs text-muted">O desconto sai somente da sua margem e nunca deixa a sua margem abaixo de 0%.</p>
      </div>
    </div>
  );
}

/** Modal com o formulário de cupom (criar ou editar). Fecha ao salvar. */
export function CouponModal({
  action,
  initial = EMPTY_COUPON,
  categories,
  trigger,
  title,
  triggerClassName,
}: {
  action: Action;
  /** Valores do cupom a editar; omitido = novo cupom. */
  initial?: CouponFormValues;
  categories: { value: string; label: string }[];
  trigger: ReactNode;
  title: string;
  triggerClassName?: string;
}) {
  return (
    <Modal trigger={trigger} title={title} size="lg" triggerClassName={triggerClassName}>
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <CouponFields initial={initial} categories={categories} />
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} className={buttonClass("ghost")}>
              Cancelar
            </button>
            <SubmitButton>{initial.id ? "Salvar cupom" : "Criar cupom"}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

function ToggleButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(active ? "danger" : "secondary", "sm")}>
      {pending ? "Aguarde…" : active ? "Desativar" : "Ativar"}
    </button>
  );
}

/** Ativa/desativa um cupom com retorno compacto. */
export function ToggleCouponForm({ action, id, active }: { action: Action; id: string; active: boolean }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <ToggleButton active={active} />
      {state?.error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
