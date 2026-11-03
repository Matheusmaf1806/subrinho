import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** Transação ou conexão — os serviços aceitam ambos. */
export type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __subrinhoPool?: pg.Pool; __subrinhoDb?: DB };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada");
  return new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) });
}

export function getDb(): DB {
  if (!globalForDb.__subrinhoDb) {
    globalForDb.__subrinhoPool = createPool();
    globalForDb.__subrinhoDb = drizzle(globalForDb.__subrinhoPool, { schema });
  }
  return globalForDb.__subrinhoDb;
}

/** Proxy preguiçoso: só conecta quando usado (evita falhar no build). */
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export async function closeDb() {
  await globalForDb.__subrinhoPool?.end();
  globalForDb.__subrinhoPool = undefined;
  globalForDb.__subrinhoDb = undefined;
}

export { schema };
