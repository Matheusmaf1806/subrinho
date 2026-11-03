import type { Metadata } from "next";
import { Lock, Users } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { date } from "@/lib/format";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { listAffiliateUsers } from "@/server/admin/affiliates";
import { ROLE_LABEL } from "../../_lib/helpers";
import { createUserAction, setUserActiveAction } from "./actions";
import { NewUserForm, ToggleUserForm } from "./user-forms";

export const metadata: Metadata = { title: "Usuários" };

export default async function AfiliadoUsuariosPage() {
  const { user, affiliate } = await requireAffiliateUser();

  if (user.role !== "ADMIN") {
    return (
      <>
        <PageHeader title="Usuários" />
        <Card>
          <EmptyState
            icon={<Lock className="h-10 w-10" aria-hidden />}
            title="Acesso restrito"
            description="Somente usuários ADMIN da agência podem gerenciar usuários. Fale com o administrador da sua agência."
          />
        </Card>
      </>
    );
  }

  const users = await listAffiliateUsers(db, affiliate.id);

  return (
    <>
      <PageHeader title="Usuários" subtitle={`Equipe da ${affiliate.name} com acesso ao painel e à loja.`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Equipe" subtitle={`${users.length} usuário${users.length === 1 ? "" : "s"}`} />
          {users.length === 0 ? (
            <EmptyState icon={<Users className="h-10 w-10" aria-hidden />} title="Nenhum usuário" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Perfil</Th>
                  <Th>Status</Th>
                  <Th>Desde</Th>
                  <Th>Ações</Th>
                </tr>
              </THead>
              <tbody>
                {users.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <p className="font-semibold text-ink">
                        {u.name} {u.id === user.id && <span className="text-xs font-semibold text-muted">(você)</span>}
                      </p>
                      <p className="break-all text-xs text-muted">{u.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={u.active ? "success" : "danger"}>{u.active ? "Ativo" : "Desativado"}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{date(u.createdAt)}</Td>
                    <Td>{u.id === user.id ? <span className="text-xs text-muted">—</span> : <ToggleUserForm action={setUserActiveAction} userId={u.id} active={u.active} />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Novo usuário" />
            <CardBody>
              <NewUserForm action={createUserAction} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Perfis de acesso" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <Badge tone="brand">Administrador</Badge>
                <p className="mt-1 text-muted">
                  Tudo do agente, mais: alterar margens e cupons, dados da loja e bancários, gerenciar usuários e usar o <strong>modo ADMIN</strong> na
                  loja para mudar margens no checkout.
                </p>
              </div>
              <div>
                <Badge>Agente</Badge>
                <p className="mt-1 text-muted">Monta carrinhos na loja e acompanha pedidos, carrinhos e financeiro. Vê margens e cupons sem alterar.</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
