import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { currentSubrinhoUser } from "@/server/auth/session";
import { loginSubrinho } from "./actions";

export const metadata: Metadata = { title: { absolute: "Entrar · Painel Subrinho" }, robots: { index: false, follow: false } };

export default async function SubrinhoLoginPage() {
  if (await currentSubrinhoUser()) redirect("/subrinho");

  return (
    <AuthSplit
      label="Painel Subrinho"
      title="Olá, equipe."
      description="Pedidos, margens, câmbio, cupons, repasses e relatórios de todas as lojas."
      tone="dark"
      blockTitle={
        <>
          Seu sobrinho
          <br />
          favorito da
          <br />
          <span className="text-brand">tecnologia.</span>
        </>
      }
      footnote="Acesso restrito à equipe Subrinho."
    >
      <ActionForm action={loginSubrinho} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" name="email" autoComplete="username" required placeholder="voce@subrinho.com.br" />
        </Field>
        <Field label="Senha">
          <Input type="password" name="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="mt-2 w-full" size="lg" variant="dark" pendingText="Entrando…">
          Entrar no painel →
        </SubmitButton>
      </ActionForm>
    </AuthSplit>
  );
}
