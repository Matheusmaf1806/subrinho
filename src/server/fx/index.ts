/**
 * Câmbio. A cotação vem de um provedor externo (ex.: "Dólar Poolvo") e é gravada em fx_rates.
 * O preço SEMPRE usa a cotação mais recente gravada; o pedido congela a cotação usada.
 */
import { desc, eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { fxRates, type Currency } from "@/server/db/schema";
import type { FxTable } from "@/server/pricing/cart-pricing";

export const FOREIGN_CURRENCIES: Exclude<Currency, "BRL">[] = ["USD", "EUR"];

export type FxQuote = { currency: Exclude<Currency, "BRL">; rate: string };

export interface FxProvider {
  name: string;
  fetch(): Promise<FxQuote[]>;
}

/** AwesomeAPI (pública) — útil como referência/fallback. */
export const awesomeApiProvider: FxProvider = {
  name: "awesomeapi",
  async fetch() {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL", { cache: "no-store" });
    if (!res.ok) throw new Error(`AwesomeAPI respondeu ${res.status}`);
    const json = (await res.json()) as Record<string, { ask: string }>;
    return [
      { currency: "USD", rate: json.USDBRL.ask },
      { currency: "EUR", rate: json.EURBRL.ask },
    ];
  },
};

/**
 * Dólar Poolvo — preencher com o contrato da API (URL/token em FX_POOLVO_URL / FX_POOLVO_TOKEN).
 * Espera-se uma resposta com as cotações USD→BRL e EUR→BRL.
 */
export const poolvoProvider: FxProvider = {
  name: "poolvo",
  async fetch() {
    const url = process.env.FX_POOLVO_URL;
    if (!url) throw new Error("FX_POOLVO_URL não configurada");
    const res = await fetch(url, {
      headers: process.env.FX_POOLVO_TOKEN ? { Authorization: `Bearer ${process.env.FX_POOLVO_TOKEN}` } : {},
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Poolvo respondeu ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    // TODO: ajustar ao formato real da API Poolvo.
    const pick = (k: string) => String((json[k] as { rate?: unknown })?.rate ?? json[k]);
    return [
      { currency: "USD", rate: pick("USD") },
      { currency: "EUR", rate: pick("EUR") },
    ];
  },
};

export function configuredFxProvider(): FxProvider | null {
  switch (process.env.FX_PROVIDER) {
    case "awesomeapi":
      return awesomeApiProvider;
    case "poolvo":
      return poolvoProvider;
    default:
      return null; // manual
  }
}

export async function getCurrentFx(tx: Tx): Promise<FxTable> {
  const out: FxTable = {};
  for (const c of FOREIGN_CURRENCIES) {
    const [row] = await tx.select().from(fxRates).where(eq(fxRates.currency, c)).orderBy(desc(fxRates.fetchedAt)).limit(1);
    if (row) out[c] = { rate: row.rate, source: row.source, fetchedAt: row.fetchedAt.toISOString() };
  }
  return out;
}

export async function recordFxRate(tx: Tx, q: FxQuote & { source: string; createdBy?: string | null }) {
  const rate = Number(q.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Cotação inválida para ${q.currency}`);
  await tx.insert(fxRates).values({ currency: q.currency, rate: rate.toFixed(6), source: q.source, createdBy: q.createdBy ?? null });
}

export async function refreshFxFromProvider(tx: Tx, provider = configuredFxProvider()) {
  if (!provider) return { updated: 0, provider: "manual" };
  const quotes = await provider.fetch();
  for (const q of quotes) await recordFxRate(tx, { ...q, source: provider.name });
  return { updated: quotes.length, provider: provider.name };
}

export async function fxHistory(tx: Tx, limit = 50) {
  return tx.select().from(fxRates).orderBy(desc(fxRates.fetchedAt)).limit(limit);
}
