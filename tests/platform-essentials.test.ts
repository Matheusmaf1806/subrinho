/** Peças puras do pacote: TOTP, e-mail (layout e Resend), textos legais, link do pedido e WhatsApp. */
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newTotpSecret, openSecret, otpauthUrl, sealSecret, totpCode, verifyTotp } from "@/server/auth/totp";
import { esc, renderEmail } from "@/server/email/render";
import { emailConfig, fromHeader, resendSender } from "@/server/email/provider";
import { isEmail } from "@/server/email/outbox";
import { cancellationPolicy, privacyPolicy, termsOfUse } from "@/lib/legal";
import { orderAccessKey, validOrderAccessKey } from "@/server/order-access";
import { cartWhatsappText, whatsappLink } from "@/server/cart/reminders";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("verificação em duas etapas (TOTP)", () => {
  // vetor da RFC 6238 (SHA-1, segredo "12345678901234567890"), com 6 dígitos
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("bate com os vetores da RFC", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000)).toBe("081804");
    expect(totpCode(secret, 2000000000_000)).toBe("279037");
  });
  it("aceita o código atual e o vizinho (relógio fora), recusa o resto", () => {
    const now = 1111111109_000;
    expect(verifyTotp(secret, "081804", now)).toBe(true);
    expect(verifyTotp(secret, "081 804", now + 30_000)).toBe(true);
    expect(verifyTotp(secret, "081804", now + 120_000)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });
  it("segredo cifrado no banco e link do app", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    const sealed = sealSecret(s);
    expect(sealed).not.toContain(s);
    expect(openSecret(sealed)).toBe(s);
    expect(openSecret("v1.lixo")).toBeNull();
    expect(otpauthUrl("ana@subrinho.com.br", s)).toMatch(/^otpauth:\/\/totp\/Subrinho%3Aana%40subrinho\.com\.br\?secret=/);
  });
});

describe("e-mail", () => {
  it("escapa tudo o que vem de fora e gera a versão em texto", () => {
    const { html, text } = renderEmail(
      { name: "Viagens <Ana>", color: "#FFD400", siteUrl: "https://viagensdaana.com.br", footer: ["CNPJ 1"] },
      { title: "Olá <script>", paragraphs: ["Linha 1\nLinha 2"], items: [{ title: "Hotel & Spa", subtitle: "Paris", value: "R$ 10,00" }], cta: { label: "Ver", url: "https://x.com/p?a=1&b=2" } },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("Olá &lt;script&gt;");
    expect(html).toContain("Hotel &amp; Spa");
    expect(html).toContain("Linha 1<br>Linha 2");
    expect(html).toContain('href="https://x.com/p?a=1&amp;b=2"');
    expect(html).toContain("color:#0A0A0B"); // texto escuro sobre amarelo
    expect(text).toContain("- Hotel & Spa (Paris): R$ 10,00");
    expect(text).toContain("Ver: https://x.com/p?a=1&b=2");
    expect(esc(`"'`)).toBe("&quot;&#39;");
  });

  it("link fora de https/http não vira botão", () => {
    const { html } = renderEmail({ name: "Loja", color: "#000000" }, { title: "x", cta: { label: "Clique", url: "javascript:alert(1)" } });
    expect(html).not.toContain("javascript:");
  });

  it("configuração, remetente e validação de endereço", () => {
    expect(emailConfig(env({}))).toBeNull();
    expect(emailConfig(env({ RESEND_API_KEY: '"re_1"', EMAIL_FROM: "reservas@subrinho.com.br" }))).toMatchObject({ apiKey: "re_1", from: "reservas@subrinho.com.br" });
    expect(fromHeader('Viagens "da" <Ana>', "r@x.com")).toBe("Viagens da Ana <r@x.com>");
    expect(isEmail("ana@exemplo.com.br")).toBe(true);
    expect(isEmail("excluida-1@contas.invalid")).toBe(false);
    expect(isEmail("ana")).toBe(false);
  });

  it("Resend: chave de idempotência, sucesso, erro definitivo e erro para tentar de novo", async () => {
    const seen: { headers?: Record<string, string>; body?: Record<string, unknown> } = {};
    const fake = (status: number, body: unknown) =>
      (async (_u: string, init: RequestInit) => {
        seen.headers = init.headers as Record<string, string>;
        seen.body = JSON.parse(String(init.body));
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch;
    const cfg = { apiKey: "re_x", from: "reservas@subrinho.com.br", baseUrl: "https://api.resend.test" };
    const msg = { id: "abc", to: "c@c.com", toName: "Cliente", fromName: "Viagens da Ana", replyTo: "ana@agencia.com", subject: "Oi", html: "<p>oi</p>", text: "oi" };
    expect(await resendSender(cfg, fake(200, { id: "em_1" }))(msg)).toEqual({ ok: true, providerId: "em_1" });
    expect(seen.headers?.["Idempotency-Key"]).toBe("abc");
    expect(seen.body).toMatchObject({ from: "Viagens da Ana <reservas@subrinho.com.br>", to: ["Cliente <c@c.com>"], reply_to: "ana@agencia.com" });
    expect(await resendSender(cfg, fake(422, { message: "Invalid" }))(msg)).toMatchObject({ ok: false, retry: false });
    expect(await resendSender(cfg, fake(503, {}))(msg)).toMatchObject({ ok: false, retry: true });
  });
});

describe("textos legais", () => {
  const store = { name: "Viagens da Ana", legalName: "Ana Viagens Ltda.", document: "11.222.333/0001-81", cadastur: "12.3456", email: "ana@agencia.com", whatsapp: "5511999990000", policyNotes: "Reembolso no Pix em 5 dias úteis.", hasTracking: true };
  const company = { legalName: "Subrinho Tecnologia Ltda.", document: "00.000.000/0001-00", address: "", privacyEmail: "privacidade@subrinho.com.br" };
  const all = [termsOfUse(store, company), privacyPolicy(store, company), cancellationPolicy(store)];
  it("trazem a agência, a plataforma e as observações", () => {
    const t = JSON.stringify(all);
    expect(t).toContain("CNPJ 11.222.333/0001-81");
    expect(t).toContain("Cadastur 12.3456");
    expect(t).toContain("Subrinho Tecnologia Ltda.");
    expect(t).toContain("privacidade@subrinho.com.br");
    expect(t).toContain("Reembolso no Pix em 5 dias úteis.");
    expect(t).toContain("Meta (Facebook/Instagram)");
  });
  it("sem travessão e sem rastreamento quando a loja não usa", () => {
    expect(JSON.stringify(all)).not.toContain("—");
    expect(JSON.stringify(privacyPolicy({ name: "Loja" }, { legalName: "", document: "", address: "", privacyEmail: "" }))).not.toContain("Meta (Facebook");
  });
});

describe("links", () => {
  it("chave do pedido: só abre o próprio pedido", () => {
    const a = "0b7f6a4e-1111-4222-8333-444455556666";
    const b = "0b7f6a4e-1111-4222-8333-444455556667";
    const k = orderAccessKey(a);
    expect(k).toHaveLength(32);
    expect(validOrderAccessKey(a, k)).toBe(true);
    expect(validOrderAccessKey(b, k)).toBe(false);
    expect(validOrderAccessKey(a, null)).toBe(false);
    expect(validOrderAccessKey(a, `${k}x`)).toBe(false);
  });
  it("WhatsApp do carrinho: número brasileiro ganha o 55 e a mensagem vem pronta", () => {
    const text = cartWhatsappText({ storeName: "Viagens da Ana", customerName: "Carla Souza", link: "https://viagensdaana.com.br/carrinho/abc" });
    expect(text).toMatch(/^Oi, Carla! Aqui é da Viagens da Ana\./);
    expect(whatsappLink("(11) 99999-0000", text)).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/);
    expect(whatsappLink(null, "x")).toBe("https://wa.me/?text=x");
  });
});
