/**
 * Cliente da Tue Distributor API v2.0 (TuExperiencia) — ingressos e experiências.
 *
 * Autenticação OAuth2 "client credentials": POST /oauth2/token com Basic usuário:senha → token
 * Bearer (reaproveitado até expirar; 401 → novo token uma vez). O distribuidor é identificado pelo
 * `distributor_id` nas consultas e nos pedidos.
 *
 * Ambientes: distributor-test (sandbox/certificação) e distributor-live (produção).
 */
import { SupplierError, SupplierIntegrationError } from "../types";

export type TueConfig = {
  distributorId: string;
  username: string;
  password: string;
  environment: "live" | "test";
  baseUrl: string;
  language: string;
};

const first = (env: NodeJS.ProcessEnv, ...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);

export function tueConfig(env: NodeJS.ProcessEnv = process.env): TueConfig | null {
  const distributorId = first(env, "TUEXPERIENCIA_DISTRIBUTOR_ID", "TU_EXPERIENZA_DISTRIBUTOR_ID");
  const username = first(env, "TUEXPERIENCIA_USERNAME", "TU_EXPERIENZA_USERNAME");
  const password = first(env, "TUEXPERIENCIA_PASSWORD", "TU_EXPERIENZA_PASSWORD");
  if (!distributorId || !username || !password) return null;
  const environment = /^test|^sandbox|^stag/i.test(first(env, "TUEXPERIENCIA_ENVIRONMENT") ?? "") ? "test" : "live";
  const baseUrl = (first(env, "TUEXPERIENCIA_API_URL") ?? `https://distributor-${environment}.tuexperiencia.com/v2.0`).replace(/\/+$/, "");
  return { distributorId, username, password, environment, baseUrl, language: first(env, "TUEXPERIENCIA_LANGUAGE") ?? "pt" };
}

export function tueMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ["TUEXPERIENCIA_DISTRIBUTOR_ID", first(env, "TUEXPERIENCIA_DISTRIBUTOR_ID", "TU_EXPERIENZA_DISTRIBUTOR_ID")],
    ["TUEXPERIENCIA_USERNAME", first(env, "TUEXPERIENCIA_USERNAME", "TU_EXPERIENZA_USERNAME")],
    ["TUEXPERIENCIA_PASSWORD", first(env, "TUEXPERIENCIA_PASSWORD", "TU_EXPERIENZA_PASSWORD")],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n as string);
}

export class TueApiError extends SupplierIntegrationError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly path: string,
    readonly reference: string | null = null,
  ) {
    super(`Tue ${path}: ${message}${code ? ` (${code})` : ""} [HTTP ${status}]${reference ? ` ref ${reference}` : ""}`, { status, code, path, reference });
  }
}

export type HttpResponse = { status: number; body: string; headers?: Record<string, string> };
export type Transport = (req: { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number }) => Promise<HttpResponse>;

const fetchTransport: Transport = async (req) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctrl.signal, cache: "no-store" });
    return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
  } finally {
    clearTimeout(timer);
  }
};

type TokenRS = { access_token?: string; token_type?: string; expires_in?: number };
type ErrorRS = { error?: string; error_description?: string; error_message?: string; error_reference?: string; errors?: unknown[] };

export class TueClient {
  private token: { value: string; type: string; until: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    readonly cfg: TueConfig,
    private readonly transport: Transport = fetchTransport,
  ) {}

  /** Token Bearer (renova quando falta menos de 1 minuto). */
  async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.until > Date.now() + 60_000) return `${this.token.type} ${this.token.value}`;
    // consultas em paralelo usam o mesmo pedido de token (a Tue pede para não gerar tokens à toa)
    if (this.pending) return this.pending;
    this.pending = this.fetchToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${encodeURIComponent(this.cfg.username)}:${encodeURIComponent(this.cfg.password)}`).toString("base64");
    const rs = await this.raw<TokenRS>("POST", "/oauth2/token", { grant_type: "client_credentials" }, { Authorization: `Basic ${basic}` }, 30_000);
    if (!rs.access_token) throw new SupplierIntegrationError("Tue /oauth2/token: resposta sem access_token", { path: "/oauth2/token" });
    this.token = { value: rs.access_token, type: rs.token_type || "Bearer", until: Date.now() + Math.max(60, Number(rs.expires_in) || 3600) * 1000 };
    return `${this.token.type} ${this.token.value}`;
  }

  get<T>(path: string, query: Record<string, string | number | boolean | null | undefined> = {}, timeoutMs = 30_000) {
    return this.call<T>("GET", withQuery(path, query), undefined, timeoutMs);
  }

  post<T>(path: string, body: unknown, opts: { timeoutMs?: number; idempotencyKey?: string } = {}) {
    return this.call<T>("POST", path, body, opts.timeoutMs ?? 60_000, opts.idempotencyKey);
  }

  delete<T>(path: string, query: Record<string, string | number | boolean | null | undefined> = {}, timeoutMs = 60_000) {
    return this.call<T>("DELETE", withQuery(path, query), undefined, timeoutMs);
  }

  private async call<T>(method: string, path: string, body: unknown, timeoutMs: number, idempotencyKey?: string): Promise<T> {
    const auth = await this.accessToken();
    try {
      return await this.raw<T>(method, path, body, { Authorization: auth, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, timeoutMs);
    } catch (e) {
      // token recusado: pede outro uma única vez (recomendação da Tue)
      if (e instanceof TueApiError && e.status === 401) {
        const fresh = await this.accessToken(true);
        return this.raw<T>(method, path, body, { Authorization: fresh, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, timeoutMs);
      }
      throw e;
    }
  }

  private async raw<T>(method: string, path: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<T> {
    const label = path.split("?")[0];
    const payload = body === undefined ? undefined : JSON.stringify(body);
    let res: HttpResponse;
    try {
      res = await this.transport({
        url: `${this.cfg.baseUrl}${path}`,
        method,
        headers: { Accept: "application/json", "App-Name": "Subrinho", ...(payload ? { "Content-Type": "application/json" } : {}), ...headers },
        body: payload,
        timeoutMs,
      });
    } catch (e) {
      if (e instanceof SupplierError) throw e;
      const err = e as NodeJS.ErrnoException;
      const timeout = err.name === "AbortError" || err.name === "TimeoutError" || err.code === "ETIMEDOUT";
      throw new SupplierIntegrationError(timeout ? `Tue ${label}: sem resposta em ${Math.round(timeoutMs / 1000)} s` : `Tue ${label}: falha de conexão (${err.code ?? err.message})`, { label, timeout });
    }
    let data: unknown = null;
    try {
      data = res.body ? JSON.parse(res.body) : null;
    } catch {
      data = null;
    }
    if (res.status >= 400) {
      const e = (data ?? {}) as ErrorRS;
      const detail = Array.isArray(e.errors) && e.errors.length ? ` — ${e.errors.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ").slice(0, 300)}` : "";
      const msg =
        res.status === 401 || res.status === 403
          ? `${e.error_description || e.error_message || "credenciais recusadas"} — confira TUEXPERIENCIA_USERNAME/PASSWORD/DISTRIBUTOR_ID e o ambiente (TUEXPERIENCIA_ENVIRONMENT=${this.cfg.environment})`
          : `${e.error_description || e.error_message || res.body.slice(0, 200) || "erro sem descrição"}${detail}`;
      throw new TueApiError(res.status, e.error ?? "", msg, label, e.error_reference ?? null);
    }
    if (data === null && res.status !== 204) throw new SupplierIntegrationError(`Tue ${label}: resposta inválida`, { label, status: res.status });
    return data as T;
  }
}

function withQuery(path: string, q: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}
