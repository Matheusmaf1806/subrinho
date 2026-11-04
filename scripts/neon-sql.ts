/**
 * Gera docs/neon/subrinho-instalar.sql: um único arquivo para colar no SQL Editor do Neon que
 * funciona em QUALQUER estado do banco (vazio, só com tabelas, parcialmente ou já instalado):
 *  - cria tipos/tabelas/índices/colunas que faltarem (sem erro se já existirem);
 *  - registra as migrações (os deploys na Vercel não tentam recriar nada);
 *  - insere fornecedores/configurações/feriados que faltarem (chave natural, ON CONFLICT DO NOTHING);
 *  - insere os dados de exemplo SÓ num banco sem lojas/usuários/pedidos (os IDs do seed mudam a
 *    cada geração; num banco em uso nada é misturado) — sem sessões, sem cache de fornecedores e
 *    sem a lista de destinos (baixada pela própria aplicação);
 *  - ajusta as sequências e mostra uma contagem no final.
 *
 * Uso: npm run db:reset (banco local com o seed) && npm run neon:sql
 * Requer pg_dump no PATH.
 */
import "./env";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };

function idempotent(stmt: string): string {
  const s = stmt.trim();
  if (!s) return "";
  if (/^CREATE TYPE /i.test(s)) return `DO $$ BEGIN\n  ${s}\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`;
  if (/^CREATE TABLE "/i.test(s)) return s.replace(/^CREATE TABLE "/i, 'CREATE TABLE IF NOT EXISTS "');
  if (/^CREATE UNIQUE INDEX "/i.test(s)) return s.replace(/^CREATE UNIQUE INDEX "/i, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  if (/^CREATE INDEX "/i.test(s)) return s.replace(/^CREATE INDEX "/i, 'CREATE INDEX IF NOT EXISTS "');
  if (/^ALTER TABLE "[^"]+" ADD COLUMN "/i.test(s)) return s.replace(/ ADD COLUMN "/i, ' ADD COLUMN IF NOT EXISTS "');
  if (/^ALTER TABLE "[^"]+" ADD CONSTRAINT /i.test(s))
    return `DO $$ BEGIN\n  ${s}\nEXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;\nEND $$;`;
  throw new Error(`Comando de migração não previsto (adicione a regra em scripts/neon-sql.ts): ${s.slice(0, 80)}`);
}

const schemaParts: string[] = [];
const migrationRows: string[] = [];
for (const e of journal.entries) {
  const sql = readFileSync(`drizzle/${e.tag}.sql`, "utf8");
  // mesmo hash que o migrator do Drizzle calcula
  const hash = createHash("sha256").update(sql).digest("hex");
  schemaParts.push(`-- Migração ${e.tag}`);
  for (const stmt of sql.split("--> statement-breakpoint")) {
    const out = idempotent(stmt);
    if (out) schemaParts.push(out.endsWith(";") ? out : `${out};`);
  }
  migrationRows.push(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT '${hash}', ${e.when} WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '${hash}');`,
  );
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida (banco local com o seed)");
/** Tabelas de referência com chave natural (código/data/chave): entram sempre, sem duplicar. */
const BASE_TABLES = ["suppliers", "settings", "holidays"];
const pgDump = (args: string[]) =>
  execFileSync("pg_dump", ["--dbname", url, "--schema=public", "--data-only", "--no-owner", "--no-privileges", "--column-inserts", "--rows-per-insert=200", "--on-conflict-do-nothing", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
const clean = (dump: string) =>
  dump
    .split("\n")
    .filter((l) => !l.startsWith("\\") && !/^SET |^SELECT pg_catalog\.set_config|^SELECT pg_catalog\.setval/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const baseData = clean(pgDump(BASE_TABLES.map((t) => `--table=public.${t}`)));
const sampleData = clean(
  pgDump([
    "--exclude-table=public.sessions",
    "--exclude-table-data=public.hotel_destinations",
    "--exclude-table-data=public.supplier_cache",
    ...BASE_TABLES.map((t) => `--exclude-table-data=public.${t}`),
  ]),
);
if (sampleData.includes("$seed$")) throw new Error("Os dados de exemplo contêm o delimitador $seed$");

const sequences: [string, string, string][] = [
  ["cart_views_id_seq", "cart_views", "id"],
  ["fx_rates_id_seq", "fx_rates", "id"],
  ["order_events_id_seq", "order_events", "id"],
  ["orders_number_seq", "orders", "number"],
];

const out = `-- ============================================================================
-- Subrinho — INSTALAR banco (tabelas + dados de exemplo)
--
-- Funciona em qualquer situação: banco vazio, tabelas já criadas pelo deploy,
-- instalação pela metade ou já instalada. O que já existe é mantido.
--
-- Neon → SQL Editor → (se aparecer "Failed transaction", clique em ROLLBACK)
--      → apague tudo do editor → cole este arquivo inteiro → Run.
-- No final aparece uma tabela com a contagem (lojas, pedidos...).
--
-- Acessos de exemplo (TROQUE AS SENHAS antes de usar de verdade):
--   Painel Subrinho  /subrinho/login  admin@subrinho.com.br   / subrinho123
--   Painel Afiliado  /afiliado/login  ana@viagensdaana.com.br / afiliado123
--   Loja             /loja/viagens-da-ana  maria@cliente.com.br / cliente123
--
-- Gerado por scripts/neon-sql.ts (npm run neon:sql) — não edite à mão.
-- ============================================================================

BEGIN;
SET LOCAL search_path = public;

-- ───────── 1. Estrutura (cria só o que falta) ─────────
${schemaParts.join("\n")}

-- ───────── 2. Registro das migrações (deploys na Vercel não recriam nada) ─────────
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
${migrationRows.join("\n")}

-- ───────── 3. Dados de referência (fornecedores, configurações, feriados — o que existir é mantido) ─────────
${baseData}

-- ───────── 4. Dados de exemplo — SÓ num banco sem lojas e sem usuários ─────────
-- (num banco já em uso, nada é inserido: os dados reais nunca se misturam com os de exemplo)
DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.affiliates) OR EXISTS (SELECT 1 FROM public.subrinho_users) OR EXISTS (SELECT 1 FROM public.orders) THEN
    RAISE NOTICE 'Banco já em uso: dados de exemplo não foram inseridos (estrutura atualizada).';
    RETURN;
  END IF;

${sampleData}
END
$seed$;

-- ───────── 5. Sequências ─────────
${sequences.map(([seq, table, col]) => `SELECT setval('public.${seq}', COALESCE((SELECT max(${col}) FROM public.${table}), 0) + 1, false);`).join("\n")}

COMMIT;

-- ───────── Conferência ─────────
SELECT
  (SELECT count(*) FROM public.affiliates) AS lojas,
  (SELECT count(*) FROM public.subrinho_users) AS usuarios_subrinho,
  (SELECT count(*) FROM public.affiliate_users) AS usuarios_afiliados,
  (SELECT count(*) FROM public.orders) AS pedidos,
  (SELECT count(*) FROM public.suppliers) AS fornecedores,
  'instalado' AS status;
`;

writeFileSync("docs/neon/subrinho-instalar.sql", out);
console.log(`✔ docs/neon/subrinho-instalar.sql (${Math.round(out.length / 1024)} KB)`);
