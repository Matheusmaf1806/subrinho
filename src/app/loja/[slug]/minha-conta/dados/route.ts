import { db } from "@/server/db";
import { exportCustomerData } from "@/server/customer-data";
import { getStore, viewerFor } from "../../_lib/store";

export const dynamic = "force-dynamic";

/** Cópia dos dados do cliente logado (LGPD, portabilidade), em JSON. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const store = await getStore((await params).slug);
  const viewer = await viewerFor(store);
  if (!viewer || viewer.kind !== "CUSTOMER") return Response.json({ error: "Entre na sua conta" }, { status: 401 });
  const data = await exportCustomerData(db, viewer.customer.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-${store.slug}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
