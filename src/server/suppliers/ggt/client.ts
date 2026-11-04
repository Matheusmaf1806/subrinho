/**
 * Cliente da API da GGT | Best Buy Hotels (plataforma GoGlobal / Tourism Cloud Service).
 *
 * Transporte: SOAP 1.2 → método MakeRequest(requestType, xmlRequest). O xmlRequest é um <Root> com
 * <Header> (agência, usuário, senha, operação) e <Main> (a requisição). A resposta vem em
 * MakeRequestResult, como XML ou JSON (busca de hotéis com ResponseFormat="JSON").
 * Dados estáticos (lista de cidades) vêm de static-data.tourismcloudservice.com com Basic Auth.
 */
import { XMLParser } from "fast-xml-parser";
import { SupplierError, SupplierIntegrationError } from "../types";

export type GgtConfig = {
  url: string;
  agencyId: string;
  user: string;
  password: string;
  environment: string;
  staticUrl: string;
  nationality: string;
  language: string;
};

export function ggtConfig(env: NodeJS.ProcessEnv = process.env): GgtConfig | null {
  const url = env.GGT_API_BASE_URL?.trim();
  const agencyId = env.GGT_AGENCY_ID?.trim();
  const user = env.GGT_USER?.trim();
  const password = env.GGT_PASSWORD;
  if (!url || !agencyId || !user || !password) return null;
  return {
    url: /\.asmx$/i.test(url) ? url : `${url.replace(/\/+$/, "")}/xmlwebservice.asmx`,
    agencyId,
    user,
    password,
    environment: env.GGT_ENVIRONMENT?.trim() || "production",
    staticUrl: (env.GGT_STATIC_DATA_URL?.trim() || "https://static-data.tourismcloudservice.com").replace(/\/+$/, ""),
    nationality: (env.GGT_NATIONALITY?.trim() || "BR").toUpperCase(),
    language: env.GGT_LANGUAGE?.trim() || "pt",
  };
}

/** Códigos de requisição da API (MakeRequest.requestType). */
export const GGT_OP = {
  BOOKING_INSERT: { type: 2, name: "BOOKING_INSERT_REQUEST" },
  BOOKING_CANCEL: { type: 3, name: "BOOKING_CANCEL_REQUEST" },
  BOOKING_SEARCH: { type: 4, name: "BOOKING_SEARCH_REQUEST" },
  BOOKING_STATUS: { type: 5, name: "BOOKING_STATUS_REQUEST" },
  VOUCHER_DETAILS: { type: 8, name: "VOUCHER_DETAILS_REQUEST" },
  BOOKING_VALUATION: { type: 9, name: "BOOKING_VALUATION_REQUEST" },
  ADV_BOOKING_SEARCH: { type: 10, name: "ADV_BOOKING_SEARCH_REQUEST" },
  HOTEL_SEARCH: { type: 11, name: "HOTEL_SEARCH_REQUEST" },
  HOTEL_INFO: { type: 61, name: "HOTEL_INFO_REQUEST" },
} as const;
export type GgtOperation = (typeof GGT_OP)[keyof typeof GGT_OP];

/** Erro devolvido pela própria GGT (com código), ex.: 901 "Availability information missing". */
export class GgtApiError extends SupplierIntegrationError {
  constructor(
    readonly code: string,
    message: string,
    readonly debug: string | null,
    readonly operation: string,
  ) {
    super(`GGT ${operation}: ${message}${code ? ` (código ${code})` : ""}${debug ? ` — ${debug}` : ""}`, { code, debug, operation });
  }
}

export function escapeXml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "amp") return "&";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

const ARRAY_TAGS = new Set(["Picture", "Policy", "RoomType", "Room", "PersonName", "ExtraBed", "Booking", "Remark", "Transaction", "CityCode", "HotelId"]);
export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Texto de um nó (string, {#text}, CDATA já mesclado). */
export function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return String(node).trim();
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) return text((node as Record<string, unknown>)["#text"]);
  return "";
}

type FetchLike = typeof fetch;

export class GgtClient {
  constructor(
    readonly cfg: GgtConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private header(op: GgtOperation): string {
    const c = this.cfg;
    return `<Header><Agency>${escapeXml(c.agencyId)}</Agency><User>${escapeXml(c.user)}</User><Password>${escapeXml(c.password)}</Password><Operation>${op.name}</Operation><OperationType>Request</OperationType></Header>`;
  }

  /** Envia a requisição e devolve o conteúdo de MakeRequestResult (XML ou JSON em texto). */
  async raw(op: GgtOperation, main: string, timeoutMs: number): Promise<string> {
    const root = `<Root>${this.header(op)}${main}</Root>`;
    const envelope =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body><MakeRequest xmlns="http://www.tourismcloudservice.com/"><requestType>${op.type}</requestType><xmlRequest>${escapeXml(root)}</xmlRequest></MakeRequest></soap12:Body></soap12:Envelope>`;
    let res: Response;
    try {
      res = await this.fetchImpl(this.cfg.url, {
        method: "POST",
        headers: {
          "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.tourismcloudservice.com/MakeRequest"',
          "API-Operation": op.name,
          "API-AgencyID": this.cfg.agencyId,
          "Accept-Encoding": "gzip, deflate",
        },
        body: envelope,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new SupplierIntegrationError(timeout ? `GGT ${op.name}: sem resposta em ${Math.round(timeoutMs / 1000)} s` : `GGT ${op.name}: falha de conexão (${e instanceof Error ? e.message : String(e)})`, { operation: op.name, timeout });
    }
    const body = await res.text();
    const result = body.match(/<MakeRequestResult>([\s\S]*?)<\/MakeRequestResult>/);
    if (result) return unescapeXml(result[1]).trim();
    if (/<MakeRequestResult\s*\/>/.test(body)) throw new SupplierIntegrationError(`GGT ${op.name}: resposta vazia`, { operation: op.name });
    const fault = body.match(/<(?:soap12?:)?Text[^>]*>([\s\S]*?)<\/(?:soap12?:)?Text>|<faultstring>([\s\S]*?)<\/faultstring>/);
    throw new SupplierIntegrationError(`GGT ${op.name}: HTTP ${res.status}${fault ? ` — ${unescapeXml(fault[1] ?? fault[2]).slice(0, 300)}` : ""}`, { operation: op.name, status: res.status });
  }

  /** Requisição com resposta XML → objeto <Main>. Lança GgtApiError quando a GGT devolve erro. */
  async xml(op: GgtOperation, main: string, timeoutMs = 30_000): Promise<Record<string, unknown>> {
    const raw = await this.raw(op, main, timeoutMs);
    if (raw.startsWith("{")) return this.checkJson(op, parseJson(op, raw)) as Record<string, unknown>;
    return parseXmlMain(op, raw);
  }

  /** Requisição com resposta JSON (busca de hotéis). Erros podem vir em XML mesmo pedindo JSON. */
  async json<T>(op: GgtOperation, main: string, timeoutMs = 30_000): Promise<T> {
    const raw = await this.raw(op, main, timeoutMs);
    if (!raw.startsWith("{")) {
      parseXmlMain(op, raw); // lança o erro da GGT, se houver
      throw new SupplierIntegrationError(`GGT ${op.name}: resposta inesperada`, { operation: op.name, sample: raw.slice(0, 300) });
    }
    return this.checkJson(op, parseJson(op, raw)) as T;
  }

  private checkJson(op: GgtOperation, data: unknown): unknown {
    const d = data as { Header?: { OperationType?: string }; Main?: { Error?: { Code?: number | string; Message?: string }; DebugError?: { Message?: string } } };
    if (d?.Header?.OperationType === "Error" || d?.Main?.Error) {
      throw new GgtApiError(String(d.Main?.Error?.Code ?? ""), d.Main?.Error?.Message ?? "erro sem descrição", cleanDebug(d.Main?.DebugError?.Message ?? null), op.name);
    }
    return data;
  }

  /** CSV com todas as cidades pesquisáveis (CityId|City|CountryId|Country|IsoCode). */
  async destinationsCsv(timeoutMs = 120_000): Promise<string> {
    const auth = Buffer.from(`${this.cfg.user}:${this.cfg.password}`).toString("base64");
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.staticUrl}/propsdata/Destinations/compress/false`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      throw new SupplierIntegrationError(`GGT destinos: falha de conexão (${e instanceof Error ? e.message : String(e)})`);
    }
    if (res.status === 401 || res.status === 403) throw new SupplierIntegrationError("GGT destinos: usuário/senha recusados");
    if (!res.ok) throw new SupplierIntegrationError(`GGT destinos: HTTP ${res.status}`);
    return res.text();
  }
}

function parseJson(op: GgtOperation, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new SupplierIntegrationError(`GGT ${op.name}: JSON inválido na resposta`, { operation: op.name, sample: raw.slice(0, 300) });
  }
}

/** XML da resposta → <Main>. Lança GgtApiError se a GGT devolveu erro. */
export function parseXmlMain(op: GgtOperation, raw: string): Record<string, unknown> {
  let doc: Record<string, unknown>;
  try {
    doc = xmlParser.parse(raw) as Record<string, unknown>;
  } catch {
    throw new SupplierIntegrationError(`GGT ${op.name}: XML inválido na resposta`, { operation: op.name, sample: raw.slice(0, 300) });
  }
  const root = (doc.Root ?? {}) as Record<string, unknown>;
  const main = (root.Main ?? {}) as Record<string, unknown>;
  const err = main.Error;
  const opType = text((root.Header as Record<string, unknown> | undefined)?.OperationType);
  if (err !== undefined || opType === "Error") {
    const e = (Array.isArray(err) ? err[0] : err) as Record<string, unknown> | string | undefined;
    const code = typeof e === "object" && e ? text(e["@code"]) : "";
    const msg = text(e) || "erro sem descrição";
    const debug = text(main.DebugError) || null;
    throw new GgtApiError(code, msg, cleanDebug(debug), op.name);
  }
  return main;
}

function cleanDebug(s: string | null): string | null {
  if (!s) return null;
  return (
    s
      .replace(/If you cannot correct this problem yourself[\s\S]*$/i, "")
      .replace(/The following process did not complete in an orderly manner - \w+\s*/i, "")
      .replace(/The following may help resolve the issue:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

/** A tarifa sumiu entre a busca e a cotação (código expirado / esgotou). */
export function isOfferGone(e: unknown): boolean {
  return e instanceof GgtApiError && (e.code === "901" || /availability information missing|new availability search|no longer available|not available/i.test(`${e.message} ${e.debug ?? ""}`));
}

/** Busca sem resultado ("No Hotels Were Found Matching Searched Criteria!", código 1). */
export function isNoResults(e: unknown): boolean {
  return e instanceof GgtApiError && (e.code === "1" || /no hotels were found/i.test(e.message));
}

export function isNotFound(e: unknown): boolean {
  return e instanceof GgtApiError && (e.code === "4" || /does not exist|no bookings were found/i.test(e.message));
}

/** Erro "esperado" para o cliente (sem detalhes técnicos). */
export function customerError(e: unknown, fallback: string): SupplierError {
  if (e instanceof SupplierError && !(e instanceof SupplierIntegrationError)) return e;
  return new SupplierError(fallback);
}
