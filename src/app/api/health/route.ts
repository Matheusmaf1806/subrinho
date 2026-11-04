/**
 * Diagnóstico do ambiente: abra /api/health no navegador.
 * Diz se o banco está configurado, acessível, com as tabelas criadas e com dados — e o que fazer se não estiver.
 * Não expõe senhas nem a URL de conexão.
 */
import { sql } from "drizzle-orm";
import { getDb, resolveDatabaseUrl } from "@/server/db";
import { hotelIntegrations, testHotelIntegration } from "@/server/suppliers/hotels/admin";

type Check = { ok: boolean; detalhe: string; o_que_fazer?: string };

function classify(e: unknown): { detalhe: string; o_que_fazer: string } {
  // O Drizzle embrulha o erro do driver em `cause`.
  let err = e as { code?: string; message?: string; cause?: unknown };
  while (err?.cause && !err.code) err = err.cause as typeof err;
  const code = err?.code ?? "";
  const msg = String(err?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/gi, "[url oculta]");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return { detalhe: `Servidor do banco não encontrado (${code})`, o_que_fazer: "Confira o host na DATABASE_URL — copie de novo do Neon (botão Connect)." };
  if (code === "28P01" || /password authentication/i.test(msg))
    return { detalhe: "Usuário ou senha do banco incorretos", o_que_fazer: "Copie de novo a URL de conexão no Neon (Connect) e atualize DATABASE_URL na Vercel; depois Redeploy." };
  if (code === "3D000") return { detalhe: "O database informado na URL não existe", o_que_fazer: "Use o database mostrado no Neon (normalmente 'neondb')." };
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /timeout/i.test(msg))
    return { detalhe: `Sem conexão com o banco (${code || "timeout"})`, o_que_fazer: "Verifique se a URL é a do Neon (não localhost) e se o projeto do Neon está ativo." };
  if (/ssl|certificate/i.test(msg)) return { detalhe: `Erro de SSL: ${msg}`, o_que_fazer: "Use a URL do Neon com ?sslmode=require." };
  return { detalhe: `${code ? code + ": " : ""}${msg}`.slice(0, 300), o_que_fazer: "Envie esta mensagem para o suporte técnico." };
}

export const maxDuration = 60;

export async function GET(request: Request) {
  const checks: Record<string, Check> = {};
  const testSuppliers = new URL(request.url).searchParams.has("fornecedores");
  const resolved = resolveDatabaseUrl();
  checks.variavel_de_ambiente = resolved
    ? { ok: true, detalhe: `Usando ${resolved.source}` }
    : {
        ok: false,
        detalhe: "Nenhuma DATABASE_URL encontrada nesta implantação",
        o_que_fazer: "Vercel → projeto → Settings → Environment Variables → adicione DATABASE_URL (ambiente Production) com a URL do Neon → Deployments → Redeploy.",
      };

  if (resolved) {
    const db = getDb();
    try {
      await db.execute(sql`select 1`);
      checks.conexao = { ok: true, detalhe: "Conectado ao PostgreSQL" };
      const t = await db.execute<{ affiliates: string | null; migrations: string | null }>(
        sql`select to_regclass('public.affiliates')::text as affiliates, to_regclass('drizzle.__drizzle_migrations')::text as migrations`,
      );
      const hasTables = !!t.rows[0]?.affiliates;
      checks.tabelas = hasTables
        ? { ok: true, detalhe: "Tabelas criadas" }
        : { ok: false, detalhe: "As tabelas não existem neste banco", o_que_fazer: "No Neon → SQL Editor, rode docs/neon/subrinho-instalar.sql (clique em ROLLBACK antes, se pedir)." };
      if (hasTables) {
        const c = await db.execute<{ lojas: number; usuarios: number; fornecedores: number; cambio: number; slugs: string | null }>(
          sql`select (select count(*)::int from affiliates) as lojas, (select count(*)::int from subrinho_users) as usuarios,
                     (select count(*)::int from suppliers) as fornecedores, (select count(*)::int from fx_rates) as cambio,
                     (select string_agg(slug, ', ' order by slug) from affiliates where active) as slugs`,
        );
        const r = c.rows[0];
        const missing = !r || r.lojas === 0 || r.usuarios === 0 || r.fornecedores === 0;
        checks.dados = missing
          ? {
              ok: false,
              detalhe: `lojas: ${r?.lojas ?? 0}, usuários Subrinho: ${r?.usuarios ?? 0}, fornecedores: ${r?.fornecedores ?? 0}`,
              o_que_fazer: "Rode docs/neon/subrinho-instalar.sql no SQL Editor do Neon para carregar os dados iniciais.",
            }
          : { ok: true, detalhe: `lojas: ${r.lojas} (${r.slugs ?? "—"}), usuários Subrinho: ${r.usuarios}, fornecedores: ${r.fornecedores}, cotações: ${r.cambio}` };
      }
    } catch (e) {
      checks.conexao = { ok: false, ...classify(e) };
    }
  }

  // Hotéis com API real (sem rede; ?fornecedores testa a conexão de cada um)
  let hoteis: Record<string, unknown> | undefined;
  if (checks.tabelas?.ok) {
    try {
      const list = await hotelIntegrations();
      hoteis = {};
      for (const h of list) {
        const test = testSuppliers && h.configured ? await testHotelIntegration(h.code) : null;
        hoteis[h.code] = {
          modo: h.live ? "API real" : h.configured ? "credenciais ok, mas SUPPLIERS_MODE=mock" : "simulado (sem credenciais)",
          ambiente: h.environment,
          variaveis_faltando: h.missing.length ? h.missing : undefined,
          destinos: h.destinations,
          certificado: h.certificate ? (h.certificate.ok ? `válido, vence em ${h.certificate.daysLeft} dias` : h.certificate.error ?? (h.certificate.keyMatches === false ? "a chave não corresponde ao certificado" : "vencido")) : undefined,
          teste: test ? `${test.ok ? "ok" : "falhou"}: ${test.message}` : undefined,
        };
      }
    } catch {
      hoteis = undefined;
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return new Response(JSON.stringify({ status: ok ? "tudo certo" : "atenção", ambiente: process.env.VERCEL_ENV ?? "local", checks, hoteis }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
