"use client";

/** Formulários compactos (para células de tabela) ligados a Server Actions no formato ActionState. */
import { useActionState, type ReactNode } from "react";
import { cn, inputClass } from "@/components/ui";
import { SubmitButton, type ActionState } from "@/components/ui-client";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function Hidden({ fields }: { fields: Record<string, string | null | undefined> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />))}
    </>
  );
}

function Feedback({ state, okText }: { state: ActionState; okText?: string }) {
  if (state?.error)
    return (
      <p role="alert" className="mt-1 w-full text-xs font-semibold text-red-600">
        {state.error}
      </p>
    );
  if (state?.ok && okText)
    return (
      <p role="status" className="mt-1 w-full text-xs font-semibold text-emerald-700">
        {okText}
      </p>
    );
  return null;
}

/** Botão único (ativar/desativar, remover...) com confirmação opcional e erro inline. */
export function InlineActionButton({
  action,
  fields,
  children,
  confirmMessage,
  variant = "outline",
  pendingText = "…",
  className,
}: {
  action: Action;
  fields: Record<string, string | null | undefined>;
  children: ReactNode;
  confirmMessage?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "dark";
  pendingText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={cn("inline-flex flex-wrap items-center", className)}
      onSubmit={(e) => {
        if (confirmMessage && !confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <Hidden fields={fields} />
      <SubmitButton size="sm" variant={variant} pendingText={pendingText}>
        {children}
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

/** Campo de percentual + botão salvar, numa linha. */
export function InlinePercentForm({
  action,
  fields,
  name = "marginPct",
  defaultValue,
  placeholder,
  label,
  buttonText = "Salvar",
}: {
  action: Action;
  fields: Record<string, string | null | undefined>;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  label: string;
  buttonText?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Hidden fields={fields} />
      <div className="relative w-24">
        <input
          name={name}
          aria-label={label}
          defaultValue={defaultValue}
          placeholder={placeholder}
          inputMode="decimal"
          autoComplete="off"
          required
          className={cn(inputClass, "py-1.5 pr-7 text-right tabular")}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden>
          %
        </span>
      </div>
      <SubmitButton size="sm" variant="secondary" pendingText="…">
        {buttonText}
      </SubmitButton>
      <Feedback state={state} okText="Salvo" />
    </form>
  );
}

/** <select> que envia o formulário ao mudar (com botão de fallback sem JS). */
export function AutoSubmitSelect({ children, className, ...p }: React.ComponentProps<"select">) {
  return (
    <select {...p} className={cn(inputClass, "pr-8", className)} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}
