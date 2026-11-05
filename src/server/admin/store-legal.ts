/** Dados legais e IDs de rastreamento da loja (validação + gravação + histórico). */
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { changes, recordAudit, type AuditActor } from "@/server/audit";
import { sealSecret } from "@/server/auth/totp";

export class StoreLegalError extends Error {}

type LegalPatch = { address: string | null; cadastur: string | null; policyNotes: string | null; metaPixelId: string | null; ga4Id: string | null; metaTestEventCode: string | null; metaCapiToken?: string | null };

export function parseStoreLegal(fd: FormData): LegalPatch {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const metaPixelId = s("metaPixelId").replace(/\s/g, "");
  const ga4Id = s("ga4Id").toUpperCase().replace(/\s/g, "");
  if (metaPixelId && !/^\d{8,20}$/.test(metaPixelId)) throw new StoreLegalError("ID do Pixel da Meta inválido: use só os números (ex.: 123456789012345)");
  if (ga4Id && !/^G-[A-Z0-9]{4,16}$/.test(ga4Id)) throw new StoreLegalError("ID do Google Analytics 4 inválido: começa com G- (ex.: G-AB12CD34EF)");
  const token = s("metaCapiToken").replace(/\s/g, "");
  if (token && !/^[A-Za-z0-9_-]{20,600}$/.test(token)) throw new StoreLegalError("Token da API de conversões inválido: copie o token inteiro gerado no Gerenciador de Eventos");
  const testCode = s("metaTestEventCode").toUpperCase().replace(/\s/g, "");
  if (testCode && !/^TEST\d{1,12}$/.test(testCode)) throw new StoreLegalError("Código de teste inválido: começa com TEST (ex.: TEST12345)");
  return {
    address: s("address").slice(0, 300) || null,
    cadastur: s("cadastur").slice(0, 40) || null,
    policyNotes: s("policyNotes").slice(0, 2000) || null,
    metaPixelId: metaPixelId || null,
    ga4Id: ga4Id || null,
    metaTestEventCode: testCode || null,
    // vazio = mantém o token salvo; "remover" apaga; novo token é cifrado antes de gravar
    ...(fd.get("removeMetaToken") === "on" ? { metaCapiToken: null } : token ? { metaCapiToken: sealSecret(token) } : {}),
  };
}

export async function updateStoreLegal(db: DB, affiliateId: string, v: LegalPatch, actor: AuditActor) {
  const [before] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId));
  if (!before) throw new StoreLegalError("Loja não encontrada");
  const [after] = await db.update(affiliates).set(v).where(eq(affiliates.id, affiliateId)).returning();
  const diff: Record<string, unknown> = changes(before, v, ["address", "cadastur", "policyNotes", "metaPixelId", "ga4Id", "metaTestEventCode"]);
  if ("metaCapiToken" in v) diff.tokenApiConversoes = { de: before.metaCapiToken ? "configurado" : "vazio", para: v.metaCapiToken ? "novo token" : "removido" };
  if (Object.keys(diff).length)
    await recordAudit(db, { actor, affiliateId, action: "store.legal", entity: "affiliate", entityId: affiliateId, summary: `Alterou dados legais/rastreamento da loja: ${Object.keys(diff).join(", ")}`, data: diff });
  return after;
}
