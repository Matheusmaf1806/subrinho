"use client";

import type { ReactNode } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";

/** Formulário "adicionar ao carrinho": cota no fornecedor (preço certo) e leva ao carrinho. */
export function AddToCartForm({
  action,
  hidden,
  children,
  label = "Adicionar ao carrinho",
  className,
  buttonClassName,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  hidden: Record<string, string | number | null | undefined>;
  children?: ReactNode;
  label?: string;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <ActionForm action={action} className={className}>
      {Object.entries(hidden).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
      {children}
      <SubmitButton variant="accent" size="lg" pendingText="Consultando o fornecedor…" className={buttonClassName ?? "mt-4 w-full"}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
