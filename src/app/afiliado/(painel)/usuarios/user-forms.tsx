"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { buttonClass, Field, Input } from "@/components/ui";
import { SyncedSelect } from "../../_components/synced-inputs";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const EMPTY = { name: "", email: "", role: "AGENT" };

export function NewUserForm({ action }: { action: Action }) {
  const [v, setV] = useState(EMPTY);
  return (
    <ActionForm action={action} onSuccess={() => setV(EMPTY)} className="space-y-4">
      <Field label="Nome">
        <Input name="name" required minLength={2} maxLength={120} autoComplete="off" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="E-mail">
        <Input
          type="email"
          name="email"
          required
          autoComplete="off"
          inputMode="email"
          value={v.email}
          onChange={(e) => setV({ ...v, email: e.target.value })}
        />
      </Field>
      <Field label="Senha inicial" hint="Mínimo de 8 caracteres. Envie ao usuário por um canal seguro.">
        <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Perfil">
        <SyncedSelect name="role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
          <option value="AGENT">Agente: vende e acompanha pedidos</option>
          <option value="ADMIN">Administrador: acesso total</option>
        </SyncedSelect>
      </Field>
      <SubmitButton className="w-full" pendingText="Criando…">
        Criar usuário
      </SubmitButton>
    </ActionForm>
  );
}

function ToggleButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(active ? "danger" : "secondary", "sm")}
      onClick={(e) => {
        if (active && !confirm("Desativar este usuário? Ele perde o acesso ao painel e à loja em modo agência.")) e.preventDefault();
      }}
    >
      {pending ? "Aguarde…" : active ? "Desativar" : "Reativar"}
    </button>
  );
}

export function ToggleUserForm({ action, userId, active }: { action: Action; userId: string; active: boolean }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
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
