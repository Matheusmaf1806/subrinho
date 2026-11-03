import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { FlightPath, SubrinhoLogo } from "@/components/brand";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { currentSubrinhoUser } from "@/server/auth/session";
import { loginSubrinho } from "./actions";

export const metadata: Metadata = { title: { absolute: "Entrar · Painel Subrinho" }, robots: { index: false, follow: false } };

export default async function SubrinhoLoginPage() {
  if (await currentSubrinhoUser()) redirect("/subrinho");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand px-6 py-8 text-cream sm:px-10 lg:px-14 lg:py-12">
        <SubrinhoLogo tone="light" size="md" />
        <div className="relative z-10 my-10 max-w-md lg:my-0">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cream/70">Painel Subrinho</p>
          <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Seu sobrinho favorito da tecnologia.
          </h1>
          <p className="mt-4 text-base text-cream/80">
            Pedidos, margens, câmbio, cupons, repasses e relatórios de todas as lojas em um só lugar.
          </p>
        </div>
        <FlightPath className="pointer-events-none absolute -right-6 bottom-6 hidden w-80 text-cream/25 sm:block lg:w-[28rem]" />
        <p className="relative z-10 hidden text-xs text-cream/60 lg:block">Acesso restrito à equipe Subrinho.</p>
      </section>

      <section className="flex items-center justify-center bg-cream px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand">
                <Lock className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-black text-ink">Entrar</h2>
                <p className="text-sm text-muted">Use seu e-mail da equipe Subrinho.</p>
              </div>
            </div>
            <ActionForm action={loginSubrinho} className="space-y-4">
              <Field label="E-mail">
                <Input type="email" name="email" autoComplete="username" required placeholder="voce@subrinho.com.br" />
              </Field>
              <Field label="Senha">
                <Input type="password" name="password" autoComplete="current-password" required />
              </Field>
              <SubmitButton className="w-full" size="lg" pendingText="Entrando…">
                Entrar no painel
              </SubmitButton>
            </ActionForm>
          </div>
          <p className="mt-6 text-center text-xs text-muted">© Subrinho · Plataforma de viagens para agências</p>
        </div>
      </section>
    </div>
  );
}
