import type { Category, Currency } from "@/server/db/schema";
import { createEsimMock, createInsuranceMock, ESIMX_PLANS, HERO_PLANS, INTERMAC_PLANS } from "./mock/single-page";
import { createHotelsMock, createHousesMock, HOUSES_MAPRO, HOUSES_MVH } from "./mock/lodging";
import { createTicketsMock, NADIO_CATALOG, TU_EXPERIENZA_CATALOG } from "./mock/tickets";
import { createGgtFromEnv } from "./ggt/adapter";
import { createHotelbedsFromEnv } from "./hotelbeds/adapter";
import { createMaproFromEnv } from "./mapro/adapter";
import { createTueFromEnv } from "./tue/adapter";
import { SupplierError, type SupplierAdapter } from "./types";

/** `ref` = apelido neutro usado nas URLs e formulários da loja (nunca mostrar o nome do fornecedor ao cliente). */
export type SupplierMeta = { code: string; ref: string; name: string; category: Category; defaultCurrency: Currency; notes: string };

/** Fornecedores contratados. Moeda padrão = moeda em que a API do fornecedor devolve o preço. */
export const SUPPLIERS: SupplierMeta[] = [
  { code: "TU_EXPERIENZA", ref: "t1", name: "Tu Experienza", category: "TICKETS", defaultCurrency: "EUR", notes: "Ingressos e experiências na Itália" },
  { code: "NADIO", ref: "t2", name: "Nadio", category: "TICKETS", defaultCurrency: "USD", notes: "Parques e atrações (EUA/Europa)" },
  { code: "GGT_BEST_BUY", ref: "h1", name: "GGT | Best Buy Hotels", category: "LODGING", defaultCurrency: "USD", notes: "Hotéis" },
  { code: "RATEHAWK", ref: "h2", name: "RateHawk", category: "LODGING", defaultCurrency: "BRL", notes: "Hotéis (tarifa em BRL)" },
  { code: "HOTELBEDS", ref: "h3", name: "Hotelbeds", category: "LODGING", defaultCurrency: "EUR", notes: "Hotéis" },
  { code: "MASTER_VACATION_HOME", ref: "c1", name: "Master Vacation Home", category: "HOUSES", defaultCurrency: "USD", notes: "Casas de temporada em Orlando" },
  { code: "MAPRO", ref: "c2", name: "Mapro", category: "HOUSES", defaultCurrency: "USD", notes: "Casas de temporada" },
  { code: "INTERMAC", ref: "s1", name: "Intermac Seguros", category: "INSURANCE", defaultCurrency: "BRL", notes: "Seguro viagem" },
  { code: "HERO", ref: "s2", name: "Hero Seguro", category: "INSURANCE", defaultCurrency: "USD", notes: "Seguro viagem (tarifa em USD)" },
  { code: "ESIMX", ref: "x1", name: "esimx", category: "CHIP", defaultCurrency: "USD", notes: "Chip eSIM internacional" },
];

let adapters: Map<string, SupplierAdapter> | null = null;

/** SUPPLIERS_MODE=mock força o catálogo simulado em tudo (desenvolvimento/testes). */
export function suppliersMode(): "mock" | "auto" {
  return process.env.SUPPLIERS_MODE?.trim().toLowerCase() === "mock" ? "mock" : "auto";
}

function build(): Map<string, SupplierAdapter> {
  // Produção (auto): SOMENTE fornecedores com API real configurada — a loja nunca mostra item
  // simulado. O catálogo simulado existe só com SUPPLIERS_MODE=mock (desenvolvimento e testes).
  // Para integrar outro fornecedor, implemente SupplierAdapter (types.ts) e registre aqui.
  if (suppliersMode() === "auto") {
    const live = [createTueFromEnv(), createGgtFromEnv(), createHotelbedsFromEnv(), createMaproFromEnv()].filter((a): a is NonNullable<typeof a> => !!a);
    return new Map(live.map((a) => [a.code, a as SupplierAdapter]));
  }
  const list: SupplierAdapter[] = [
    createTicketsMock({ code: "TU_EXPERIENZA", name: "Tu Experienza", currency: "EUR", catalog: TU_EXPERIENZA_CATALOG }),
    createTicketsMock({ code: "NADIO", name: "Nadio", currency: "USD", catalog: NADIO_CATALOG }),
    createHotelsMock({ code: "GGT_BEST_BUY", name: "GGT | Best Buy Hotels", currency: "USD" }),
    createHotelsMock({ code: "RATEHAWK", name: "RateHawk", currency: "BRL" }),
    createHotelsMock({ code: "HOTELBEDS", name: "Hotelbeds", currency: "EUR" }),
    createHousesMock({ code: "MASTER_VACATION_HOME", name: "Master Vacation Home", currency: "USD", catalog: HOUSES_MVH }),
    createHousesMock({ code: "MAPRO", name: "Mapro", currency: "USD", catalog: HOUSES_MAPRO }),
    createInsuranceMock({ code: "INTERMAC", name: "Intermac Seguros", currency: "BRL", plans: INTERMAC_PLANS.map((p) => ({ ...p })) }),
    createInsuranceMock({ code: "HERO", name: "Hero Seguro", currency: "USD", plans: HERO_PLANS }),
    createEsimMock({ code: "ESIMX", name: "esimx", currency: "USD" }),
  ];
  void ESIMX_PLANS;
  return new Map(list.map((a) => [a.code, a]));
}

/** Somente testes: refaz o registro (ex.: depois de mudar variáveis de ambiente). */
export function resetAdapters() {
  adapters = null;
}

export function isLiveSupplier(code: string): boolean {
  adapters ??= build();
  return adapters.get(code)?.live === true;
}

/** Situação de cada fornecedor (Painel Subrinho / diagnóstico). */
export function supplierModes(): { code: string; name: string; category: Category; mode: "live" | "mock" | "hidden" }[] {
  adapters ??= build();
  return SUPPLIERS.map((s) => {
    const a = adapters!.get(s.code);
    return { code: s.code, name: s.name, category: s.category, mode: !a ? "hidden" : a.live ? "live" : "mock" };
  });
}

export function allAdapters(): SupplierAdapter[] {
  adapters ??= build();
  return [...adapters.values()];
}

export function getAdapter(code: string): SupplierAdapter {
  adapters ??= build();
  const a = adapters.get(code);
  if (!a) {
    // Fornecedor conhecido mas sem API real configurada (fora da loja).
    if (SUPPLIERS.some((s) => s.code === code)) throw new SupplierError("Este fornecedor não está disponível no momento");
    throw new Error(`Fornecedor desconhecido: ${code}`);
  }
  return a;
}

export function adaptersFor(category: Category, activeCodes?: Set<string>): SupplierAdapter[] {
  return allAdapters().filter((a) => a.category === category && (!activeCodes || activeCodes.has(a.code)));
}
