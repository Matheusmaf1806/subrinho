import { Alert, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { db } from "@/server/db";
import { peekResetToken } from "@/server/auth/reset";
import { getStore, storeBase } from "../_lib/store";
import { resetCustomerPasswordAction } from "../actions";

export const metadata = { title: "Nova senha", robots: { index: false } };

const lab = "mb-2 block text-[13px] font-medium text-muted";

export default async function ResetPasswordPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t = "" } = await searchParams;
  const store = await getStore(slug);
  const sb = await storeBase(store);
  const valid = await peekResetToken(db, "loja", t, store.id);
  return (
    <main className="mx-auto max-w-lg px-4 py-14 sm:py-20">
      <h1 className="display text-[clamp(2.25rem,5vw,3.5rem)] text-ink">Criar nova senha</h1>
      {valid ? (
        <>
          <p className="mt-3 text-[16px] text-muted">Escolha uma senha com ao menos 8 caracteres. Depois de salvar, você já entra na sua conta.</p>
          <ActionForm action={resetCustomerPasswordAction.bind(null, slug)} className="mt-8 space-y-3">
            <input type="hidden" name="t" value={t} />
            <label className="block">
              <span className={lab}>Nova senha</span>
              <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label className="block">
              <span className={lab}>Repita a nova senha</span>
              <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Salvando…">
              Salvar e entrar
            </SubmitButton>
          </ActionForm>
        </>
      ) : (
        <Alert tone="warning" title="Link vencido ou já usado" className="mt-8">
          Os links valem 1 hora e funcionam uma vez só.{" "}
          <a href={`${sb}/esqueci-senha`} className="font-semibold underline">
            Pedir um novo link
          </a>
        </Alert>
      )}
    </main>
  );
}
