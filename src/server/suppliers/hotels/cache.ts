/**
 * Cache das respostas dos fornecedores: memória (por instância) + banco (compartilhado entre as
 * instâncias serverless). Falhas do cache nunca derrubam a busca — no pior caso, consulta a API.
 * Requisições idênticas simultâneas são unificadas (uma única chamada ao fornecedor).
 */
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import { supplierCache } from "@/server/db/schema";

type Entry = { value: unknown; expiresAt: number };
const MEMORY_LIMIT = 300;
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function useDb(): boolean {
  return process.env.SUPPLIER_CACHE !== "memory";
}

function remember(key: string, value: unknown, expiresAt: number) {
  memory.delete(key);
  memory.set(key, { value, expiresAt });
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const m = memory.get(key);
  if (m) {
    if (m.expiresAt > Date.now()) return m.value as T;
    memory.delete(key);
  }
  if (!useDb()) return undefined;
  try {
    const [row] = await getDb()
      .select({ value: supplierCache.value, expiresAt: supplierCache.expiresAt })
      .from(supplierCache)
      .where(and(eq(supplierCache.key, key), gt(supplierCache.expiresAt, new Date())));
    if (!row) return undefined;
    remember(key, row.value, row.expiresAt.getTime());
    return row.value as T;
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  remember(key, value, expiresAt);
  if (!useDb()) return;
  try {
    await getDb()
      .insert(supplierCache)
      .values({ key, value: value as object, expiresAt: new Date(expiresAt) })
      .onConflictDoUpdate({ target: supplierCache.key, set: { value: value as object, expiresAt: new Date(expiresAt) } });
    // limpeza oportunista (1 em 50 gravações)
    if (Math.random() < 0.02) await getDb().delete(supplierCache).where(lt(supplierCache.expiresAt, new Date()));
  } catch {
    /* cache é opcional */
  }
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(key);
  if (!useDb()) return;
  try {
    await getDb().delete(supplierCache).where(eq(supplierCache.key, key));
  } catch {
    /* ignore */
  }
}

/** Retorna do cache ou executa `load` (uma vez por chave, mesmo com chamadas simultâneas). */
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>, opts: { cacheIf?: (v: T) => boolean } = {}): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = (async () => {
    try {
      const v = await load();
      if (!opts.cacheIf || opts.cacheIf(v)) await cacheSet(key, v, ttlSeconds);
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Somente testes. */
export function clearMemoryCache() {
  memory.clear();
  inflight.clear();
}
