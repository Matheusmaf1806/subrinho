import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** Transação ou conexão — os serviços aceitam ambos. */
export type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __subrinhoPool?: pg.Pool; __subrinhoDb?: DB };

/**
 * URL do PostgreSQL. Além de DATABASE_URL, aceita os nomes que a integração Neon/Postgres
 * da Vercel costuma criar (inclusive com prefixo personalizado, ex.: STORAGE_DATABASE_URL).
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): { url: string; source: string } | null {
  const preferred = ["DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL"];
  for (const k of preferred) if (env[k]?.trim()) return { url: env[k]!.trim(), source: k };
  const prefixed = Object.keys(env)
    .filter((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && env[k]?.trim())
    .sort();
  if (prefixed.length) return { url: env[prefixed[0]]!.trim(), source: prefixed[0] };
  return null;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("Banco de dados não configurado: defina DATABASE_URL (Vercel → Settings → Environment Variables) e faça Redeploy");
  }
}

function createPool() {
  const resolved = resolveDatabaseUrl();
  if (!resolved) throw new DatabaseNotConfiguredError();
  // Serverless (Vercel): poucas conexões por instância; use a URL "pooled" do Neon (host com -pooler).
  const serverless = !!process.env.VERCEL;
  return new pg.Pool({
    connectionString: resolved.url,
    max: Number(process.env.DB_POOL_MAX ?? (serverless ? 3 : 10)),
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });
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
