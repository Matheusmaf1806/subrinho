/**
 * PayPal — Orders API v2 (checkout com cartão ou conta PayPal, parcelamento conforme a conta Empresa).
 *
 * Autenticação OAuth2 "client credentials": POST /v1/oauth2/token com Basic client_id:secret →
 * token Bearer (≈ 9 h, reaproveitado; 401 → novo token uma vez).
 * O valor do pedido é sempre o do nosso banco (o navegador só recebe o id do pedido no PayPal), e a
 * captura só vale se valor, moeda e pedido conferirem (evaluatePaypalOrder).
 *
 * Ambientes: api-m.paypal.com (produção) e api-m.sandbox.paypal.com (testes).
 */
import { randomUUID } from "node:crypto";

export type PaypalConfig = { clientId: string; clientSecret: string; baseUrl: string; environment: "live" | "sandbox"; webhookId: string | null };

const first = (env: NodeJS.ProcessEnv, ...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);

export function paypalConfig(env: NodeJS.ProcessEnv = process.env): PaypalConfig | null {
  const clientId = first(env, "PAYPAL_CLIENT_ID");
  const clientSecret = first(env, "PAYPAL_CLIENT_SECRET", "PAYPAL_SECRET");
  if (!clientId || !clientSecret) return null;
  const explicit = first(env, "PAYPAL_API_BASE", "PAYPAL_API_URL");
  const sandbox = explicit ? /sandbox/i.test(explicit) : /^sandbox|^test/i.test(first(env, "PAYPAL_ENVIRONMENT") ?? "");
  const baseUrl = (explicit ?? (sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com")).replace(/\/+$/, "");
  return { clientId, clientSecret, baseUrl, environment: sandbox ? "sandbox" : "live", webhookId: first(env, "PAYPAL_WEBHOOK_ID") ?? null };
}

export function paypalMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ["PAYPAL_CLIENT_ID", first(env, "PAYPAL_CLIENT_ID")],
    ["PAYPAL_CLIENT_SECRET", first(env, "PAYPAL_CLIENT_SECRET", "PAYPAL_SECRET")],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n as string);
}

export class PaypalApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issue: string | null,
    readonly debugId: string | null,
    message: string,
    readonly path: string,
  ) {
    super(`PayPal ${path}: ${message}${issue ? ` (${issue})` : code ? ` (${code})` : ""} [HTTP ${status}]${debugId ? ` debug_id ${debugId}` : ""}`);
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

type Money = { currency_code?: string; value?: string };
export type PaypalCapture = {
  id?: string;
  status?: string;
  status_details?: { reason?: string };
  amount?: Money;
  custom_id?: string;
  invoice_id?: string;
  create_time?: string;
  seller_receivable_breakdown?: { gross_amount?: Money; paypal_fee?: Money; net_amount?: Money };
  supplementary_data?: { related_ids?: { order_id?: string } };
};
export type PaypalOrder = {
  id?: string;
  status?: string;
  intent?: string;
  purchase_units?: { reference_id?: string; custom_id?: string; invoice_id?: string; amount?: Money; payments?: { captures?: PaypalCapture[] } }[];
  payer?: { email_address?: string; payer_id?: string; name?: { given_name?: string; surname?: string } };
  payment_source?: Record<string, { email_address?: string; brand?: string; last_digits?: string; name?: string } | undefined>;
  links?: { href: string; rel: string; method?: string }[];
};

type ErrorRS = { name?: string; message?: string; debug_id?: string; details?: { issue?: string; description?: string }[]; error?: string; error_description?: string };

export class PaypalClient {
  private token: { value: string; until: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    readonly cfg: PaypalConfig,
    private readonly transport: Transport = fetchTransport,
  ) {}

  async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.until > Date.now() + 120_000) return this.token.value;
    if (this.pending) return this.pending;
    this.pending = this.fetchToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const rs = await this.raw<{ access_token?: string; expires_in?: number }>("POST", "/v1/oauth2/token", "grant_type=client_credentials", {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    if (!rs.access_token) throw new PaypalApiError(500, "NO_TOKEN", null, null, "resposta sem access_token", "/v1/oauth2/token");
    this.token = { value: rs.access_token, until: Date.now() + Math.max(300, Number(rs.expires_in) || 3600) * 1000 };
    return rs.access_token;
  }

  async request<T>(method: string, path: string, body?: unknown, opts: { requestId?: string; timeoutMs?: number } = {}): Promise<T> {
    const headers = (token: string): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.requestId ? { "PayPal-Request-Id": opts.requestId } : {}),
    });
    const payload = body === undefined ? undefined : JSON.stringify(body);
    try {
      return await this.raw<T>(method, path, payload, headers(await this.accessToken()), opts.timeoutMs);
    } catch (e) {
      if (e instanceof PaypalApiError && e.status === 401) return this.raw<T>(method, path, payload, headers(await this.accessToken(true)), opts.timeoutMs);
      throw e;
    }
  }

  private async raw<T>(method: string, path: string, body: string | undefined, headers: Record<string, string>, timeoutMs = 30_000): Promise<T> {
    const label = path.split("?")[0];
    let res: HttpResponse;
    try {
      res = await this.transport({ url: `${this.cfg.baseUrl}${path}`, method, headers: { Accept: "application/json", ...headers }, body, timeoutMs });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      const timeout = err.name === "AbortError" || err.name === "TimeoutError";
      throw new PaypalApiError(0, timeout ? "TIMEOUT" : "NETWORK", null, null, timeout ? `sem resposta em ${Math.round(timeoutMs / 1000)} s` : `falha de conexão (${err.code ?? err.message})`, label);
    }
    let data: unknown = null;
    try {
      data = res.body ? JSON.parse(res.body) : null;
    } catch {
      data = null;
    }
    if (res.status >= 400) {
      const e = (data ?? {}) as ErrorRS;
      const issue = e.details?.[0]?.issue ?? null;
      const msg =
        res.status === 401 && label === "/v1/oauth2/token"
          ? `${e.error_description || "credenciais recusadas"} — confira PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET e o ambiente (${this.cfg.baseUrl})`
          : e.details?.[0]?.description || e.message || e.error_description || res.body.slice(0, 200) || "erro sem descrição";
      throw new PaypalApiError(res.status, e.name ?? e.error ?? "", issue, e.debug_id ?? null, msg, label);
    }
    return (data ?? {}) as T;
  }

  /** Cria o pedido no PayPal com o valor do nosso pedido (o comprador aprova nos botões do PayPal). */
  createOrder(o: { orderId: string; orderNumber: number; amount: string; description: string; brandName: string }) {
    return this.request<PaypalOrder>(
      "POST",
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: o.orderId,
            custom_id: o.orderId,
            invoice_id: `SUB${o.orderNumber}`,
            description: o.description.slice(0, 127),
            amount: { currency_code: "BRL", value: o.amount },
          },
        ],
        application_context: { brand_name: o.brandName.slice(0, 127), locale: "pt-BR", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
      },
      { requestId: randomUUID() },
    );
  }

  getOrder(id: string) {
    return this.request<PaypalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`);
  }

  /** Captura (idempotente: o mesmo PayPal-Request-Id devolve o mesmo resultado). */
  captureOrder(id: string) {
    return this.request<PaypalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, { requestId: `capture-${id}`, timeoutMs: 60_000 });
  }

  /** Confere a assinatura de um webhook (precisa do PAYPAL_WEBHOOK_ID). */
  async verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
    if (!this.cfg.webhookId) return false;
    const h = (n: string) => headers.get(n) ?? "";
    const rs = await this.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: this.cfg.webhookId,
      webhook_event: event,
    });
    return rs.verification_status === "SUCCESS";
  }
}

// ───────────── Regras (puras) ─────────────

export type PaypalOutcome =
  | { state: "PAID"; captureId: string; amount: string; fee: string | null; net: string | null; payer: string | null; method: string | null }
  | { state: "PENDING"; captureId: string | null; reason: string | null }
  | { state: "APPROVED" }
  | { state: "AWAITING_BUYER"; status: string }
  | { state: "DECLINED"; captureId: string | null; status: string }
  | { state: "REFUNDED"; captureId: string | null; status: string }
  | { state: "VOIDED" }
  | { state: "MISMATCH"; reason: string };

const cents = (v: string | undefined) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100));

/** O que o pedido do PayPal significa para o nosso pedido — confere pedido, moeda e valor. */
export function evaluatePaypalOrder(o: PaypalOrder, expect: { orderId: string; amount: string }): PaypalOutcome {
  const pu = o.purchase_units?.[0];
  if (pu && (pu.custom_id ?? pu.reference_id) !== expect.orderId) return { state: "MISMATCH", reason: `pedido do PayPal pertence a outro pedido (${pu.custom_id ?? pu.reference_id ?? "?"})` };
  const status = (o.status ?? "").toUpperCase();
  if (status === "APPROVED") return { state: "APPROVED" };
  if (status === "VOIDED") return { state: "VOIDED" };
  if (status !== "COMPLETED") return { state: "AWAITING_BUYER", status: status || "?" };
  const cap = pu?.payments?.captures?.[0];
  if (!cap) return { state: "AWAITING_BUYER", status };
  const cs = (cap.status ?? "").toUpperCase();
  if (cs === "DECLINED" || cs === "FAILED") return { state: "DECLINED", captureId: cap.id ?? null, status: cs };
  if (cap.amount?.currency_code !== "BRL" || cents(cap.amount?.value) !== cents(expect.amount))
    return { state: "MISMATCH", reason: `valor capturado ${cap.amount?.currency_code ?? "?"} ${cap.amount?.value ?? "?"} ≠ BRL ${expect.amount}` };
  if (cs === "PENDING") return { state: "PENDING", captureId: cap.id ?? null, reason: cap.status_details?.reason ?? null };
  if (cs === "REFUNDED" || cs === "PARTIALLY_REFUNDED") return { state: "REFUNDED", captureId: cap.id ?? null, status: cs };
  if (cs !== "COMPLETED") return { state: "AWAITING_BUYER", status: cs || "?" };
  const b = cap.seller_receivable_breakdown;
  const source = o.payment_source ?? {};
  const method = source.card ? `Cartão${source.card.brand ? ` ${source.card.brand}` : ""}${source.card.last_digits ? ` final ${source.card.last_digits}` : ""}` : source.paypal ? "Conta PayPal" : Object.keys(source)[0] ?? null;
  return {
    state: "PAID",
    captureId: cap.id ?? "",
    amount: cap.amount.value!,
    fee: b?.paypal_fee?.value ?? null,
    net: b?.net_amount?.value ?? null,
    payer: source.paypal?.email_address ?? o.payer?.email_address ?? null,
    method,
  };
}

/** Motivo de captura pendente em português (para o cliente e o painel). */
export function pendingReasonPt(reason: string | null): string {
  switch (reason) {
    case "PENDING_REVIEW":
      return "em análise de segurança pelo PayPal";
    case "ECHECK":
      return "aguardando compensação no PayPal";
    case "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION":
    case "UNILATERAL":
    case "VERIFICATION_REQUIRED":
      return "aguardando aceite na conta PayPal da empresa";
    default:
      return "em processamento no PayPal";
  }
}

let shared: { key: string; client: PaypalClient } | null = null;

/** Cliente compartilhado (reaproveita o token entre requisições da mesma instância). */
export function paypalClient(env: NodeJS.ProcessEnv = process.env): PaypalClient | null {
  const cfg = paypalConfig(env);
  if (!cfg) return null;
  const key = `${cfg.baseUrl}|${cfg.clientId}|${cfg.clientSecret.slice(-6)}|${cfg.webhookId ?? ""}`;
  if (shared?.key !== key) shared = { key, client: new PaypalClient(cfg) };
  return shared.client;
}
