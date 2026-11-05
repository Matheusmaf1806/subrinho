import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { TotpCard } from "@/components/totp-card";
import { requireAffiliateUser } from "@/server/auth/session";
import { confirmAffiliateTotpAction, disableAffiliateTotpAction, startAffiliateTotpAction } from "./actions";

export const metadata: Metadata = { title: "Segurança" };

export default async function AfiliadoSecurityPage() {
  const { user } = await requireAffiliateUser();
  return (
    <>
      <PageHeader title="Segurança" subtitle="Verificação em duas etapas: além da senha, o login pede o código do app autenticador do seu celular." />
      <TotpCard
        user={user}
        issuer="Subrinho Afiliado"
        why="Recomendado: o painel tem os dados bancários do repasse, as margens e os pedidos dos seus clientes."
        start={startAffiliateTotpAction}
        confirm={confirmAffiliateTotpAction}
        disable={disableAffiliateTotpAction}
      />
    </>
  );
}
