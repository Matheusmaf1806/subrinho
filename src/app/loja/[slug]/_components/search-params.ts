import { addDays, todayLocal } from "@/lib/tz";
import type { SearchParams } from "@/server/suppliers/types";
import type { SearchDefaults } from "./search-forms";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const n = (v: string | undefined, def: number, min = 0, max = 20) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.floor(x))) : def;
};

/** Normaliza os parâmetros de busca da URL com padrões sensatos (datas futuras). */
export function parseSearch(raw: Raw) {
  const today = todayLocal();
  const minDate = addDays(today, 1);
  const g = (k: string) => one(raw[k]);
  const future = (v: string | undefined, def: string) => (isDate(v) && v! >= minDate ? v! : def);
  const checkin = future(g("checkin"), addDays(today, 45));
  const checkoutRaw = g("checkout");
  // estadias de até 30 noites (limite dos fornecedores de hotel)
  const checkout = isDate(checkoutRaw) && checkoutRaw! > checkin && checkoutRaw! <= addDays(checkin, 30) ? checkoutRaw! : addDays(checkin, 5);
  const ida = future(g("ida"), addDays(today, 30));
  const voltaRaw = g("volta");
  const volta = isDate(voltaRaw) && voltaRaw! >= ida ? voltaRaw! : addDays(ida, 9);
  const criancas = n(g("criancas"), 0, 0, 8);
  // idades das crianças ("7,10"); faltando alguma → considera 8 anos só para não quebrar a busca
  const idadesRaw = (g("idades") ?? "").split(",").map((x) => x.trim());
  const idades = Array.from({ length: criancas }, (_, i) => {
    const a = Number(idadesRaw[i]);
    return idadesRaw[i] !== "" && idadesRaw[i] !== undefined && Number.isInteger(a) && a >= 0 && a <= 17 ? a : 8;
  });
  const quartos = n(g("quartos"), 1, 1, 5);
  const d: Required<SearchDefaults> = {
    destino: g("destino")?.trim().slice(0, 120) ?? "",
    dest: /^(p|d):[A-Za-z0-9:\- ]{1,80}$/.test(g("dest") ?? "") ? g("dest")! : "",
    idades,
    data: future(g("data"), addDays(today, 30)),
    checkin,
    checkout,
    ida,
    volta,
    adultos: Math.max(n(g("adultos"), 2, 0, 20), quartos),
    criancas,
    quartos,
    seniores: n(g("seniores"), 0, 0, 10),
    qtd: n(g("qtd"), 1, 1, 20),
    dias: n(g("dias"), 0, 0, 180),
  };
  return { d, minDate };
}

export function toQuery(d: Partial<SearchDefaults>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return p.toString();
}

/** Parâmetros de hospedagem que acompanham os links (listagem → hotel → voltar). */
export function lodgingQuery(d: Required<SearchDefaults>, extra: Partial<SearchDefaults> = {}): string {
  return toQuery({ destino: d.destino, dest: d.dest, checkin: d.checkin, checkout: d.checkout, quartos: d.quartos, adultos: d.adultos, criancas: d.criancas, idades: d.criancas ? d.idades : [], ...extra });
}

export function supplierParams(d: Required<SearchDefaults>, kind: "tickets" | "lodging" | "houses" | "insurance" | "chip"): SearchParams {
  switch (kind) {
    case "tickets":
      return { destination: d.destino || undefined, date: d.data, pax: { adults: d.adultos, children: d.criancas } };
    case "lodging":
      return {
        destination: d.destino || undefined,
        destinationKey: d.dest || undefined,
        checkIn: d.checkin,
        checkOut: d.checkout,
        pax: { adults: Math.max(1, d.adultos, d.quartos), children: d.criancas, rooms: d.quartos, ...(d.criancas ? { childrenAges: d.idades } : {}) },
      };
    case "houses":
      return { destination: d.destino || undefined, checkIn: d.checkin, checkOut: d.checkout, pax: { adults: Math.max(1, d.adultos), children: d.criancas } };
    case "insurance":
      return { destination: d.destino || "Europa", startDate: d.ida, endDate: d.volta, pax: { adults: d.adultos, children: 0, seniors: d.seniores } };
    case "chip":
      return { destination: d.destino || undefined, pax: { adults: 0, children: 0, units: d.qtd } };
  }
}
