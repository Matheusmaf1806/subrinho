import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf } from "@/lib/br";
import { buildPixBrCode, crc16 } from "@/server/payments/pix";

describe("documentos", () => {
  it("CPF", () => {
    expect(isValidCpf("123.456.789-09")).toBe(true);
    expect(isValidCpf("987.654.321-00")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });
  it("CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
  });
});

describe("Pix copia e cola", () => {
  it("CRC16 CCITT-FALSE", () => expect(crc16("123456789")).toBe("29B1"));
  it("payload EMV com valor e CRC", () => {
    const code = buildPixBrCode({ key: "financeiro@subrinho.com.br", amount: "2680.32", merchantName: "Subrinho", merchantCity: "São Paulo", txid: "SUB123" });
    expect(code.startsWith("000201")).toBe(true);
    expect(code).toContain("br.gov.bcb.pix");
    expect(code).toContain("54072680.32");
    expect(code).toContain("5802BR");
    expect(code.slice(-8, -4)).toBe("6304");
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });
});
