/**
 * Fotos de fornecedor servidas pelo domínio da loja: o endereço original (que revela o fornecedor,
 * ex.: photos.hotelbeds.com) vira /m/<token cifrado>. O token é determinístico (mesma foto → mesmo
 * endereço, bom para cache) e só o servidor sabe abrir. Somente no servidor (node:crypto).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";

const keyOf = () =>
  createHash("sha256")
    .update(`subrinho-media|${process.env.MEDIA_SECRET ?? process.env.CRON_SECRET ?? process.env.DATABASE_URL ?? "subrinho"}`)
    .digest();

/** Fotos ilustrativas próprias (não são de fornecedor) continuam diretas. */
const PUBLIC_HOSTS = /^https:\/\/images\.unsplash\.com\//;

export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") || PUBLIC_HOSTS.test(url) || !/^https?:\/\//i.test(url)) return url;
  const key = keyOf();
  const iv = createHmac("sha256", key).update(url).digest().subarray(0, 12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(url, "utf8"), c.final()]);
  return `/m/${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url")}`;
}

export function mediaUrls(urls: (string | null | undefined)[] | null | undefined): string[] {
  return (urls ?? []).map(mediaUrl).filter((u): u is string => !!u);
}

/** Endereço original de um token (null se inválido/adulterado). */
export function mediaSource(token: string): string | null {
  try {
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 12 + 16 + 8) return null;
    const d = createDecipheriv("aes-256-gcm", keyOf(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const url = Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}
