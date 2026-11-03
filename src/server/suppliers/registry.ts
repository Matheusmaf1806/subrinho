import type { Category, Currency } from "@/server/db/schema";
import { createEsimMock, createInsuranceMock, ESIMX_PLANS, HERO_PLANS, INTERMAC_PLANS } from "./mock/single-page";
import { createHotelsMock, createHousesMock, HOUSES_MAPRO, HOUSES_MVH } from "./mock/lodging";
import { createTicketsMock, NADIO_CATALOG, TU_EXPERIENZA_CATALOG } from "./mock/tickets";
import type { SupplierAdapter } from "./types";

export type SupplierMeta = { code: string; name: string; category: Category; defaultCurrency: Currency; notes: string };

/** Fornecedores contratados. Moeda padrão = moeda em que a API do fornecedor devolve o preço. */
export const SUPPLIERS: SupplierMeta[] = [
  { code: "TU_EXPERIENZA", name: "Tu Experienza", category: "TICKETS", defaultCurrency: "EUR", notes: "Ingressos e experiências na Itália" },
  { code: "NADIO", name: "Nadio", category: "TICKETS", defaultCurrency: "USD", notes: "Parques e atrações (EUA/Europa)" },
  { code: "GGT_BEST_BUY", name: "GGT | Best Buy Hotels", category: "LODGING", defaultCurrency: "USD", notes: "Hotéis" },
  { code: "RATEHAWK", name: "RateHawk", category: "LODGING", defaultCurrency: "BRL", notes: "Hotéis (tarifa em BRL)" },
  { code: "HOTELBEDS", name: "Hotelbeds", category: "LODGING", defaultCurrency: "EUR", notes: "Hotéis" },
  { code: "MASTER_VACATION_HOME", name: "Master Vacation Home", category: "HOUSES", defaultCurrency: "USD", notes: "Casas de temporada em Orlando" },
  { code: "MAPRO", name: "Mapro", category: "HOUSES", defaultCurrency: "USD", notes: "Casas de temporada" },
  { code: "INTERMAC", name: "Intermac Seguros", category: "INSURANCE", defaultCurrency: "BRL", notes: "Seguro viagem" },
  { code: "HERO", name: "Hero Seguro", category: "INSURANCE", defaultCurrency: "USD", notes: "Seguro viagem (tarifa em USD)" },
  { code: "ESIMX", name: "esimx", category: "CHIP", defaultCurrency: "USD", notes: "Chip eSIM internacional" },
];

let adapters: Map<string, SupplierAdapter> | null = null;

function build(): Map<string, SupplierAdapter> {
  // SUPPLIERS_MODE=mock → catálogo simulado. Para integrar a API real de um fornecedor,
  // implemente SupplierAdapter (src/server/suppliers/types.ts) e registre aqui.
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

export function allAdapters(): SupplierAdapter[] {
  adapters ??= build();
  return [...adapters.values()];
}

export function getAdapter(code: string): SupplierAdapter {
  adapters ??= build();
  const a = adapters.get(code);
  if (!a) throw new Error(`Fornecedor desconhecido: ${code}`);
  return a;
}

export function adaptersFor(category: Category, activeCodes?: Set<string>): SupplierAdapter[] {
  return allAdapters().filter((a) => a.category === category && (!activeCodes || activeCodes.has(a.code)));
}
