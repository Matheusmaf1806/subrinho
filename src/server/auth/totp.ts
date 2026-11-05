/**
 * Verificação em duas etapas (TOTP, RFC 6238): o mesmo código de 6 dígitos do Google Authenticator,
 * Microsoft Authenticator, 1Password etc. O segredo fica cifrado no banco (AES-256-GCM) com a chave
 * AUTH_SECRET (ou, sem ela, derivada do CRON_SECRET). Trocar essa chave invalida os segredos
 * cadastrados: cada pessoa precisa ligar a verificação de novo.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, at = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Janela de 30 s em que o código vale (para impedir reusar o mesmo código). */
export const totpStep = (at: number) => Math.floor(at / 1000 / 30);

/** Passo (janela de 30 s) do código digitado, aceitando o vizinho (±30 s) para relógio um pouco fora; null se não bate. */
export function matchTotp(secret: string, code: string, at = Date.now()): number | null {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return null;
  for (const w of [0, -1, 1]) {
    const want = Buffer.from(totpCode(secret, at + w * 30_000));
    if (timingSafeEqual(want, Buffer.from(c))) return totpStep(at + w * 30_000);
  }
  return null;
}

export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  return matchTotp(secret, code, at) !== null;
}

export function otpauthUrl(account: string, secret: string, issuer = "Subrinho") {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const key = () => createHash("sha256").update(`subrinho-totp|${process.env.AUTH_SECRET ?? process.env.CRON_SECRET ?? process.env.DATABASE_URL ?? "subrinho"}`).digest();

export function sealSecret(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url")}`;
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed?.startsWith("v1.")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
