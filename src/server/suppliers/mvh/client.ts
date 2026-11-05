/**
 * Cliente da API da Master Vacation Home (casas de temporada em Orlando, sistema CiiRUS por trás).
 *
 * Contrato de referência: a integração do airnext (as mesmas rotas `api/v2` da Master).
 *  - GET {base}/getproperties                 → todas as casas (conteúdo, sem preço)
 *  - GET {base}/getdescription/{id}           → descrição em texto
 *  - GET {base}/getimages/{id}                → fotos (lista de URLs)
 *  - GET {base}/quote?uid&ArriveDate&DepartDate                 → casas livres no período (preço TABELADO por tier: não usar como preço)
 *  - GET {base}/quote/{id}?uid&ArriveDate&DepartDate[&Guests]   → cotação real daquela casa
 *  - GET {ical}/{id}/airbnb/ical.ics          → calendário (datas ocupadas)
 *
 * O `uid` (MASTER_VACATION_HOME_API_KEY) identifica a nossa conta de parceiro e vai só nas cotações.
 * Ele nunca aparece em mensagens de erro nem em chaves de cache.
 */
import { SupplierError, SupplierIntegrationError } from "../types";

export type MvhConfig = {
  uid: string;
  baseUrl: string;
  icalUrl: string;
};

const first = (env: NodeJS.ProcessEnv, ...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);
const KEY_VARS = ["MASTER_VACATION_HOME_API_KEY", "MASTER_VACATION_HOME_UID", "MVH_UID"];

export function mvhConfig(env: NodeJS.ProcessEnv = process.env): MvhConfig | null {
  const uid = first(env, ...KEY_VARS);
  if (!uid) return null;
  return {
    uid,
    baseUrl: (first(env, "MASTER_VACATION_HOME_API_URL") ?? "https://mastervacationhomes.com/api/v2").replace(/\/+$/, ""),
    icalUrl: (first(env, "MASTER_VACATION_HOME_ICAL_URL") ?? "https://mastervh.com").replace(/\/+$/, ""),
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

export type HttpResponse = { status: number; body: string };
export type Transport = (req: { url: string; method: string; headers: Record<string, string>; timeoutMs: number }) => Promise<HttpResponse>;

const fetchTransport: Transport = async (req) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, signal: ctrl.signal, cache: "no-store" });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
};

export class MvhClient {
  constructor(
    readonly cfg: MvhConfig,
    private readonly transport: Transport = fetchTransport,
  ) {}

  /** JSON da API. `withUid` = rotas de cotação (as de conteúdo são públicas). */
  get<T>(path: string, query: Record<string, string | number | undefined> = {}, o: { withUid?: boolean; timeoutMs?: number } = {}): Promise<T> {
    const qs = new URLSearchParams();
    if (o.withUid) qs.set("uid", this.cfg.uid);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const label = `/${path.replace(/^\/+/, "").replace(/\/\d+(?=\/|$)/g, "/{id}")}`;
    const search = qs.toString();
    return this.call(`${this.cfg.baseUrl}/${path.replace(/^\/+/, "")}${search ? `?${search}` : ""}`, label, o.timeoutMs ?? 20_000, "json") as Promise<T>;
  }

  /** Calendário iCal da casa (texto). */
  ical(propertyId: string, timeoutMs = 15_000): Promise<string> {
    return this.call(`${this.cfg.icalUrl}/${encodeURIComponent(propertyId)}/airbnb/ical.ics`, "/ical", timeoutMs, "text") as Promise<string>;
  }

  private async call(url: string, label: string, timeoutMs: number, kind: "json" | "text"): Promise<unknown> {
    let res: HttpResponse;
    try {
      res = await this.transport({ url, method: "GET", headers: { Accept: kind === "json" ? "application/json" : "text/calendar, text/plain" }, timeoutMs });
    } catch (e) {
      if (e instanceof SupplierError) throw e;
      const err = e as NodeJS.ErrnoException;
      const timeout = err.name === "AbortError" || err.name === "TimeoutError" || err.code === "ETIMEDOUT";
      throw new SupplierIntegrationError(
        timeout ? `Master Vacation Home ${label}: sem resposta em ${Math.round(timeoutMs / 1000)} s` : `Master Vacation Home ${label}: falha de conexão (${err.code ?? err.message})`,
        { label, timeout },
      );
    }
    if (res.status >= 400) {
      // 404 com página HTML = a rota não existe mais (o site da Master foi refeito): avisar claramente no painel
      const html = /^\s*</.test(res.body);
      throw new MvhApiError(res.status, html && res.status === 404 ? "rota não encontrada, confira MASTER_VACATION_HOME_API_URL (a Master pode ter mudado o endereço da API)" : res.body.slice(0, 200) || "erro sem descrição", label);
    }
    if (kind === "text") return res.body;
    try {
      return JSON.parse(res.body);
    } catch {
      throw new SupplierIntegrationError(`Master Vacation Home ${label}: resposta inválida (não é JSON)`, { label, status: res.status });
    }
  }
}
