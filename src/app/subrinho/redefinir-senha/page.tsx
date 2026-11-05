import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { Alert, Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { peekResetToken } from "@/server/auth/reset";
import { resetSubrinhoAction } from "../login/actions";

const BLOCK = (
  <>
    Seu sobrinho
    <br />
    favorito da
    <br />
    <span className="text-brand-ink">tecnologia.</span>
  </>
);

export const metadata: Metadata = { title: { absolute: "Nova senha · Painel Subrinho" }, robots: { index: false, follow: false } };

export default async function SubrinhoResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const valid = await peekResetToken(db, "subrinho", t);
  return (
    <AuthSplit label="Painel Subrinho" title="Criar nova senha" description="Escolha uma senha com ao menos 8 caracteres." tone="dark" footnote="Acesso restrito à equipe Subrinho." blockTitle={BLOCK}>
      {valid ? (
        <ActionForm action={resetSubrinhoAction} className="space-y-4">
          <input type="hidden" name="t" value={t} />
          <Field label="Nova senha">
            <Input type="password" name="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repita a nova senha">
            <Input type="password" name="confirm" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton className="mt-2 w-full" size="lg" variant="dark" pendingText="Salvando…">
            Salvar nova senha
          </SubmitButton>
        </ActionForm>
      ) : (
        <Alert tone="warning" title="Link vencido ou já usado">
          Os links valem 1 hora e funcionam uma vez só. <Link href="/subrinho/esqueci-senha" className="font-semibold underline">Pedir um novo link</Link>
        </Alert>
      )}
    </AuthSplit>
  );
}
