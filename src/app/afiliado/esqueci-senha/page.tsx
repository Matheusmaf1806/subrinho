import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { photo } from "@/lib/images";
import { requestResetAfiliadoAction } from "../login/actions";

export const metadata: Metadata = { title: "Esqueci minha senha · Painel do Afiliado", robots: { index: false, follow: false } };

export default function AfiliadoForgotPage() {
  return (
    <AuthSplit
      label="Painel do Afiliado"
      title="Esqueci minha senha"
      description="Informe o e-mail que você usa para entrar. Enviamos um link para criar uma nova senha."
      image={photo("heroWoman", 1400, 1700)}
      blockTitle={
        <>
          Viaje mais.
          <br />
          Venda mais.
        </>
      }
    >
      <ActionForm action={requestResetAfiliadoAction} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" name="email" autoComplete="username" inputMode="email" required placeholder="voce@suaagencia.com.br" />
        </Field>
        <SubmitButton size="lg" className="mt-2 w-full" pendingText="Enviando…">
          Enviar link
        </SubmitButton>
        <p className="text-center text-[13px]">
          <Link href="/afiliado/login" className="font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
            Voltar para o login
          </Link>
        </p>
      </ActionForm>
    </AuthSplit>
  );
}
