/**
 * Cliente da MAPRO Channels API (https://developers.mapro.io).
 *
 * Autenticação: "Authorization: Bearer <token>". O token identifica o nosso canal de vendas E a
 * administradora (cliente MAPRO) — é a MAPRO quem vincula o token à conta da administradora; sem
 * esse vínculo a API responde 401 "not assigned to any account".
 */
import { SupplierError, SupplierIntegrationError } from "../types";

export type MaproConfig = {
  token: string;
  baseUrl: string;
};

const first = (env: NodeJS.ProcessEnv, ...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);

export function maproConfig(env: NodeJS.ProcessEnv = process.env): MaproConfig | null {
  const token = first(env, "MAPRO_API_TOKEN", "MAPRO_API_KEY", "MAPRO_TOKEN");
  if (!token) return null;
  return { token, baseUrl: (first(env, "MAPRO_API_URL") ?? "https://api.mapro.io").replace(/\/+$/, "") };
}

export function maproMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return first(env, "MAPRO_API_TOKEN", "MAPRO_API_KEY", "MAPRO_TOKEN") ? [] : ["MAPRO_API_TOKEN"];
}

export class MaproApiError extends SupplierIntegrationError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly path: string,
  ) {
    super(`MAPRO ${path}: ${message}${code ? ` (${code})` : ""} [HTTP ${status}]`, { status, code, path });
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

export class MaproClient {
  constructor(
    readonly cfg: MaproConfig,
    private readonly transport: Transport = fetchTransport,
  ) {}

  get<T>(path: string, timeoutMs = 30_000) {
    return this.call<T>("GET", path, undefined, timeoutMs);
  }

  post<T>(path: string, body: unknown, timeoutMs = 60_000) {
    return this.call<T>("POST", path, body, timeoutMs);
  }

  delete<T>(path: string, timeoutMs = 60_000) {
    return this.call<T>("DELETE", path, undefined, timeoutMs);
  }

  private async call<T>(method: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
    const label = path.split("?")[0].replace(/\/[0-9A-Z]{26}(?=\/|$)/g, "/{id}");
    const payload = body === undefined ? undefined : JSON.stringify(body);
    let res: HttpResponse;
    try {
      res = await this.transport({
        url: `${this.cfg.baseUrl}${path}`,
        method,
        headers: { Authorization: `Bearer ${this.cfg.token}`, Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}) },
        body: payload,
        timeoutMs,
      });
    } catch (e) {
      if (e instanceof SupplierError) throw e;
      const err = e as NodeJS.ErrnoException;
      const timeout = err.name === "AbortError" || err.name === "TimeoutError" || err.code === "ETIMEDOUT";
      throw new SupplierIntegrationError(timeout ? `MAPRO ${label}: sem resposta em ${Math.round(timeoutMs / 1000)} s` : `MAPRO ${label}: falha de conexão (${err.code ?? err.message})`, {
        label,
        timeout,
      });
    }
    let data: unknown = null;
    try {
      data = res.body ? JSON.parse(res.body) : null;
    } catch {
      data = null;
    }
    const obj = (data ?? {}) as { status?: number; error?: string; message?: string; msg?: string };
    // A API responde erro com HTTP 4xx/5xx ou com { status: 0, message } / { error, message }.
    if (res.status >= 400 || obj.error || obj.status === 0) {
      const msg = obj.message || obj.msg || res.body.slice(0, 200) || "erro sem descrição";
      if (res.status === 401 || obj.error === "invalid-auth") {
        throw new MaproApiError(res.status, obj.error ?? "invalid-auth", /not assigned to any account/i.test(msg) ? "token ainda não vinculado a nenhuma administradora — peça à MAPRO para associar o token à conta" : "token recusado — confira MAPRO_API_TOKEN", label);
      }
      throw new MaproApiError(res.status, obj.error ?? "", msg, label);
    }
    if (data === null) throw new SupplierIntegrationError(`MAPRO ${label}: resposta inválida`, { label, status: res.status });
    return data as T;
  }
}
