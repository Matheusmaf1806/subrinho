/**
 * Provedor de pagamento.
 * - "paypal": cartão/conta PayPal no checkout do PayPal (botões na página do pedido; captura e
 *   conferência em src/server/payments/paypal-checkout.ts). Liga sozinho quando PAYPAL_CLIENT_ID e
 *   PAYPAL_CLIENT_SECRET existem (PAYMENT_PROVIDER=mock força o simulado).
 * - "mock": simula Pix e cartão para desenvolvimento/homologação — todo pagamento fica marcado como
 *   simulado (não emite reserva real nem gera repasse).
 * Pix com gateway real: QR Code da chave PIX_KEY e confirmação no Painel Subrinho (sem chave, o Pix
 * não é oferecido).
 */
import { buildPixBrCode } from "./pix";
import { paypalConfig } from "./paypal";
import { randomToken } from "@/lib/random";

export type PixCharge = { txid: string; brCode: string; expiresAt: string };
export type CardInput = { holder: string; number: string; expiry: string; cvv: string; installments: number };
export type CardResult = { approved: boolean; ref: string; message: string; last4: string; brand: string };

export interface PaymentProvider {
  name: "mock" | "paypal";
  /** "inline": cartão digitado na loja; "paypal": o cliente paga nos botões do PayPal na página do pedido. */
  cardCheckout: "inline" | "paypal";
  /** Pix oferecido no checkout? */
  pixAvailable: boolean;
  /** Pix confirmado automaticamente pelo gateway? (senão, pela equipe no painel) */
  pixAutoConfirm: boolean;
  createPix(o: { orderNumber: number; amount: string; expiresInMinutes: number }): Promise<PixCharge>;
  chargeCard?(o: { orderNumber: number; amount: string; card: CardInput }): Promise<CardResult>;
}

function brandOf(n: string) {
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return "Elo";
  return "Cartão";
}

function staticPix(o: { orderNumber: number; amount: string; expiresInMinutes: number }): PixCharge {
  const txid = `SUB${o.orderNumber}${randomToken(6).replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 25);
  return {
    txid,
    brCode: buildPixBrCode({
      key: process.env.PIX_KEY?.trim() ?? "financeiro@subrinho.com.br",
      amount: o.amount,
      merchantName: process.env.PIX_MERCHANT_NAME ?? "SUBRINHO",
      merchantCity: process.env.PIX_MERCHANT_CITY ?? "SAO PAULO",
      txid,
    }),
    expiresAt: new Date(Date.now() + o.expiresInMinutes * 60000).toISOString(),
  };
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  cardCheckout: "inline",
  pixAvailable: true,
  pixAutoConfirm: false,
  async createPix(o) {
    return staticPix(o);
  },
  async chargeCard(o) {
    const digits = o.card.number.replace(/\D/g, "");
    const last4 = digits.slice(-4);
    // Cartão de teste: final 0002 = recusado; qualquer outro = aprovado.
    const approved = digits.length >= 13 && !digits.endsWith("0002");
    return {
      approved,
      ref: `MOCK-${randomToken(8)}`,
      message: approved ? "Pagamento aprovado" : "Pagamento recusado pela operadora",
      last4,
      brand: brandOf(digits),
    };
  },
};

export const paypalProvider: PaymentProvider = {
  name: "paypal",
  cardCheckout: "paypal",
  get pixAvailable() {
    return !!process.env.PIX_KEY?.trim();
  },
  pixAutoConfirm: false,
  async createPix(o) {
    if (!process.env.PIX_KEY?.trim()) throw new Error("Pix indisponível: PIX_KEY não configurada");
    return staticPix(o);
  },
};

/** "paypal" quando há credenciais do PayPal (ou PAYMENT_PROVIDER=paypal); "mock" caso contrário. */
export function paymentProviderName(env: NodeJS.ProcessEnv = process.env): "mock" | "paypal" {
  const forced = env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (forced === "mock") return "mock";
  return paypalConfig(env) ? "paypal" : "mock";
}

export function paymentProvider(): PaymentProvider {
  return paymentProviderName() === "paypal" ? paypalProvider : mockProvider;
}

export const isMockPayments = () => paymentProviderName() === "mock";
