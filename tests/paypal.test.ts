/**
 * PayPal: configuração, escolha do provedor, conferência da captura e cliente HTTP (sem rede).
 */
import { describe, expect, it } from "vitest";
import { evaluatePaypalOrder, PaypalApiError, PaypalClient, paypalConfig, type PaypalOrder, type Transport } from "@/server/payments/paypal";
import { paymentProviderName } from "@/server/payments/provider";

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const ORDER = "6f1c1a4e-1111-4c4c-9d9d-123456789abc";

describe("PayPal — configuração e provedor", () => {
  it("variáveis da Vercel (PAYPAL_*); produção por padrão; sandbox pela URL", () => {
    expect(paypalConfig(env({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s", PAYPAL_API_BASE: "https://api.paypal.com/" }))).toMatchObject({ baseUrl: "https://api.paypal.com", environment: "live", webhookId: null });
    expect(paypalConfig(env({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s" }))!.baseUrl).toBe("https://api-m.paypal.com");
    expect(paypalConfig(env({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s", PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com" }))!.environment).toBe("sandbox");
    expect(paypalConfig(env({ PAYPAL_CLIENT_ID: "id" }))).toBeNull();
  });

  it("com credenciais do PayPal o gateway liga sozinho; PAYMENT_PROVIDER=mock força o simulado", () => {
    expect(paymentProviderName(env({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s" }))).toBe("paypal");
    expect(paymentProviderName(env({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s", PAYMENT_PROVIDER: "mock" }))).toBe("mock");
    expect(paymentProviderName(env({}))).toBe("mock");
  });
});

const completed = (o: Partial<{ amount: string; currency: string; status: string; custom: string; reason: string }> = {}): PaypalOrder => ({
  id: "PP1",
  status: "COMPLETED",
  payment_source: { card: { brand: "VISA", last_digits: "4242" } },
  purchase_units: [
    {
      custom_id: o.custom ?? ORDER,
      payments: {
        captures: [
          {
            id: "CAP1",
            status: o.status ?? "COMPLETED",
            ...(o.reason ? { status_details: { reason: o.reason } } : {}),
            amount: { currency_code: o.currency ?? "BRL", value: o.amount ?? "1234.50" },
            seller_receivable_breakdown: { paypal_fee: { value: "60.20" }, net_amount: { value: "1174.30" } },
          },
        ],
      },
    },
  ],
});

describe("PayPal — conferência do pagamento", () => {
  const expect_ = { orderId: ORDER, amount: "1234.5" };
  it("capturado com o valor e a moeda do pedido → pago (com tarifa, líquido e meio)", () => {
    expect(evaluatePaypalOrder(completed(), expect_)).toEqual({ state: "PAID", captureId: "CAP1", amount: "1234.50", fee: "60.20", net: "1174.30", payer: null, method: "Cartão VISA final 4242" });
  });
  it("valor, moeda ou pedido diferentes → não paga", () => {
    expect(evaluatePaypalOrder(completed({ amount: "1.00" }), expect_).state).toBe("MISMATCH");
    expect(evaluatePaypalOrder(completed({ currency: "USD" }), expect_).state).toBe("MISMATCH");
    expect(evaluatePaypalOrder(completed({ custom: "outro" }), expect_).state).toBe("MISMATCH");
  });
  it("captura pendente, recusada, aprovado sem captura e aguardando o comprador", () => {
    expect(evaluatePaypalOrder(completed({ status: "PENDING", reason: "PENDING_REVIEW" }), expect_)).toEqual({ state: "PENDING", captureId: "CAP1", reason: "PENDING_REVIEW" });
    expect(evaluatePaypalOrder(completed({ status: "DECLINED" }), expect_).state).toBe("DECLINED");
    expect(evaluatePaypalOrder({ status: "APPROVED", purchase_units: [{ custom_id: ORDER }] }, expect_).state).toBe("APPROVED");
    expect(evaluatePaypalOrder({ status: "CREATED", purchase_units: [{ custom_id: ORDER }] }, expect_)).toEqual({ state: "AWAITING_BUYER", status: "CREATED" });
    expect(evaluatePaypalOrder({ status: "PAYER_ACTION_REQUIRED", purchase_units: [{ custom_id: ORDER }] }, expect_).state).toBe("AWAITING_BUYER");
  });
});

describe("PayPal — cliente HTTP", () => {
  const cfg = paypalConfig(env({ PAYPAL_CLIENT_ID: "cli", PAYPAL_CLIENT_SECRET: "sec", PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com" }))!;

  it("token Basic + form, reaproveitado; 401 → novo token uma vez; erro com o motivo do PayPal", async () => {
    const calls: { method: string; path: string; headers: Record<string, string>; body?: string }[] = [];
    let tokens = 0;
    let expireOnce = true;
    const transport: Transport = async (req) => {
      const path = new URL(req.url).pathname;
      calls.push({ method: req.method, path, headers: req.headers, body: req.body });
      if (path === "/v1/oauth2/token") return { status: 200, body: JSON.stringify({ access_token: `T${++tokens}`, expires_in: 32400 }) };
      if (expireOnce && req.headers.Authorization === "Bearer T1") {
        expireOnce = false;
        return { status: 401, body: JSON.stringify({ name: "AUTHENTICATION_FAILURE" }) };
      }
      if (path.endsWith("/capture")) return { status: 422, body: JSON.stringify({ name: "UNPROCESSABLE_ENTITY", debug_id: "dbg1", details: [{ issue: "INSTRUMENT_DECLINED", description: "The instrument presented was either declined" }] }) };
      return { status: 200, body: JSON.stringify({ id: "PP1", status: "CREATED" }) };
    };
    const c = new PaypalClient(cfg, transport);
    const created = await c.createOrder({ orderId: ORDER, orderNumber: 1042, amount: "99.90", description: "Pedido #1042 · Viagens da Ana", brandName: "Viagens da Ana" });
    expect(created.id).toBe("PP1");
    const tok = calls.find((x) => x.path === "/v1/oauth2/token")!;
    expect(tok.headers.Authorization).toBe(`Basic ${Buffer.from("cli:sec").toString("base64")}`);
    expect(tok.body).toBe("grant_type=client_credentials");
    const post = calls.filter((x) => x.path === "/v2/checkout/orders").at(-1)!;
    const body = JSON.parse(post.body!);
    expect(body).toMatchObject({ intent: "CAPTURE", purchase_units: [{ custom_id: ORDER, invoice_id: "SUB1042", amount: { currency_code: "BRL", value: "99.90" } }], application_context: { shipping_preference: "NO_SHIPPING", locale: "pt-BR" } });
    expect(post.headers["PayPal-Request-Id"]).toBeTruthy();
    expect(tokens).toBe(2); // o primeiro token foi recusado e renovado
    await c.getOrder("PP1");
    expect(tokens).toBe(2); // reaproveitado
    const err = await c.captureOrder("PP1").catch((e) => e);
    expect(err).toBeInstanceOf(PaypalApiError);
    expect(err.issue).toBe("INSTRUMENT_DECLINED");
    expect(err.message).toContain("debug_id dbg1");
    expect(calls.find((x) => x.path.endsWith("/capture"))!.headers["PayPal-Request-Id"]).toBe("capture-PP1");
  });

  it("credenciais recusadas: mensagem diz o que conferir", async () => {
    const c = new PaypalClient(cfg, async () => ({ status: 401, body: JSON.stringify({ error: "invalid_client", error_description: "Client Authentication failed" }) }));
    await expect(c.accessToken()).rejects.toThrow(/Client Authentication failed, confira PAYPAL_CLIENT_ID\/PAYPAL_CLIENT_SECRET/);
  });

  it("webhook: sem PAYPAL_WEBHOOK_ID não confere assinatura; com ele, pergunta ao PayPal", async () => {
    const noHook = new PaypalClient(cfg, async () => ({ status: 200, body: "{}" }));
    expect(await noHook.verifyWebhook(new Headers(), {})).toBe(false);
    const seen: string[] = [];
    const c = new PaypalClient({ ...cfg, webhookId: "WH1" }, async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/v1/oauth2/token") return { status: 200, body: JSON.stringify({ access_token: "T", expires_in: 32400 }) };
      seen.push(req.body ?? "");
      return { status: 200, body: JSON.stringify({ verification_status: "SUCCESS" }) };
    });
    expect(await c.verifyWebhook(new Headers({ "paypal-transmission-id": "tx1", "paypal-auth-algo": "SHA256withRSA" }), { id: "EV1" })).toBe(true);
    expect(JSON.parse(seen[0])).toMatchObject({ webhook_id: "WH1", transmission_id: "tx1", auth_algo: "SHA256withRSA", webhook_event: { id: "EV1" } });
  });
});
