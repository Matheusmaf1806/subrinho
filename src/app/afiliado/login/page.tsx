import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { Alert } from "@/components/ui";
import { currentAffiliateUser } from "@/server/auth/session";
import { photo } from "@/lib/images";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Painel do Afiliado" };

export default async function AfiliadoLoginPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  if (await currentAffiliateUser()) redirect("/afiliado");
  const { senha } = await searchParams;
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
          Esqueceu a senha?{" "}
          <Link href="/afiliado/esqueci-senha" className="font-semibold text-ink underline underline-offset-4">
            Crie uma nova pelo e-mail
          </Link>
          .
        </>
      }
    >
      {senha === "nova" && (
        <Alert tone="success" className="mb-4">
          Senha nova salva. Entre com ela e com o código do app.
        </Alert>
      )}
      <LoginForm />
    </AuthSplit>
  );
}
