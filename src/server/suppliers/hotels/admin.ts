/** Situação das integrações reais (hotéis e casas) — Painel Subrinho e /api/health. Nunca expõe credenciais. */
import { count, max } from "drizzle-orm";
import { getDb } from "@/server/db";
import { hotelDestinations } from "@/server/db/schema";
import { addDays, todayLocal } from "@/lib/tz";
import { GGT_CODE, createGgtAdapter } from "../ggt/adapter";
import { GGT_OP, ggtConfig, isNotFound } from "../ggt/client";
import { HB_CODE, createHotelbedsAdapter } from "../hotelbeds/adapter";
import { hotelbedsConfig, hotelbedsMissing, inspectCertificate, type CertificateInfo } from "../hotelbeds/client";
import { MAPRO_CODE, MAPRO_DEMO_CUSTOMERS, createMaproFromEnv } from "../mapro/adapter";
import { maproConfig, maproMissing } from "../mapro/client";
import { TUE_CODE, createTueFromEnv } from "../tue/adapter";
import { tueConfig, tueMissing } from "../tue/client";
import { isLiveSupplier, suppliersMode } from "../registry";
import { SupplierError } from "../types";

export type HotelIntegration = {
  code: string;
  name: string;
  category: "LODGING" | "HOUSES" | "TICKETS";
  configured: boolean;
  live: boolean;
  environment: string | null;
  missing: string[];
  /** null = o fornecedor não tem lista de destinos para sincronizar (casas). */
  destinations: number | null;
  destinationsUpdatedAt: Date | null;
  certificate?: CertificateInfo;
};

export async function hotelIntegrations(): Promise<HotelIntegration[]> {
  const db = getDb();
  const stats = await db
    .select({ code: hotelDestinations.supplierCode, n: count(), at: max(hotelDestinations.updatedAt) })
    .from(hotelDestinations)
    .groupBy(hotelDestinations.supplierCode)
    .catch(() => [] as { code: string; n: number; at: Date | null }[]);
  const st = (code: string) => stats.find((x) => x.code === code);
  const ggt = ggtConfig();
  const hb = hotelbedsConfig();
  const ggtMissing = ["GGT_API_BASE_URL", "GGT_AGENCY_ID", "GGT_USER", "GGT_PASSWORD"].filter((n) => !process.env[n]?.trim());
  const tue = tueConfig();
  return [
    {
      code: TUE_CODE,
      name: "Tu Experienza",
      category: "TICKETS",
      configured: !!tue,
      live: isLiveSupplier(TUE_CODE),
      environment: tue ? `${tue.environment} · ${new URL(tue.baseUrl).host}` : null,
      missing: tueMissing(),
      destinations: null,
      destinationsUpdatedAt: null,
    },
    {
      code: GGT_CODE,
      name: "GGT | Best Buy Hotels",
      category: "LODGING",
      configured: !!ggt,
      live: isLiveSupplier(GGT_CODE),
      environment: ggt?.environment ?? null,
      missing: ggtMissing,
      destinations: Number(st(GGT_CODE)?.n ?? 0),
      destinationsUpdatedAt: st(GGT_CODE)?.at ?? null,
    },
    {
      code: HB_CODE,
      name: "Hotelbeds",
      category: "LODGING",
      configured: !!hb,
      live: isLiveSupplier(HB_CODE),
      environment: hb?.environment ?? null,
      missing: hotelbedsMissing(),
      destinations: Number(st(HB_CODE)?.n ?? 0),
      destinationsUpdatedAt: st(HB_CODE)?.at ?? null,
      certificate: hb ? inspectCertificate(hb) : undefined,
    },
    {
      code: MAPRO_CODE,
      name: "Mapro",
      category: "HOUSES",
      configured: !!maproConfig(),
      live: isLiveSupplier(MAPRO_CODE),
      environment: (() => {
        const c = maproConfig();
        return c ? new URL(c.baseUrl).host : null;
      })(),
      missing: maproMissing(),
      destinations: null,
      destinationsUpdatedAt: null,
    },
  ];
}

/** Teste rápido e somente leitura: credenciais + conexão (+ mTLS na Hotelbeds). */
export async function testHotelIntegration(code: string): Promise<{ ok: boolean; message: string; ms: number }> {
  const t0 = Date.now();
  const done = (ok: boolean, message: string) => ({ ok, message, ms: Date.now() - t0 });
  try {
    if (code === GGT_CODE) {
      const cfg = ggtConfig();
      if (!cfg) return done(false, "Credenciais da GGT incompletas");
      const a = createGgtAdapter(cfg);
      // consulta de status de uma reserva inexistente: valida usuário/senha/agência sem efeito nenhum
      await a.client.xml(GGT_OP.BOOKING_STATUS, `<Main Version="2.0"><GoBookingCode>1</GoBookingCode></Main>`, 20_000).catch((e) => {
        if (isNotFound(e)) return null;
        throw e;
      });
      return done(true, `Conectado à GGT (${cfg.environment}) — credenciais aceitas`);
    }
    if (code === HB_CODE) {
      const cfg = hotelbedsConfig();
      if (!cfg) return done(false, `Faltam variáveis: ${hotelbedsMissing().join(", ")}`);
      const cert = inspectCertificate(cfg);
      if (cert.error) return done(false, `Certificado inválido: ${cert.error}`);
      if (!cert.keyMatches) return done(false, "A chave privada (HB_HOTEIS_CLIENT_KEY) não corresponde ao certificado (HB_HOTEIS_CLIENT_CRT)");
      if ((cert.daysLeft ?? 0) < 0) return done(false, "Certificado vencido — gere um novo no portal developer.hotelbeds.com");
      const a = createHotelbedsAdapter(cfg);
      // lista de reservas de hoje: exercita mTLS + assinatura, somente leitura
      const today = todayLocal();
      await a.client.booking("GET", `/bookings?start=${today}&end=${addDays(today, 1)}&filterType=CREATION&from=1&to=1`, undefined, 30_000);
      await a.client.content(`/types/languages?fields=all&from=1&to=1`, 20_000);
      return done(true, `Conectado à Hotelbeds (${cfg.environment}) — mTLS e assinatura aceitos · certificado vence em ${cert.daysLeft} dias`);
    }
    if (code === TUE_CODE) {
      const a = createTueFromEnv();
      if (!a) return done(false, `Faltam variáveis: ${tueMissing().join(", ")}`);
      // token OAuth2 + 1 produto do catálogo: valida usuário, senha e distribuidor (somente leitura)
      await a.client.accessToken(true);
      const rs = await a.client.get<{ data?: { total_items?: number } }>("/products", { distributor_id: a.client.cfg.distributorId, items_per_page: 1 }, 30_000);
      return done(true, `Conectado à Tu Experienza (${a.client.cfg.environment}) — ${rs.data?.total_items ?? "?"} produtos no catálogo do distribuidor`);
    }
    if (code === MAPRO_CODE) {
      const a = createMaproFromEnv();
      if (!a) return done(false, `Faltam variáveis: ${maproMissing().join(", ")}`);
      // /v1/whoami: valida o token e diz de qual administradora são as casas (somente leitura)
      const who = await a.client.get<{ integration?: string; customer_id?: string; customer_name?: string }>("/v1/whoami", 20_000);
      if (who.customer_id && MAPRO_DEMO_CUSTOMERS.includes(who.customer_id))
        return done(process.env.VERCEL_ENV !== "production", `Token da conta DEMO da MAPRO (casas fictícias)${process.env.VERCEL_ENV === "production" ? " — bloqueado em produção; use o token de produção" : " — só para testes"}`);
      return done(true, `Conectado à MAPRO — administradora: ${who.customer_name ?? "?"} · canal: ${who.integration ?? "?"}`);
    }
    return done(false, "Fornecedor sem integração real");
  } catch (e) {
    return done(false, e instanceof SupplierError ? e.message : `Erro: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Baixa a lista completa de destinos do fornecedor. */
export async function syncHotelDestinations(code: string): Promise<number> {
  if (code === GGT_CODE) {
    const cfg = ggtConfig();
    if (!cfg) throw new SupplierError("Credenciais da GGT incompletas");
    return createGgtAdapter(cfg).syncDestinations();
  }
  if (code === HB_CODE) {
    const cfg = hotelbedsConfig();
    if (!cfg) throw new SupplierError("Credenciais da Hotelbeds incompletas");
    return createHotelbedsAdapter(cfg).syncDestinations();
  }
  throw new SupplierError("Fornecedor sem integração real");
}

export function integrationsMode() {
  return suppliersMode();
}

