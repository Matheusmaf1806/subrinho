import { and, desc, eq } from "drizzle-orm";
import { Marked } from "../_components/journal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { Badge, buttonClass, Card, CardBody, CardHeader, EmptyState, Field, Input, statusTone, Table, Td, Th, THead, Tr } from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/ui-client";
import { deleteAccountAction } from "../actions";
import { brl, dateTime, ORDER_STATUS_LABEL, orderNumber } from "@/lib/format";
import { getStore, storeBase, viewerFor } from "../_lib/store";

export const metadata = { title: "Minha conta" };

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const sb = await storeBase(store);
  const viewer = await viewerFor(store);
  if (!viewer) redirect(`${sb}/entrar?next=${sb}/minha-conta`);
  if (viewer.kind !== "CUSTOMER") redirect("/afiliado");
  const list = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, viewer.customer.id), eq(orders.affiliateId, store.id)))
    .orderBy(desc(orders.createdAt));
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-8">
      <h1 data-enter className="display text-[clamp(3rem,7vw,6rem)] text-ink">
        <Marked text={`Olá, ${viewer.customer.name.split(" ")[0]}.`} mark={`${viewer.customer.name.split(" ")[0]}.`} />
      </h1>
      <p className="mt-3 text-[15px] text-muted">{viewer.customer.email}</p>
      <Card className="mt-10">
        <CardHeader title="Meus pedidos" />
        {list.length === 0 ? (
          <EmptyState title="Você ainda não tem pedidos" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </THead>
            <tbody>
              {list.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`${sb}/pedido/${o.id}`} className="font-semibold text-accent-ink hover:underline">
                      {orderNumber(o.number)}
                    </Link>
                  </Td>
                  <Td>{dateTime(o.createdAt)}</Td>
                  <Td>
                    <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                  </Td>
                  <Td className="text-right font-semibold tabular">{brl(o.amountCharged)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Seus dados" subtitle="Privacidade (LGPD): baixe uma cópia dos seus dados ou exclua a sua conta" />
        <CardBody className="flex flex-wrap items-center gap-3">
          <a href={`${sb}/minha-conta/dados`} className={buttonClass("outline", "md")} download>
            Baixar meus dados
          </a>
          <Modal trigger={<span className={buttonClass("ghost", "md")}>Excluir minha conta</span>} title="Excluir minha conta">
            <p className="text-[14px] text-muted">
              Os seus dados pessoais da conta são apagados e você sai da loja. Os pedidos já feitos ficam guardados pelo prazo exigido por lei (veja a{" "}
              <a href={`${sb}/privacidade`} className="underline">
                Política de privacidade
              </a>
              ). Não dá para desfazer.
            </p>
            <ActionForm action={deleteAccountAction.bind(null, slug)} className="mt-4 space-y-3">
              <Field label="Sua senha">
                <Input type="password" name="password" required autoComplete="current-password" />
              </Field>
              <Field label="Digite EXCLUIR para confirmar">
                <Input name="confirm" required autoComplete="off" />
              </Field>
              <SubmitButton variant="danger" pendingText="Excluindo…">
                Excluir conta
              </SubmitButton>
            </ActionForm>
          </Modal>
        </CardBody>
      </Card>
    </main>
  );
}
