import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlightPath, SubrinhoAppIcon, SubrinhoLogo } from "@/components/brand";
import { currentAffiliateUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Painel do Afiliado" };

export default async function AfiliadoLoginPage() {
  if (await currentAffiliateUser()) redirect("/afiliado");

  return (
    <div className="grid min-h-screen bg-cream lg:grid-cols-[1.05fr_1fr]">
      {/* Lado da marca */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand px-6 py-8 text-cream sm:px-10 lg:px-14 lg:py-12">
        <SubrinhoLogo tone="light" size="md" />
        <div className="relative z-10 my-10 max-w-lg lg:my-0">
          <p className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-white">
            Painel do Afiliado
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Viajar é com a gente. A tecnologia também.
          </h1>
          <p className="mt-4 max-w-md text-base text-white/85">
            Acompanhe pedidos, carrinhos e repasses da sua agência, configure suas margens e crie cupons para a sua loja.
          </p>
        </div>
        <FlightPath className="pointer-events-none absolute -right-6 bottom-6 hidden w-80 text-white/25 sm:block lg:w-[28rem]" />
        <p className="relative z-10 hidden text-sm text-white/70 lg:block">© Subrinho — seu sobrinho favorito da tecnologia.</p>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-xl shadow-plum/5 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <SubrinhoAppIcon className="h-11 w-11" />
              <div>
                <h2 className="text-xl font-black tracking-tight text-ink">Entrar no painel</h2>
                <p className="text-sm text-muted">Use o e-mail e a senha da sua agência.</p>
              </div>
            </div>
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            Esqueceu a senha? Peça ao administrador da sua agência ou fale com a equipe <span className="font-bold text-plum">Subrinho</span>.
          </p>
        </div>
      </section>
    </div>
  );
}
