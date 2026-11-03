"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { Field, Input } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm() {
  // Campo controlado: mantém o e-mail digitado quando a senha está errada.
  const [email, setEmail] = useState("");
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <Field label="E-mail">
        <Input
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          placeholder="voce@suaagencia.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Senha">
        <Input type="password" name="password" autoComplete="current-password" required placeholder="Sua senha" />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Entrando…">
        Entrar no painel
      </SubmitButton>
    </ActionForm>
  );
}
