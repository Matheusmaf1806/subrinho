import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { currentAffiliateUser } from "@/server/auth/session";
import { hasPendingMfa } from "@/server/auth/mfa";
import { photo } from "@/lib/images";
import { verifyAfiliadoMfaAction } from "../actions";

export const metadata: Metadata = { title: "Código de acesso · Painel do Afiliado", robots: { index: false, follow: false } };

export default async function AfiliadoMfaPage() {
  if (await currentAffiliateUser()) redirect("/afiliado");
  if (!(await hasPendingMfa("afiliado"))) redirect("/afiliado/login");
  return (
    <AuthSplit
      label="Painel do Afiliado"
      title="Código de acesso"
      description="Abra o app autenticador no celular e digite o código de 6 dígitos do Painel do Afiliado."
      image={photo("heroWoman", 1400, 1700)}
      blockTitle={
        <>
          Viaje mais.
          <br />
          Venda mais.
        </>
      }
      footnote="Perdeu o celular? Peça ao ADMIN da sua agência (ou à equipe Subrinho) para desligar a sua verificação."
    >
      <ActionForm action={verifyAfiliadoMfaAction} className="space-y-4">
        <Field label="Código do app autenticador">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="000000" className="text-center text-xl tracking-[0.4em]" />
        </Field>
        <SubmitButton size="lg" className="mt-2 w-full" pendingText="Conferindo…">
          Entrar →
        </SubmitButton>
        <p className="text-center text-[13px]">
          <Link href="/afiliado/login" className="font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
            Voltar
          </Link>
        </p>
      </ActionForm>
    </AuthSplit>
  );
}
