import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { TotpCard } from "@/components/totp-card";
import { requireSubrinhoUser } from "@/server/auth/session";
import { confirmTotpAction, disableTotpAction, startTotpAction } from "./actions";

export const metadata: Metadata = { title: "Segurança" };

export default async function SecurityPage() {
  const user = await requireSubrinhoUser();
  return (
    <>
      <PageHeader title="Segurança" subtitle="Verificação em duas etapas: além da senha, o login pede o código do app autenticador do seu celular." />
      <TotpCard
        user={user}
        issuer="Subrinho"
        why="Recomendado para toda a equipe: o Painel Subrinho mexe com margens, repasses e fornecedores."
        start={startTotpAction}
        confirm={confirmTotpAction}
        disable={disableTotpAction}
      />
    </>
  );
}
