import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { requestResetSubrinhoAction } from "../login/actions";

const BLOCK = (
  <>
    Seu sobrinho
    <br />
    favorito da
    <br />
    <span className="text-brand-ink">tecnologia.</span>
  </>
);

export const metadata: Metadata = { title: { absolute: "Esqueci minha senha · Painel Subrinho" }, robots: { index: false, follow: false } };

export default function SubrinhoForgotPage() {
  return (
    <AuthSplit label="Painel Subrinho" title="Esqueci minha senha" description="Informe o seu e-mail da equipe. Enviamos um link para criar uma nova senha." tone="dark" footnote="Acesso restrito à equipe Subrinho." blockTitle={BLOCK}>
      <ActionForm action={requestResetSubrinhoAction} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" name="email" autoComplete="username" required placeholder="voce@subrinho.com.br" />
        </Field>
        <SubmitButton className="mt-2 w-full" size="lg" variant="dark" pendingText="Enviando…">
          Enviar link
        </SubmitButton>
        <p className="text-center text-[13px]">
          <Link href="/subrinho/login" className="font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
            Voltar para o login
          </Link>
        </p>
      </ActionForm>
    </AuthSplit>
  );
}
