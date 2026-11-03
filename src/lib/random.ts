import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Código curto e legível (para links de carrinho compartilhado). */
export function shortCode(length = 10): string {
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
