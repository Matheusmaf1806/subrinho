import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { Alert, Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { photo } from "@/lib/images";
import { db } from "@/server/db";
import { peekResetToken } from "@/server/auth/reset";
import { resetAfiliadoAction } from "../login/actions";

export const metadata: Metadata = { title: "Nova senha · Painel do Afiliado", robots: { index: false, follow: false } };

export default async function AfiliadoResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const valid = await peekResetToken(db, "afiliado", t);
  return (
    <AuthSplit
      label="Painel do Afiliado"
      title="Criar nova senha"
      description="Escolha uma senha com ao menos 8 caracteres. Depois de salvar, você já entra no painel."
      image={photo("heroWoman", 1400, 1700)}
      blockTitle={
        <>
          Viaje mais.
          <br />
          Venda mais.
        </>
      }
    >
      {valid ? (
        <ActionForm action={resetAfiliadoAction} className="space-y-4">
          <input type="hidden" name="t" value={t} />
          <Field label="Nova senha">
            <Input type="password" name="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repita a nova senha">
            <Input type="password" name="confirm" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton size="lg" className="mt-2 w-full" pendingText="Salvando…">
            Salvar e entrar
          </SubmitButton>
        </ActionForm>
      ) : (
        <Alert tone="warning" title="Link vencido ou já usado">
          Os links valem 1 hora e funcionam uma vez só. <Link href="/afiliado/esqueci-senha" className="font-semibold underline">Pedir um novo link</Link>
        </Alert>
      )}
    </AuthSplit>
  );
}
