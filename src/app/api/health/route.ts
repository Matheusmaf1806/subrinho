/**
 * Diagnóstico do ambiente: abra /api/health no navegador.
 * Diz se o banco está configurado, acessível, com as tabelas criadas e com dados — e o que fazer se não estiver.
 * Não expõe senhas nem a URL de conexão.
 */
import { sql } from "drizzle-orm";
import { getDb, resolveDatabaseUrl } from "@/server/db";
import { hotelIntegrations, testHotelIntegration } from "@/server/suppliers/hotels/admin";
import { getCurrentFx } from "@/server/fx";
import { currentSubrinhoUser } from "@/server/auth/session";
import { paymentProviderName } from "@/server/payments/provider";
import { paypalClient, paypalConfig, paypalMissing } from "@/server/payments/paypal";

type Check = { ok: boolean; detalhe: string; o_que_fazer?: string };

function classify(e: unknown): { detalhe: string; o_que_fazer: string } {
  // O Drizzle embrulha o erro do driver em `cause`.
  let err = e as { code?: string; message?: string; cause?: unknown };
  while (err?.cause && !err.code) err = err.cause as typeof err;
  const code = err?.code ?? "";
  const msg = String(err?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/gi, "[url oculta]");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return { detalhe: `Servidor do banco não encontrado (${code})`, o_que_fazer: "Confira o host na DATABASE_URL, copie de novo do Neon (botão Connect)." };
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
  // Fornecedores e câmbio só para a equipe Subrinho (logada) ou o agendador (CRON_SECRET):
  // a página é pública e o nome dos fornecedores nunca aparece para clientes e agências.
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const privileged = (!!secret && bearer === secret) || !!(await currentSubrinhoUser().catch(() => null));
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
          : { ok: true, detalhe: `lojas: ${r.lojas} (${r.slugs ?? "-"}), usuários Subrinho: ${r.usuarios}, fornecedores: ${r.fornecedores}, cotações: ${r.cambio}` };
      }
    } catch (e) {
      checks.conexao = { ok: false, ...classify(e) };
    }
  }

  // Hotéis com API real (sem rede; ?fornecedores testa a conexão de cada um)
  let hoteis: Record<string, unknown> | undefined;
  let casas: Record<string, unknown> | undefined;
  let ingressos: Record<string, unknown> | undefined;
  let chip: Record<string, unknown> | undefined;
  if (checks.tabelas?.ok && privileged) {
    try {
      const list = await hotelIntegrations();
      hoteis = {};
      casas = {};
      ingressos = {};
      chip = {};
      for (const h of list) {
        const test = testSuppliers && h.configured ? await testHotelIntegration(h.code) : null;
        (h.category === "HOUSES" ? casas : h.category === "TICKETS" ? ingressos : h.category === "CHIP" ? chip : hoteis)[h.code] = {
          modo: h.live ? "API real" : h.configured ? "credenciais ok, mas SUPPLIERS_MODE=mock" : "fora da loja (sem credenciais)",
          ambiente: h.environment,
          variaveis_faltando: h.missing.length ? h.missing : undefined,
          variaveis_encontradas: h.found?.length ? h.found : undefined,
          destinos: h.destinations ?? undefined,
          certificado: h.certificate ? (h.certificate.ok ? `válido, vence em ${h.certificate.daysLeft} dias` : h.certificate.error ?? (h.certificate.keyMatches === false ? "a chave não corresponde ao certificado" : "vencido")) : undefined,
          teste: test ? `${test.ok ? "ok" : "falhou"}: ${test.message}` : undefined,
          saldo_usd: h.balanceUsd ?? undefined,
        };
      }
    } catch {
      hoteis = undefined;
      casas = undefined;
      ingressos = undefined;
      chip = undefined;
    }
  }

  // Gateway de pagamento (?fornecedores testa as credenciais do PayPal)
  let pagamento: Record<string, unknown> | undefined;
  if (privileged) {
    const provider = paymentProviderName();
    const pp = paypalConfig();
    let teste: string | undefined;
    if (testSuppliers && pp) {
      try {
        const c = paypalClient()!;
        await c.accessToken(true);
        const hooks = await c.request<{ webhooks?: { url?: string }[] }>("GET", "/v1/notifications/webhooks");
        const ours = (hooks.webhooks ?? []).filter((w) => w.url?.includes("/api/payments/webhook")).length;
        teste = `ok: credenciais aceitas (${pp.environment}) · webhooks para esta loja: ${ours}`;
      } catch (e) {
        teste = `falhou: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    pagamento = {
      provedor: provider === "paypal" ? "PayPal" : "simulado (sem gateway, pagamentos não valem)",
      ambiente: pp ? `${pp.environment} · ${new URL(pp.baseUrl).host}` : null,
      variaveis_faltando: pp ? undefined : paypalMissing(),
      pix:
        provider === "mock"
          ? `simulado · PIX_KEY ${process.env.PIX_KEY?.trim() ? "configurada" : "não configurada (defina antes de ligar o PayPal)"}`
          : process.env.PIX_KEY?.trim()
            ? "QR Code da chave PIX_KEY · confirmação manual no painel"
            : "desligado (defina PIX_KEY para oferecer Pix)",
      assinatura_webhook: pp ? (pp.webhookId ? "conferida (PAYPAL_WEBHOOK_ID)" : "sem PAYPAL_WEBHOOK_ID, eventos só disparam nova consulta à API do PayPal") : undefined,
      teste,
    };
  }

  // Câmbio usado nos preços (crítico com fornecedores reais em dólar/euro)
  let cambio: Record<string, unknown> | undefined;
  if (checks.tabelas?.ok && privileged) {
    try {
      const fx = await getCurrentFx(getDb());
      const provider = process.env.FX_PROVIDER?.trim() || "manual";
      const ages = Object.values(fx).map((r) => (Date.now() - new Date(r!.fetchedAt).getTime()) / 3_600_000);
      const oldest = ages.length ? Math.max(...ages) : Infinity;
      cambio = {
        provedor: provider,
        cotacoes: Object.fromEntries(Object.entries(fx).map(([c, r]) => [c, `${r!.rate} (${r!.source}, ${new Date(r!.fetchedAt).toISOString()})`])),
        ...(oldest > 24
          ? {
              atencao: `Cotação com mais de ${Math.floor(oldest)} h${provider === "manual" ? " (modo manual)" : ""}, os preços em dólar/euro usam esse valor.`,
              o_que_fazer: provider === "manual" ? "Atualize a cotação no Painel Subrinho → Câmbio todo dia, ou defina FX_PROVIDER=awesomeapi (ou poolvo) na Vercel." : "Confira se o provedor de câmbio está respondendo (Painel Subrinho → Câmbio).",
            }
          : {}),
      };
    } catch {
      cambio = undefined;
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return new Response(JSON.stringify(
      {
        status: ok ? "tudo certo" : "atenção",
        ambiente: process.env.VERCEL_ENV ?? "local",
        checks,
        ...(privileged ? { pagamento, cambio, ingressos, hoteis, casas, chip } : { fornecedores: "entre no Painel Subrinho (ou use Authorization: Bearer <CRON_SECRET>) para ver fornecedores e câmbio" }),
      },
      null,
      2,
    ), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
