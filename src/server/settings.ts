import { eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { settings } from "@/server/db/schema";

export type PlatformSettings = {
  /** Taxa embutida no parcelado (ex.: 9,68%). */
  installmentFeePct: string;
  /** Nº máximo de parcelas sem juros. */
  maxInstallments: number;
  /** Margem Subrinho usada quando não existe nenhuma regra cadastrada. */
  fallbackSubrinhoMarginPct: string;
  /** Margem do afiliado usada quando o afiliado não configurou nenhuma regra. */
  fallbackAffiliateMarginPct: string;
  /** Margem máxima que o afiliado pode configurar/alterar no checkout. */
  maxAffiliateMarginPct: string;
  /** Dias úteis para o repasse após o fechamento da quinzena. */
  payoutBusinessDays: number;
  /** Validade da cobrança Pix (minutos). */
  pixExpirationMinutes: number;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  installmentFeePct: "9.68",
  maxInstallments: 10,
  fallbackSubrinhoMarginPct: "4.5",
  fallbackAffiliateMarginPct: "3.7",
  maxAffiliateMarginPct: "60",
  payoutBusinessDays: 5,
  pixExpirationMinutes: 30,
};

export async function getSettings(tx: Tx): Promise<PlatformSettings> {
  const rows = await tx.select().from(settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  // Garante os tipos (o jsonb pode devolver "9.68" como número).
  return {
    installmentFeePct: String(out.installmentFeePct),
    maxInstallments: Number(out.maxInstallments),
    fallbackSubrinhoMarginPct: String(out.fallbackSubrinhoMarginPct),
    fallbackAffiliateMarginPct: String(out.fallbackAffiliateMarginPct),
    maxAffiliateMarginPct: String(out.maxAffiliateMarginPct),
    payoutBusinessDays: Number(out.payoutBusinessDays),
    pixExpirationMinutes: Number(out.pixExpirationMinutes),
  };
}

export async function updateSettings(tx: Tx, patch: Partial<PlatformSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    const existing = await tx.select().from(settings).where(eq(settings.key, key));
    if (existing.length) {
      await tx.update(settings).set({ value: value as never, updatedAt: new Date() }).where(eq(settings.key, key));
    } else {
      await tx.insert(settings).values({ key, value: value as never });
    }
  }
}
