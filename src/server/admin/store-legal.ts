/** Dados legais e IDs de rastreamento da loja (validação + gravação + histórico). */
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { changes, recordAudit, type AuditActor } from "@/server/audit";

export class StoreLegalError extends Error {}

export type StoreLegalInput = { address: string; cadastur: string; policyNotes: string; metaPixelId: string; ga4Id: string };

export function parseStoreLegal(fd: FormData): { address: string | null; cadastur: string | null; policyNotes: string | null; metaPixelId: string | null; ga4Id: string | null } {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const metaPixelId = s("metaPixelId").replace(/\s/g, "");
  const ga4Id = s("ga4Id").toUpperCase().replace(/\s/g, "");
  if (metaPixelId && !/^\d{8,20}$/.test(metaPixelId)) throw new StoreLegalError("ID do Pixel da Meta inválido: use só os números (ex.: 123456789012345)");
  if (ga4Id && !/^G-[A-Z0-9]{4,16}$/.test(ga4Id)) throw new StoreLegalError("ID do Google Analytics 4 inválido: começa com G- (ex.: G-AB12CD34EF)");
  return {
    address: s("address").slice(0, 300) || null,
    cadastur: s("cadastur").slice(0, 40) || null,
    policyNotes: s("policyNotes").slice(0, 2000) || null,
    metaPixelId: metaPixelId || null,
    ga4Id: ga4Id || null,
  };
}

export async function updateStoreLegal(db: DB, affiliateId: string, v: ReturnType<typeof parseStoreLegal>, actor: AuditActor) {
  const [before] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId));
  if (!before) throw new StoreLegalError("Loja não encontrada");
  const [after] = await db.update(affiliates).set(v).where(eq(affiliates.id, affiliateId)).returning();
  const diff = changes(before, v, ["address", "cadastur", "policyNotes", "metaPixelId", "ga4Id"]);
  if (Object.keys(diff).length)
    await recordAudit(db, { actor, affiliateId, action: "store.legal", entity: "affiliate", entityId: affiliateId, summary: `Alterou dados legais/rastreamento da loja: ${Object.keys(diff).join(", ")}`, data: diff });
  return after;
}
