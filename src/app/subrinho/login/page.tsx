import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import Link from "next/link";
import { Alert, Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { currentSubrinhoUser } from "@/server/auth/session";
import { loginSubrinho } from "./actions";

export const metadata: Metadata = { title: { absolute: "Entrar · Painel Subrinho" }, robots: { index: false, follow: false } };

export default async function SubrinhoLoginPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  if (await currentSubrinhoUser()) redirect("/subrinho");
  const { senha } = await searchParams;

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
          <span className="text-brand-ink">tecnologia.</span>
        </>
      }
      footnote="Acesso restrito à equipe Subrinho."
    >
      {senha === "nova" && (
        <Alert tone="success" className="mb-4">
          Senha nova salva. Entre com ela.
        </Alert>
      )}
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
        <p className="text-center text-[13px]">
          <Link href="/subrinho/esqueci-senha" className="font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </ActionForm>
    </AuthSplit>
  );
}
