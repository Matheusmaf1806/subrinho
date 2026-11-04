/**
 * Cliente da API de atacado da eSIMX (Wholesale API, documentação no console da eSIMX, página "API
 * docs"). Autenticação: header `x-api-key` em todas as chamadas. Base:
 * https://enterprise.esimx.com/api/api/v1 (o caminho tem dois segmentos "api", como diz a documentação).
 *
 * Envelope: { code, message, data }. Erro de negócio volta com HTTP 200 e `code` diferente de 200;
 * chave ausente ou inválida volta HTTP 401. Valores em centavos de dólar (USD).
 */
import { SupplierError, SupplierIntegrationError } from "../types";

export type EsimxConfig = { apiKey: string; baseUrl: string };

const DEFAULT_BASE = "https://enterprise.esimx.com/api/api/v1";

export function esimxConfig(env: NodeJS.ProcessEnv = process.env): EsimxConfig | null {
  const apiKey = env.ESIMX_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, baseUrl: (env.ESIMX_API_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "") };
}

export function esimxMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.ESIMX_API_KEY?.trim() ? [] : ["ESIMX_API_KEY"];
}

/** Códigos de erro documentados (seção 4 da documentação). */
export const ESIMX_CODE = {
  OK: 200,
  BAD_PARAM: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  BUSY: 503,
  NO_BALANCE: 50001,
  ORG_DISABLED: 50003,
  EMPTY_CART: 50101,
  PACKAGE_UNAVAILABLE: 50102,
  ORDER_ID_CONFLICT: 50103,
  CANNOT_CANCEL: 50301,
  STATUS_NOT_ALLOWED: 50302,
  NOT_SUPPORTED: 50303,
  TOPUP_MISMATCH: 50304,
  REJECTED: 50305,
  OPERATION_RUNNING: 50306,
} as const;

export class EsimxApiError extends SupplierIntegrationError {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
    readonly path: string,
    readonly data: unknown = null,
  ) {
    super(`eSIMX ${path}: ${message} (code ${code}) [HTTP ${status}]`, { status, code, path });
  }
}

export type HttpResponse = { status: number; body: string };
export type Transport = (req: { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number }) => Promise<HttpResponse>;

const fetchTransport: Transport = async (req) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctrl.signal, cache: "no-store" });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
};

type Envelope<T> = { code?: number; message?: string; data?: T };
export type Query = Record<string, string | number | boolean | null | undefined>;

export class EsimxClient {
  constructor(
    readonly cfg: EsimxConfig,
    private readonly transport: Transport = fetchTransport,
  ) {}

  get<T>(path: string, query: Query = {}, timeoutMs = 30_000): Promise<T> {
    return this.call<T>("GET", withQuery(path, query), undefined, timeoutMs);
  }

  post<T>(path: string, body: unknown = {}, timeoutMs = 60_000): Promise<T> {
    return this.call<T>("POST", path, body, timeoutMs);
  }

  private async call<T>(method: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
    const label = path.split("?")[0];
    const payload = body === undefined ? undefined : JSON.stringify(body);
    let res: HttpResponse;
    try {
      res = await this.transport({
        url: `${this.cfg.baseUrl}${path}`,
        method,
        // identificação honesta do integrador (o Node não manda User-Agent próprio por padrão)
        headers: { Accept: "application/json", "User-Agent": "Subrinho/1.0 (+https://subrinho.vercel.app)", "x-api-key": this.cfg.apiKey, ...(payload ? { "Content-Type": "application/json" } : {}) },
        body: payload,
        timeoutMs,
      });
    } catch (e) {
      if (e instanceof SupplierError) throw e;
      const err = e as NodeJS.ErrnoException;
      const timeout = err.name === "AbortError" || err.name === "TimeoutError" || err.code === "ETIMEDOUT";
      throw new SupplierIntegrationError(timeout ? `eSIMX ${label}: sem resposta em ${Math.round(timeoutMs / 1000)} s` : `eSIMX ${label}: falha de conexão (${err.code ?? err.message})`, {
        label,
        timeout,
      });
    }
    if (res.status === 401) throw new EsimxApiError(401, 401, "chave recusada, confira ESIMX_API_KEY (página API Key do console da eSIMX)", label);
    let env: Envelope<T> | null = null;
    try {
      env = res.body ? (JSON.parse(res.body) as Envelope<T>) : null;
    } catch {
      env = null;
    }
    if (!env || typeof env.code !== "number") {
      throw new EsimxApiError(res.status, res.status, res.status >= 500 ? "serviço indisponível" : `resposta inválida (${res.body.slice(0, 120) || "vazia"})`, label);
    }
    if (env.code !== ESIMX_CODE.OK) throw new EsimxApiError(res.status, env.code, env.message || "erro sem descrição", label, env.data ?? null);
    return env.data as T;
  }
}

function withQuery(path: string, q: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}

export const isEsimxCode = (e: unknown, ...codes: number[]): e is EsimxApiError => e instanceof EsimxApiError && codes.includes(e.code);
