"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Trash2 } from "lucide-react";
import type { ActionState } from "@/components/ui-client";
import { buttonClass, cn, inputClass } from "@/components/ui";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || !dirty} className={buttonClass("primary", "sm")}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

/** Campo de margem (%) com botão salvar e retorno compacto — para usar em linhas de tabela. */
export function MarginInlineForm({
  action,
  hidden,
  value,
  max,
  label,
  placeholder,
}: {
  action: Action;
  hidden: Record<string, string>;
  /** Valor atual da regra (vazio quando herda). */
  value: string;
  max: string;
  label: string;
  placeholder?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const initial = value === "" ? "" : String(Number(value));
  const [v, setV] = useState(initial);
  // Quando o servidor devolve um novo valor (após salvar ou por outra tela), sincroniza o campo.
  const [prev, setPrev] = useState(initial);
  if (initial !== prev) {
    setPrev(initial);
    setV(initial);
  }
  const id = useId();
  const dirty = v.trim() !== "" && (initial === "" || Number(v) !== Number(initial));
  return (
    <form action={formAction} className="min-w-[12rem]">
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <div className="relative w-28">
          <input
            id={id}
            name="marginPct"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max={max}
            required
            value={v}
            placeholder={placeholder}
            onChange={(e) => setV(e.target.value)}
            className={cn(inputClass, "py-1.5 pr-7 text-right tabular")}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-sm font-bold text-muted">%</span>
        </div>
        <SaveButton dirty={dirty} />
      </div>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && !dirty && (
        <p role="status" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
          <Check className="h-3.5 w-3.5" aria-hidden /> {state.message ?? "Salvo"}
        </p>
      )}
    </form>
  );
}

function RemoveButton({ label, confirmMessage }: { label: string; confirmMessage: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("danger", "sm")}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden /> {pending ? "Removendo…" : label}
    </button>
  );
}

/** Remove uma regra (volta a herdar a regra mais geral). */
export function RemoveRuleForm({
  action,
  ruleId,
  label = "Remover",
  confirmMessage = "Remover esta regra? A margem volta a seguir a regra mais geral.",
}: {
  action: Action;
  ruleId: string;
  label?: string;
  confirmMessage?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="ruleId" value={ruleId} />
      <RemoveButton label={label} confirmMessage={confirmMessage} />
      {state?.error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Simulador da margem "por dentro": preço = base ÷ (1 − margem). */
export function MarginSimulator({
  defaultMargin,
  max,
  installmentFeePct,
  maxInstallments,
}: {
  defaultMargin: string;
  max: string;
  installmentFeePct: string;
  maxInstallments: number;
}) {
  const [base, setBase] = useState("1000");
  const [margin, setMargin] = useState(String(Number(defaultMargin)));
  const baseId = useId();
  const marginId = useId();
  const r = useMemo(() => {
    const b = Number(base.replace(",", "."));
    const m = Number(margin.replace(",", "."));
    const fee = Number(installmentFeePct);
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(m) || m < 0 || m >= 100 || m > Number(max)) return null;
    const pix = round2(b / (1 - m / 100));
    const commission = round2(pix - b);
    const parcelado = round2(pix / (1 - fee / 100));
    return { pix, commission, parcelado, parcela: Math.floor((parcelado / maxInstallments) * 100) / 100 };
  }, [base, margin, installmentFeePct, maxInstallments, max]);

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
      <p className="text-sm font-extrabold text-ink">Simulador</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={baseId} className="mb-1 block text-xs font-bold text-muted">
            Preço base (antes da sua margem)
          </label>
          <input
            id={baseId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className={cn(inputClass, "py-1.5 tabular")}
          />
        </div>
        <div>
          <label htmlFor={marginId} className="mb-1 block text-xs font-bold text-muted">
            Sua margem (%)
          </label>
          <input
            id={marginId}
            type="number"
            inputMode="decimal"
            min="0"
            max={max}
            step="0.01"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            className={cn(inputClass, "py-1.5 tabular")}
          />
        </div>
      </div>
      {r ? (
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-xs font-bold text-muted">Preço no PIX</dt>
            <dd className="font-black tabular text-ink">{brlFmt.format(r.pix)}</dd>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-xs font-bold text-muted">Sua comissão</dt>
            <dd className="font-black tabular text-success">{brlFmt.format(r.commission)}</dd>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-xs font-bold text-muted">Parcelado</dt>
            <dd className="font-black tabular text-ink">
              {maxInstallments}x {brlFmt.format(r.parcela)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm font-semibold text-red-600">Informe um preço válido e uma margem entre 0% e {max}%.</p>
      )}
      <p className="mt-3 text-xs text-muted">Valores ilustrativos. O preço real depende do item, do câmbio e dos cupons aplicados.</p>
    </div>
  );
}
