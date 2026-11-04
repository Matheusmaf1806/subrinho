"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, buttonClass, cn } from "./ui";

/**
 * Convenção para Server Actions usadas com <ActionForm>:
 *   async function acao(prev: ActionState, formData: FormData): Promise<ActionState>
 */
export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null;

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingText = "Salvando…",
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  formAction,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  className?: string;
  name?: string;
  value?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingContext);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" name={name} value={value} formAction={formAction} disabled={pending || disabled} className={buttonClass(variant, size, className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Formulário ligado a uma Server Action com mensagens de sucesso/erro. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  showMessages = true,
  errorExtra,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  showMessages?: boolean;
  /** Conteúdo extra mostrado junto da mensagem de erro (ex.: botão para atualizar a página). */
  errorExtra?: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    // onSubmit (em vez de action=) para o React não limpar os campos quando a action retorna erro.
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, submitter ?? undefined);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={isPending}>
      {showMessages && state?.error && (
        <Alert tone="danger" className="mb-3">
          {state.error}
          {errorExtra}
        </Alert>
      )}
      {showMessages && state?.ok && state.message && (
        <Alert tone="success" className="mb-3">
          {state.message}
        </Alert>
      )}
      {children}
      </PendingContext.Provider>
    </form>
  );
}

/** Modal baseado em <dialog>. */
export function Modal({
  trigger,
  title,
  children,
  triggerClassName,
  size = "md",
}: {
  trigger: ReactNode;
  title: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? buttonClass("outline", "sm")}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className={cn(
          "m-auto w-[calc(100%-1.5rem)] rounded-[2rem] bg-white p-0 text-ink shadow-[0_40px_120px_-20px_rgba(0,0,0,0.45)]",
          size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
          <button type="button" onClick={close} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-lg leading-none text-ink hover:bg-surface-2" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 pt-2 pb-6">{open ? (typeof children === "function" ? children(close) : children) : null}</div>
      </dialog>
    </>
  );
}

export function CopyButton({ text, label = "Copiar", copiedLabel = "Copiado!", className }: { text: string; label?: string; copiedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? buttonClass("outline", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

/** Botão que pede confirmação antes de enviar o formulário. */
export function ConfirmSubmit({ children, message, className }: { children: ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className ?? buttonClass("danger", "sm")}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
