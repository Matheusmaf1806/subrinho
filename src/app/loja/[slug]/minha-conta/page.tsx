import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { Badge, Card, CardHeader, EmptyState, statusTone, Table, Td, Th, THead, Tr } from "@/components/ui";
import { brl, dateTime, ORDER_STATUS_LABEL, orderNumber } from "@/lib/format";
import { getStore, viewerFor } from "../_lib/store";

export const metadata = { title: "Minha conta" };

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const viewer = await viewerFor(store);
  if (!viewer) redirect(`/loja/${slug}/entrar?next=/loja/${slug}/minha-conta`);
  if (viewer.kind !== "CUSTOMER") redirect("/afiliado");
  const list = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, viewer.customer.id), eq(orders.affiliateId, store.id)))
    .orderBy(desc(orders.createdAt));
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-ink">Olá, {viewer.customer.name.split(" ")[0]}!</h1>
      <p className="mt-1 text-muted">{viewer.customer.email}</p>
      <Card className="mt-6">
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
                    <Link href={`/loja/${slug}/pedido/${o.id}`} className="font-bold text-accent hover:underline">
                      {orderNumber(o.number)}
                    </Link>
                  </Td>
                  <Td>{dateTime(o.createdAt)}</Td>
                  <Td>
                    <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                  </Td>
                  <Td className="text-right font-bold tabular">{brl(o.amountCharged)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </main>
  );
}
