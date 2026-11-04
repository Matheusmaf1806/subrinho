/**
 * Cliente da API da Hotelbeds (HBX Group / APItude).
 *
 * Autenticação:
 *  - toda chamada leva Api-key + X-Signature = SHA-256(apiKey + secret + timestamp em segundos);
 *  - Booking API (disponibilidade, checkrate, reservas) exige mTLS em api-mtls.hotelbeds.com:
 *    certificado do cliente (HB_HOTEIS_CLIENT_CRT), chave privada (HB_HOTEIS_CLIENT_KEY) e cadeia
 *    da autoridade certificadora (HB_HOTEIS_CA_CHAIN);
 *  - Content API (fotos, descrições, destinos) usa api.hotelbeds.com, sem certificado.
 */
import { createHash, createPrivateKey, X509Certificate } from "node:crypto";
import https from "node:https";
import tls from "node:tls";
import zlib from "node:zlib";
import { SupplierError, SupplierIntegrationError } from "../types";

export type HotelbedsConfig = {
  apiKey: string;
  secret: string;
  cert: string;
  key: string;
  caChain: string;
  environment: "production" | "test";
  bookingUrl: string;
  contentUrl: string;
  language: string;
  /** Mercado de origem do cliente (preços válidos para este país). */
  sourceMarket: string;
  /** Somente testes: confiar também neste CA ao validar o servidor. */
  extraServerCa?: string;
};

const first = (env: NodeJS.ProcessEnv, ...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);

export function hotelbedsConfig(env: NodeJS.ProcessEnv = process.env): HotelbedsConfig | null {
  const apiKey = first(env, "HB_HOTEIS_API_KEY", "HOTELBEDS_API_KEY", "API_KEY_HH");
  const secret = first(env, "HB_HOTEIS_SECRET", "HOTELBEDS_SECRET", "SECRET_KEY_HH");
  const cert = first(env, "HB_HOTEIS_CLIENT_CRT");
  const key = first(env, "HB_HOTEIS_CLIENT_KEY");
  const caChain = first(env, "HB_HOTEIS_CA_CHAIN") ?? "";
  if (!apiKey || !secret || !cert || !key) return null;
  // As credenciais da Subrinho são de produção: só usa o ambiente de testes se pedido explicitamente.
  const environment = /^test/i.test(first(env, "HB_HOTEIS_ENVIRONMENT", "HOTELBEDS_ENVIRONMENT") ?? "") ? "test" : "production";
  const host = environment === "production" ? "hotelbeds.com" : "test.hotelbeds.com";
  return {
    apiKey,
    secret,
    cert: normalizePem(cert),
    key: normalizePem(key),
    caChain: caChain ? normalizePem(caChain) : "",
    environment,
    bookingUrl: (first(env, "HOTELBEDS_BOOKING_URL") ?? `https://api-mtls.${host}/hotel-api/1.0`).replace(/\/+$/, ""),
    contentUrl: (first(env, "HOTELBEDS_CONTENT_URL") ?? `https://api.${host}/hotel-content-api/1.0`).replace(/\/+$/, ""),
    language: first(env, "HOTELBEDS_LANGUAGE") ?? "POR",
    sourceMarket: (first(env, "HOTELBEDS_SOURCE_MARKET") ?? "BR").toUpperCase(),
  };
}

/** Variáveis faltando (para o diagnóstico). */
export function hotelbedsMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  const miss: string[] = [];
  if (!first(env, "HB_HOTEIS_API_KEY", "HOTELBEDS_API_KEY", "API_KEY_HH")) miss.push("HB_HOTEIS_API_KEY");
  if (!first(env, "HB_HOTEIS_SECRET", "HOTELBEDS_SECRET", "SECRET_KEY_HH")) miss.push("HB_HOTEIS_SECRET");
  if (!first(env, "HB_HOTEIS_CLIENT_CRT")) miss.push("HB_HOTEIS_CLIENT_CRT");
  if (!first(env, "HB_HOTEIS_CLIENT_KEY")) miss.push("HB_HOTEIS_CLIENT_KEY");
  if (!first(env, "HB_HOTEIS_CA_CHAIN")) miss.push("HB_HOTEIS_CA_CHAIN");
  return miss;
}

/**
 * Aceita o PEM como foi colado na Vercel: com quebras de linha reais, com "\n" literais, tudo em
 * uma linha (quebras viraram espaços) ou em base64.
 */
export function normalizePem(value: string): string {
  let v = value.trim().replace(/^["']|["']$/g, "");
  if (!v.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(v, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) v = decoded.trim();
    } catch {
      /* não era base64 */
    }
  }
  v = v.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
  const blocks = [...v.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)];
  if (!blocks.length) return v;
  return (
    blocks
      .map(([, label, body]) => {
        const b64 = body.replace(/\s+/g, "");
        return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END ${label}-----`;
      })
      .join("\n") + "\n"
  );
}

export type CertificateInfo = { ok: boolean; subject?: string; issuer?: string; validTo?: string; daysLeft?: number; keyMatches?: boolean; error?: string };

/** Confere o certificado (validade e se a chave privada é dele) — usado no diagnóstico. */
export function inspectCertificate(cfg: Pick<HotelbedsConfig, "cert" | "key">): CertificateInfo {
  try {
    const x = new X509Certificate(cfg.cert);
    const validTo = new Date(x.validTo);
    const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
    let keyMatches = false;
    try {
      keyMatches = x.checkPrivateKey(createPrivateKey(cfg.key));
    } catch {
      keyMatches = false;
    }
    return { ok: keyMatches && daysLeft >= 0, subject: x.subject.replace(/\n/g, ", "), issuer: x.issuer.replace(/\n/g, ", "), validTo: validTo.toISOString(), daysLeft, keyMatches };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function signature(apiKey: string, secret: string, now = Date.now()): string {
  return createHash("sha256").update(`${apiKey}${secret}${Math.floor(now / 1000)}`).digest("hex");
}

export class HotelbedsApiError extends SupplierIntegrationError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly path: string,
  ) {
    super(`Hotelbeds ${path}: ${message}${code ? ` (${code})` : ""} [HTTP ${status}]`, { status, code, path });
  }
}

export type HttpResponse = { status: number; body: string };
export type Transport = (req: { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number; mtls: boolean }) => Promise<HttpResponse>;

export class HotelbedsClient {
  private agent: https.Agent | null = null;

  constructor(
    readonly cfg: HotelbedsConfig,
    private readonly transport?: Transport,
  ) {}

  /** Agente HTTPS com o certificado do cliente (mTLS). */
  mtlsAgent(): https.Agent {
    if (this.agent) return this.agent;
    const chain = this.cfg.caChain ? `\n${this.cfg.caChain}` : "";
    this.agent = new https.Agent({
      // envia o certificado + intermediários; servidor validado pelas raízes públicas + cadeia informada
      cert: `${this.cfg.cert}${chain}`,
      key: this.cfg.key,
      ca: [...tls.rootCertificates, ...(this.cfg.caChain ? [this.cfg.caChain] : []), ...(this.cfg.extraServerCa ? [this.cfg.extraServerCa] : [])],
      keepAlive: true,
      maxSockets: 16,
    });
    return this.agent;
  }

  private headers(json: boolean): Record<string, string> {
    return {
      "Api-key": this.cfg.apiKey,
      "X-Signature": signature(this.cfg.apiKey, this.cfg.secret),
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async booking<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
    return this.call<T>(`${this.cfg.bookingUrl}${path}`, method, body, timeoutMs, true, path);
  }

  async content<T>(path: string, timeoutMs = 30_000): Promise<T> {
    return this.call<T>(`${this.cfg.contentUrl}${path}`, "GET", undefined, timeoutMs, false, path.split("?")[0]);
  }

  private async call<T>(url: string, method: string, body: unknown, timeoutMs: number, mtls: boolean, label: string): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = { url, method, headers: this.headers(payload !== undefined), body: payload, timeoutMs, mtls };
    let res: HttpResponse;
    try {
      res = this.transport ? await this.transport(req) : await this.send(req);
    } catch (e) {
      if (e instanceof SupplierError) throw e;
      const err = e as NodeJS.ErrnoException;
      const certProblem = /certificate|handshake|alert|ssl|tls/i.test(`${err.code ?? ""} ${err.message}`);
      throw new SupplierIntegrationError(
        certProblem ? `Hotelbeds ${label}: falha no mTLS (${err.code ?? err.message}) — confira HB_HOTEIS_CLIENT_CRT/KEY/CA_CHAIN e o ambiente` : `Hotelbeds ${label}: falha de conexão (${err.code ?? err.message})`,
        { label, code: err.code, timeout: err.code === "ETIMEDOUT" },
      );
    }
    let data: unknown = null;
    try {
      data = res.body ? JSON.parse(res.body) : null;
    } catch {
      data = null;
    }
    const apiErr = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status >= 400 || apiErr) {
      if (res.status === 401 || res.status === 403) {
        throw new HotelbedsApiError(res.status, apiErr?.code ?? "", apiErr?.message ?? "acesso negado — confira Api-key/secret, o certificado e se o ambiente (test/produção) corresponde às credenciais", label);
      }
      throw new HotelbedsApiError(res.status, apiErr?.code ?? "", apiErr?.message ?? (res.body.slice(0, 200) || "erro sem descrição"), label);
    }
    if (data === null) throw new SupplierIntegrationError(`Hotelbeds ${label}: resposta inválida`, { label, status: res.status });
    return data as T;
  }

  private send(req: Parameters<Transport>[0]): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const r = https.request(
        req.url,
        {
          method: req.method,
          headers: { ...req.headers, ...(req.body ? { "Content-Length": Buffer.byteLength(req.body).toString() } : {}) },
          agent: req.mtls ? this.mtlsAgent() : undefined,
          timeout: req.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("error", reject);
          res.on("end", () => {
            let buf = Buffer.concat(chunks);
            const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
            try {
              if (enc.includes("gzip")) buf = zlib.gunzipSync(buf);
              else if (enc.includes("deflate")) buf = zlib.inflateSync(buf);
              else if (enc.includes("br")) buf = zlib.brotliDecompressSync(buf);
            } catch (e) {
              return reject(e);
            }
            resolve({ status: res.statusCode ?? 0, body: buf.toString("utf8") });
          });
        },
      );
      r.on("timeout", () => {
        const e = new Error(`sem resposta em ${Math.round(req.timeoutMs / 1000)} s`) as NodeJS.ErrnoException;
        e.code = "ETIMEDOUT";
        r.destroy(e);
      });
      r.on("error", reject);
      if (req.body) r.write(req.body);
      r.end();
    });
  }
}
