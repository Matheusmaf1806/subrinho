/**
 * Cliente da API de parceiros da Master Vacation Homes (MVH Partner API v1, casas em Orlando e
 * arredores — sistema CiiRUS por trás). Documentação: https://api.mastervh.one/api-docs
 *
 *  - GET  /api/v1/public/units                         → casas ativas (resumo)
 *  - GET  /api/v1/public/units/{id}                    → conteúdo completo + regras de preço
 *  - GET  /api/v1/public/availability                  → busca (casas livres no período) ou calendário de uma casa
 *  - GET  /api/v1/public/quotes · /quotes/bulk         → cotação real (assíncrona: pending → ready/failed)
 *  - GET  /api/v1/public/regions                       → regiões (Orlando - Disney Area, Miami…)
 *  - POST /api/v1/internal/reservations                → reserva (fila: 202 + correlation_id)
 *  - GET  /api/v1/internal/reservations/status/{cid}   → resultado da reserva/cancelamento
 *  - POST /api/v1/internal/reservations/{id}/cancel    → cancelamento (fila)
 *  - GET  /api/v1/partner/reservations                 → nossas reservas (sincronização)
 *
 * Autenticação: cabeçalho `X-API-Key` (MASTER_VACATION_HOME_API_KEY). A chave nunca aparece em
 * mensagens de erro nem em chaves de cache. A chave sandbox (`mvh_sandbox_…`) usa casas e preços
 * reais, mas as reservas são simuladas (id 900000000+), e o limite é de 30 requisições/minuto.
 */
import { SupplierError, SupplierIntegrationError } from "../types";

export type MvhConfig = {
  apiKey: string;
  baseUrl: string;
  /** Chave sandbox: reservas simuladas (nunca chegam à Master). */
  sandbox: boolean;
};

const first = (env: NodeJS.ProcessEnv, ...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);
const KEY_VARS = ["MASTER_VACATION_HOME_API_KEY", "MVH_API_KEY"];
export const MVH_DEFAULT_URL = "https://api.mastervh.one";

export function mvhConfig(env: NodeJS.ProcessEnv = process.env): MvhConfig | null {
  const apiKey = first(env, ...KEY_VARS);
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (first(env, "MASTER_VACATION_HOME_API_URL") ?? MVH_DEFAULT_URL).replace(/\/+$/, ""),
    sandbox: /^mvh_sandbox_/i.test(apiKey),
  };
}

export function mvhMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return first(env, ...KEY_VARS) ? [] : ["MASTER_VACATION_HOME_API_KEY"];
}

export class MvhApiError extends SupplierIntegrationError {
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(`Master Vacation Home ${path}: ${message} [HTTP ${status}]`, { status, path });
  }
}

export type HttpResponse = { status: number; body: string; retryAfter?: string | null };
export type Transport = (req: { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number }) => Promise<HttpResponse>;

const fetchTransport: Transport = async (req) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctrl.signal, cache: "no-store" });
    return { status: res.status, body: await res.text(), retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
};

/** Mensagem de erro da API (FastAPI: `{"detail": "..."}` ou lista de erros de validação). */
export function errorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: unknown; message?: unknown; error?: unknown };
    const d = j.detail ?? j.message ?? j.error;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => (x as { msg?: string; loc?: unknown[] })?.msg ?? JSON.stringify(x)).join("; ");
    if (d) return JSON.stringify(d).slice(0, 200);
  } catch {
    /* texto puro */
  }
  return body.slice(0, 200) || "erro sem descrição";
}

type Query = Record<string, string | number | boolean | undefined | null>;

/** Depois de um 429, não chama a Master até o fim do Retry-After (por chave, nesta instância). */
const cooldown = new Map<string, number>();

export class MvhClient {
  constructor(
    readonly cfg: MvhConfig,
    private readonly transport: Transport = fetchTransport,
  ) {}

  get<T>(path: string, query: Query = {}, o: { timeoutMs?: number } = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const search = qs.toString();
    return this.call<T>("GET", `${path}${search ? `?${search}` : ""}`, undefined, o.timeoutMs ?? 20_000);
  }

  /** POST JSON. `idempotencyKey` torna a repetição segura (a Master devolve o pedido original). */
  post<T>(path: string, body: unknown, o: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<T> {
    return this.call<T>("POST", path, body, o.timeoutMs ?? 30_000, o.idempotencyKey);
  }

  private async call<T>(method: string, pathAndQuery: string, body: unknown, timeoutMs: number, idempotencyKey?: string): Promise<T> {
    const path = `/${pathAndQuery.replace(/^\/+/, "")}`;
    // rótulo sem ids nem parâmetros (mensagens e logs)
    const label = path.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/{id}").replace(/\/status\/[^/]+$/, "/status/{id}");
    const headers: Record<string, string> = { Accept: "application/json", "X-API-Key": this.cfg.apiKey };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const until = cooldown.get(this.cfg.apiKey) ?? 0;
    if (until > Date.now()) throw new MvhApiError(429, `limite de requisições da Master atingido, tente de novo em ${Math.ceil((until - Date.now()) / 1000)} s`, label);
    let res: HttpResponse;
    try {
      res = await this.transport({ url: `${this.cfg.baseUrl}${path}`, method, headers, body: body === undefined ? undefined : JSON.stringify(body), timeoutMs });
    } catch (e) {
      if (e instanceof SupplierError) throw e;
      const err = e as NodeJS.ErrnoException;
      const timeout = err.name === "AbortError" || err.name === "TimeoutError" || err.code === "ETIMEDOUT";
      throw new SupplierIntegrationError(
        timeout ? `Master Vacation Home ${label}: sem resposta em ${Math.round(timeoutMs / 1000)} s` : `Master Vacation Home ${label}: falha de conexão (${err.code ?? err.message})`,
        { label, timeout },
      );
    }
    if (res.status === 429) cooldown.set(this.cfg.apiKey, Date.now() + Math.min(120, Math.max(1, Number(res.retryAfter) || 60)) * 1000);
    if (res.status >= 400) {
      const msg =
        res.status === 401
          ? "chave da API inválida ou ausente (confira MASTER_VACATION_HOME_API_KEY)"
          : res.status === 403
            ? `a chave não tem permissão para esta rota (${errorMessage(res.body)})`
            : res.status === 429
              ? `limite de requisições da Master atingido, tente de novo em ${res.retryAfter || "60"} s`
              : errorMessage(res.body);
      throw new MvhApiError(res.status, msg, label);
    }
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new SupplierIntegrationError(`Master Vacation Home ${label}: resposta inválida (não é JSON)`, { label, status: res.status });
    }
  }
}
