/**
 * Provedor de pagamento. O "mock" simula Pix e cartão para desenvolvimento/homologação.
 * Para produção, implemente PaymentProvider com o gateway escolhido e confirme os pagamentos
 * via webhook (src/app/api/payments/webhook/route.ts) chamando markOrderPaid().
 */
import { buildPixBrCode } from "./pix";
import { randomToken } from "@/lib/random";

export type PixCharge = { txid: string; brCode: string; expiresAt: string };
export type CardInput = { holder: string; number: string; expiry: string; cvv: string; installments: number };
export type CardResult = { approved: boolean; ref: string; message: string; last4: string; brand: string };

export interface PaymentProvider {
  name: string;
  createPix(o: { orderNumber: number; amount: string; expiresInMinutes: number }): Promise<PixCharge>;
  chargeCard(o: { orderNumber: number; amount: string; card: CardInput }): Promise<CardResult>;
}

function brandOf(n: string) {
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return "Elo";
  return "Cartão";
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createPix(o) {
    const txid = `SUB${o.orderNumber}${randomToken(6).replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 25);
    return {
      txid,
      brCode: buildPixBrCode({
        key: process.env.PIX_KEY ?? "financeiro@subrinho.com.br",
        amount: o.amount,
        merchantName: process.env.PIX_MERCHANT_NAME ?? "SUBRINHO",
        merchantCity: process.env.PIX_MERCHANT_CITY ?? "SAO PAULO",
        txid,
      }),
      expiresAt: new Date(Date.now() + o.expiresInMinutes * 60000).toISOString(),
    };
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

export function paymentProvider(): PaymentProvider {
  switch (process.env.PAYMENT_PROVIDER ?? "mock") {
    default:
      return mockProvider;
  }
}

export const isMockPayments = () => (process.env.PAYMENT_PROVIDER ?? "mock") === "mock";
