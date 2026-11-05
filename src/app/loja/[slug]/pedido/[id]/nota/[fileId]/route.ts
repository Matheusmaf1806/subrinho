import { and, eq, or } from "drizzle-orm";
import { db } from "@/server/db";
import { files, invoices, orders } from "@/server/db/schema";
import { validOrderAccessKey } from "@/server/order-access";
import { getStore, viewerFor } from "../../../../_lib/store";

export const dynamic = "force-dynamic";

/** Nota fiscal do pedido (PDF/XML) para o cliente: logado na conta do pedido ou com o link do e-mail. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string; fileId: string }> }) {
  const { slug, id, fileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Não encontrado", { status: 404 });
  const store = await getStore(slug);
  const k = new URL(req.url).searchParams.get("k");
  const viewer = await viewerFor(store);
  const [o] = await db.select({ customerId: orders.customerId }).from(orders).where(and(eq(orders.id, id), eq(orders.affiliateId, store.id)));
  const allowed = !!o && (validOrderAccessKey(id, k) || (viewer?.kind === "CUSTOMER" && o.customerId === viewer.customer.id) || viewer?.kind === "AFFILIATE");
  if (!allowed) return new Response("Não encontrado", { status: 404 });
  const [inv] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.orderId, id), eq(invoices.kind, "ORDER"), eq(invoices.status, "ISSUED"), or(eq(invoices.fileId, fileId), eq(invoices.xmlFileId, fileId))));
  if (!inv) return new Response("Não encontrado", { status: 404 });
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  if (!f) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(f.size),
      "Content-Disposition": `inline; filename="${f.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
