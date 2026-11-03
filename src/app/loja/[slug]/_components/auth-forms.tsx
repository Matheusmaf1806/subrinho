"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { cn, Input } from "@/components/ui";

const lab = "mb-2 block text-[13px] font-medium text-muted";
type A = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function CustomerAuth({ login, register, agency, next, initial = "login" }: { login: A; register: A; agency?: A; next: string; initial?: "login" | "register" | "agency" }) {
  const [tab, setTab] = useState(initial);
  const tabs = [
    { k: "login" as const, l: "Já tenho conta" },
    { k: "register" as const, l: "Criar conta" },
    ...(agency ? [{ k: "agency" as const, l: "Sou da agência" }] : []),
  ];
  return (
    <div>
      <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-full bg-surface p-1">
        {tabs.map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)} className={cn("h-10 flex-1 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition", tab === t.k ? "bg-ink text-white" : "text-muted hover:text-ink")}>
            {t.l}
          </button>
        ))}
      </div>
      {tab === "login" && (
        <ActionForm action={login} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className={lab}>E-mail</span>
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="block">
            <span className={lab}>Senha</span>
            <Input name="password" type="password" required autoComplete="current-password" />
          </label>
          <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Entrando…">
            Entrar
          </SubmitButton>
        </ActionForm>
      )}
      {tab === "register" && (
        <ActionForm action={register} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="next" value={next} />
          <label className="block sm:col-span-2">
            <span className={lab}>Nome completo</span>
            <Input name="name" required autoComplete="name" />
          </label>
          <label className="block">
            <span className={lab}>E-mail</span>
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="block">
            <span className={lab}>Celular</span>
            <Input name="phone" required inputMode="tel" autoComplete="tel" />
          </label>
          <label className="block">
            <span className={lab}>CPF</span>
            <Input name="document" required inputMode="numeric" placeholder="000.000.000-00" />
          </label>
          <label className="block">
            <span className={lab}>Data de nascimento</span>
            <Input name="birthDate" type="date" />
          </label>
          <label className="block sm:col-span-2">
            <span className={lab}>Senha (mín. 8 caracteres)</span>
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <SubmitButton variant="accent" size="lg" className="w-full sm:col-span-2" pendingText="Criando conta…">
            Criar conta e continuar
          </SubmitButton>
        </ActionForm>
      )}
      {tab === "agency" && agency && (
        <ActionForm action={agency} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <p className="text-sm text-muted">Acesso para a equipe da agência. Usuários ADMIN podem entrar em modo ADMIN para alterar margens no checkout.</p>
          <label className="block">
            <span className={lab}>E-mail da agência</span>
            <Input name="email" type="email" required />
          </label>
          <label className="block">
            <span className={lab}>Senha</span>
            <Input name="password" type="password" required />
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-[15px] font-semibold text-ink">
            <input type="checkbox" name="adminMode" defaultChecked className="h-4 w-4 accent-brand" /> Entrar em modo ADMIN
          </label>
          <SubmitButton variant="dark" size="lg" className="w-full" pendingText="Entrando…">
            Entrar como agência
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
