import type { LegalStore } from "@/lib/legal";
import type { affiliates } from "@/server/db/schema";

export function legalStore(a: typeof affiliates.$inferSelect): LegalStore {
  return {
    name: a.name,
    legalName: a.legalName,
    document: a.document,
    address: a.address,
    cadastur: a.cadastur,
    email: a.email,
    phone: a.phone,
    whatsapp: a.whatsapp,
    policyNotes: a.policyNotes,
    hasTracking: !!(a.metaPixelId || a.ga4Id),
  };
}
