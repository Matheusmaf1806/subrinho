import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { files, payoutProofs, payouts } from "@/server/db/schema";
import { currentAffiliateUser, currentSubrinhoUser } from "@/server/auth/session";

/** Download de arquivos (comprovantes de repasse). Subrinho vê todos; afiliado só os seus. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Não encontrado", { status: 404 });

  const staff = await currentSubrinhoUser();
  if (!staff) {
    const aff = await currentAffiliateUser();
    if (!aff) return new Response("Não autorizado", { status: 401 });
    const [own] = await db
      .select({ id: payoutProofs.id })
      .from(payoutProofs)
      .innerJoin(payouts, eq(payouts.id, payoutProofs.payoutId))
      .where(and(eq(payoutProofs.fileId, id), eq(payouts.affiliateId, aff.affiliate.id)));
    if (!own) return new Response("Não encontrado", { status: 404 });
  }

  const [f] = await db.select().from(files).where(eq(files.id, id));
  if (!f) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(f.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
