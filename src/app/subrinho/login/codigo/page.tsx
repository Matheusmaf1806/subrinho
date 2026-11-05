import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { currentSubrinhoUser } from "@/server/auth/session";
import { verifyMfaAction } from "../actions";

const BLOCK = (
  <>
    Seu sobrinho
    <br />
    favorito da
    <br />
    <span className="text-brand-ink">tecnologia.</span>
  </>
);

export const metadata: Metadata = { title: { absolute: "Código de acesso · Painel Subrinho" }, robots: { index: false, follow: false } };

export default async function SubrinhoMfaPage() {
  if (await currentSubrinhoUser()) redirect("/subrinho");
  if (!(await cookies()).get("sb_subrinho_mfa")) redirect("/subrinho/login");
  return (
    <AuthSplit label="Painel Subrinho" title="Código de acesso" description="Abra o app autenticador no celular e digite o código de 6 dígitos da Subrinho." tone="dark" footnote="Acesso restrito à equipe Subrinho." blockTitle={BLOCK}>
      <ActionForm action={verifyMfaAction} className="space-y-4">
        <Field label="Código do app autenticador">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="000000" className="text-center text-xl tracking-[0.4em]" />
        </Field>
        <SubmitButton className="mt-2 w-full" size="lg" variant="dark" pendingText="Conferindo…">
          Entrar →
        </SubmitButton>
        <p className="text-center text-[13px] text-muted">
          Perdeu o celular? Peça a um Proprietário para desligar a sua verificação em Configurações. <Link href="/subrinho/login" className="underline underline-offset-4">Voltar</Link>
        </p>
      </ActionForm>
    </AuthSplit>
  );
}
