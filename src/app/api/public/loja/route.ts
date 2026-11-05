/**
 * Qual loja este endereço serve? Usado para verificar o domínio próprio de uma agência: o painel pede
 * https://<domínio>/api/public/loja e confere o id. Público e sem dados sensíveis (só id e nome).
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { classifyHost, domainConfig } from "@/lib/store-domains";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const kind = classifyHost(request.headers.get("host"), domainConfig());
  if (kind.kind === "platform") return Response.json({ error: "endereço da plataforma" }, { status: 404 });
  const where = kind.kind === "custom" ? eq(affiliates.customDomain, kind.host) : eq(affiliates.subdomain, kind.subdomain);
  const [a] = await db.select({ id: affiliates.id, name: affiliates.name, active: affiliates.active }).from(affiliates).where(where);
  if (!a || !a.active) return Response.json({ error: "loja não encontrada" }, { status: 404 });
  return Response.json({ id: a.id, name: a.name }, { headers: { "Cache-Control": "no-store" } });
}
