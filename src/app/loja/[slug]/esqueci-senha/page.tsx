import { Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { getStore, storeBase } from "../_lib/store";
import { requestCustomerResetAction } from "../actions";

export const metadata = { title: "Esqueci minha senha", robots: { index: false } };

export default async function ForgotPasswordPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const sb = await storeBase(store);
  return (
    <main className="mx-auto max-w-lg px-4 py-14 sm:py-20">
      <h1 className="display text-[clamp(2.25rem,5vw,3.5rem)] text-ink">Esqueci minha senha</h1>
      <p className="mt-3 text-[16px] text-muted">Informe o e-mail da sua conta na {store.name}. Enviamos um link para você criar uma nova senha.</p>
      <ActionForm action={requestCustomerResetAction.bind(null, slug)} className="mt-8 space-y-3">
        <label className="block">
          <span className="mb-2 block text-[13px] font-medium text-muted">E-mail</span>
          <Input name="email" type="email" required autoComplete="email" />
        </label>
        <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Enviando…">
          Enviar link
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-[14px]">
        <a href={`${sb}/entrar`} className="font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Voltar para entrar
        </a>
      </p>
    </main>
  );
}
