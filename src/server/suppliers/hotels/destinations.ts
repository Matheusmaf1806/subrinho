/**
 * Destinos de hotel: lista de cidades de cada fornecedor (sincronizada da API), sugestões para o
 * campo "Destino" da loja e resolução do que o cliente escolheu/digitou nos códigos de cada fornecedor.
 *
 * Um destino da loja é identificado por uma chave:
 *   - "p:<id>"         → destino popular curado (popular.ts), com nome em português;
 *   - "d:<PAÍS>:<key>" → cidade/área com o mesmo nome normalizado no mesmo país (une os fornecedores).
 */
import { and, count, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { hotelDestinations } from "@/server/db/schema";
import { normalizeText, titleCase } from "./common";
import { POPULAR_DESTINATIONS, type PopularDestination } from "./popular";

export type DestinationRow = {
  supplierCode: string;
  code: string;
  name: string;
  city: string;
  region: string | null;
  countryCode: string | null;
  countryName: string | null;
  searchKey: string;
};

export type DestinationSuggestion = {
  key: string;
  label: string;
  detail: string;
  suppliers: string[];
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryPt(code: string | null | undefined, fallback?: string | null): string {
  if (code && /^[A-Z]{2}$/.test(code)) {
    try {
      const n = regionNames?.of(code);
      if (n && n !== code) return n;
    } catch {
      /* código desconhecido */
    }
  }
  return fallback ? titleCase(fallback) : (code ?? "");
}

/** Chave de busca a partir do nome do fornecedor: sem estado entre parênteses, sem "area"/"all locations". */
export function searchKeyOf(name: string): string {
  let n = name.replace(/\([^)]*\)/g, " ");
  n = normalizeText(n)
    .replace(/\ball locations\b/g, " ")
    .replace(/\b(area|region|surroundings|and surroundings)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n.replace(/\s+(area|region)$/, "").trim();
}

/** "ORLANDO (FL)" → { city: "Orlando", region: "FL" }; "Orlando Area - Florida - FL" → { city: "Orlando Area", region: "FL" }. */
export function parseCityName(raw: string, style: "GGT" | "HOTELBEDS"): { city: string; region: string | null; searchKey: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (style === "HOTELBEDS") {
    const parts = name.split(/\s+-\s+/);
    const city = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : null;
    const region = last && /^[A-Z]{2,3}$/.test(last) ? last : (parts[1] ?? null);
    // "Cancun (and vicinity)" → "Cancun"
    const display = city.replace(/\s*\((and )?(vicinity|surroundings|area)\)\s*$/i, "").trim() || city;
    return { city: titleCase(display), region, searchKey: searchKeyOf(city) };
  }
  const paren = name.match(/\(([^)]*)\)\s*$/);
  const city = name.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*-\s*ALL LOCATIONS\s*$/i, "");
  return { city: titleCase(city), region: paren ? paren[1].trim() : null, searchKey: searchKeyOf(name) };
}

// ───────────────────────── Sincronização ─────────────────────────

/** Grava a lista completa de destinos de um fornecedor (upsert + remove os que saíram da lista). */
export async function saveSupplierDestinations(supplierCode: string, rows: DestinationRow[]): Promise<number> {
  if (!rows.length) throw new Error(`O fornecedor ${supplierCode} não retornou destinos — nada foi alterado`);
  const db = getDb();
  const unique = [...new Map(rows.map((r) => [r.code, r])).values()];
  const now = new Date();
  for (let i = 0; i < unique.length; i += 1500) {
    const chunk = unique.slice(i, i + 1500).map((r) => ({ ...r, supplierCode, updatedAt: now }));
    await db
      .insert(hotelDestinations)
      .values(chunk)
      .onConflictDoUpdate({
        target: [hotelDestinations.supplierCode, hotelDestinations.code],
        set: {
          name: sql`excluded.name`,
          city: sql`excluded.city`,
          region: sql`excluded.region`,
          countryCode: sql`excluded.country_code`,
          countryName: sql`excluded.country_name`,
          searchKey: sql`excluded.search_key`,
          updatedAt: now,
        },
      });
  }
  // Remove o que não veio mais (só depois de gravar tudo).
  await db.delete(hotelDestinations).where(and(eq(hotelDestinations.supplierCode, supplierCode), sql`${hotelDestinations.updatedAt} < ${now}`));
  return unique.length;
}

export async function destinationCount(supplierCode: string): Promise<number> {
  const [r] = await getDb().select({ n: count() }).from(hotelDestinations).where(eq(hotelDestinations.supplierCode, supplierCode));
  return Number(r?.n ?? 0);
}

// ───────────────────────── Sugestões ─────────────────────────

function popularMatches(q: string): PopularDestination[] {
  if (!q) return [];
  return POPULAR_DESTINATIONS.filter((p) => {
    const names = [p.label, ...(p.aliases ?? []), ...p.keys].map(normalizeText);
    return names.some((n) => n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q) && q.length >= 3));
  });
}

function popularSuggestion(p: PopularDestination): DestinationSuggestion {
  return { key: `p:${p.id}`, label: p.label, detail: countryPt(p.country), suppliers: [] };
}

/** Sugestões para o campo Destino (populares primeiro, depois cidades dos fornecedores). */
export async function suggestDestinations(query: string, limit = 8): Promise<DestinationSuggestion[]> {
  const q = normalizeText(query);
  if (q.length < 2) return POPULAR_DESTINATIONS.slice(0, limit).map(popularSuggestion);
  const popular = popularMatches(q).slice(0, limit).map(popularSuggestion);
  let rows: DestinationRow[] = [];
  try {
    rows = await getDb()
      .select({
        supplierCode: hotelDestinations.supplierCode,
        code: hotelDestinations.code,
        name: hotelDestinations.name,
        city: hotelDestinations.city,
        region: hotelDestinations.region,
        countryCode: hotelDestinations.countryCode,
        countryName: hotelDestinations.countryName,
        searchKey: hotelDestinations.searchKey,
      })
      .from(hotelDestinations)
      .where(or(like(hotelDestinations.searchKey, `${q}%`), like(hotelDestinations.searchKey, `% ${q}%`)))
      .limit(500);
  } catch {
    rows = [];
  }
  const groups = groupRows(rows);
  const popularKeys = new Set(
    popularMatches(q)
      .slice(0, limit)
      .flatMap((p) => p.keys.map((k) => `${p.country}:${k}`)),
  );
  const ranked = [...groups.values()]
    .filter((g) => !popularKeys.has(`${g.country}:${g.searchKey}`))
    .map((g) => ({ g, score: (g.searchKey === q ? 0 : g.searchKey.startsWith(q) ? 10 : 20) - g.suppliers.size * 3 + Math.min(g.searchKey.length, 40) / 10 + (/\bairport\b/.test(g.searchKey) ? 15 : 0) }))
    .sort((a, b) => a.score - b.score)
    .map(({ g }) => ({
      key: `d:${g.country}:${g.searchKey}`,
      label: g.label,
      detail: [g.region && g.region.length <= 3 ? g.region : null, countryPt(g.country, g.countryName)].filter(Boolean).join(" · "),
      suppliers: [...g.suppliers],
    }));
  return [...popular, ...ranked].slice(0, limit);
}

type Group = { country: string; countryName: string | null; searchKey: string; label: string; region: string | null; suppliers: Set<string> };

function groupRows(rows: DestinationRow[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const country = r.countryCode ?? "";
    const k = `${country}:${r.searchKey}`;
    const g = groups.get(k);
    if (g) {
      g.suppliers.add(r.supplierCode);
      // Prefere o nome da Hotelbeds (já vem capitalizado) e o mais curto.
      if (r.supplierCode === "HOTELBEDS" && g.label === g.label.toUpperCase()) g.label = r.city;
      if (!g.region && r.region) g.region = r.region;
    } else groups.set(k, { country, countryName: r.countryName, searchKey: r.searchKey, label: r.city, region: r.region, suppliers: new Set([r.supplierCode]) });
  }
  return groups;
}

// ───────────────────────── Resolução ─────────────────────────

export type ResolvedDestination = { key: string; label: string; country: string | null; keys: string[]; regions?: string[]; extra: Record<string, string[]> };

/** Converte a chave escolhida (ou o texto digitado) no destino a pesquisar. */
export async function resolveDestination(text: string | undefined, key?: string | undefined): Promise<ResolvedDestination | null> {
  if (key?.startsWith("p:")) {
    const p = POPULAR_DESTINATIONS.find((x) => x.id === key.slice(2));
    if (p) return fromPopular(p);
  }
  if (key?.startsWith("d:")) {
    const [, country, ...rest] = key.split(":");
    const searchKey = rest.join(":");
    if (searchKey) return { key, label: text?.trim() || titleCase(searchKey), country: country || null, keys: [searchKey], extra: {} };
  }
  const raw = (text ?? "").split(",")[0];
  const q = normalizeText(raw);
  if (q.length < 2) return null;
  const exactPopular = POPULAR_DESTINATIONS.find((p) => [p.label, ...(p.aliases ?? []), ...p.keys].some((n) => normalizeText(n) === q));
  if (exactPopular) return fromPopular(exactPopular);
  const [best] = await suggestDestinations(raw, 1);
  if (!best) return null;
  return resolveDestination(best.label, best.key);
}

function fromPopular(p: PopularDestination): ResolvedDestination {
  return { key: `p:${p.id}`, label: p.label, country: p.country, keys: p.keys, regions: p.regions, extra: p.ggt ? { GGT_BEST_BUY: p.ggt } : {} };
}

/** Códigos do fornecedor para o destino resolvido. */
export async function supplierCodesFor(supplierCode: string, dest: ResolvedDestination): Promise<string[]> {
  const extra = dest.extra[supplierCode] ?? [];
  if (extra.length) return extra;
  const conds = [eq(hotelDestinations.supplierCode, supplierCode), inArray(hotelDestinations.searchKey, dest.keys)];
  if (dest.country) conds.push(eq(hotelDestinations.countryCode, dest.country));
  const rows = await getDb()
    .select({ code: hotelDestinations.code, region: hotelDestinations.region, searchKey: hotelDestinations.searchKey })
    .from(hotelDestinations)
    .where(and(...conds))
    .limit(20);
  const allowed = dest.regions?.map((r) => r.toUpperCase());
  const filtered = allowed ? rows.filter((r) => !r.region || allowed.includes(r.region.toUpperCase())) : rows;
  return filtered.map((r) => r.code);
}

/** Somente para manutenção/testes. */
export async function deleteSupplierDestinations(supplierCode: string, keepCodes: string[] = []) {
  const db = getDb();
  await db
    .delete(hotelDestinations)
    .where(keepCodes.length ? and(eq(hotelDestinations.supplierCode, supplierCode), notInArray(hotelDestinations.code, keepCodes)) : eq(hotelDestinations.supplierCode, supplierCode));
}
