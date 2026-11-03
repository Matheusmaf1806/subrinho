"use client";

/**
 * Igual ao <ActionForm>, mas NÃO apaga o que foi digitado quando a ação devolve erro.
 * (Com `<form action={fn}>` o React 19 reseta todos os campos não controlados após cada envio;
 * aqui o envio é feito via onSubmit + startTransition, o que mantém os valores e preserva o
 * estado de "enviando" do <SubmitButton> via useFormStatus.)
 */
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import type { ActionState } from "@/components/ui-client";

export function StickyActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state?.error || state?.message) msgRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <div ref={msgRef} className="scroll-mt-24">
        {state?.error && (
          <Alert tone="danger" className="mb-3">
            {state.error}
          </Alert>
        )}
        {state?.ok && state.message && (
          <Alert tone="success" className="mb-3">
            {state.message}
          </Alert>
        )}
      </div>
      {children}
    </form>
  );
}
