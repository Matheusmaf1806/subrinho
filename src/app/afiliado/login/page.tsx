import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { currentAffiliateUser } from "@/server/auth/session";
import { photo } from "@/lib/images";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Painel do Afiliado" };

export default async function AfiliadoLoginPage() {
  if (await currentAffiliateUser()) redirect("/afiliado");
  return (
    <AuthSplit
      label="Painel do Afiliado"
      title="Que bom te ver."
      description="Pedidos, carrinhos, margens, cupons e repasses da sua agência."
      image={photo("heroWoman", 1400, 1700)}
      blockTitle={
        <>
          Viaje mais.
          <br />
          Venda mais.
        </>
      }
      footnote={
        <>
          Esqueceu a senha? Peça ao administrador da sua agência ou fale com a equipe <span className="font-semibold text-ink">Subrinho</span>.
        </>
      }
    >
      <LoginForm />
    </AuthSplit>
  );
}
