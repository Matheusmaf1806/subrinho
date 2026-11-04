"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { openCartDrawer } from "./cart-events";

/** Recarrega preços e disponibilidade da página (sem perder a busca). */
function RefreshOptions() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className="mt-1.5 flex items-center gap-1.5 font-semibold underline underline-offset-2 disabled:opacity-60">
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> {pending ? "Atualizando…" : "Atualizar opções"}
    </button>
  );
}

/** Formulário "adicionar ao carrinho": cota no fornecedor (preço certo) e abre o carrinho flutuante. */
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
    <ActionForm action={action} className={className} errorExtra={<RefreshOptions />} onSuccess={() => openCartDrawer({ added: true })}>
      {Object.entries(hidden).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
      {children}
      <SubmitButton variant="accent" size="lg" pendingText="Consultando o fornecedor…" className={buttonClassName ?? "mt-4 w-full"}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
