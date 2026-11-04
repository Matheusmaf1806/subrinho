/** Foto de fornecedor servida pelo domínio da loja (ver src/server/media.ts). */
import { mediaSource } from "@/server/media";

const MAX_BYTES = 12 * 1024 * 1024;

export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const src = mediaSource(token);
  if (!src) return new Response(null, { status: 404 });
  const get = (url: string) => fetch(url, { headers: { Accept: "image/*", "User-Agent": "Mozilla/5.0 (compatible; media)" }, signal: AbortSignal.timeout(15_000) });
  let res: Response;
  try {
    res = await get(src);
    // foto pedida num tamanho maior que não existe (ex.: …_z.jpg) → volta ao tamanho original (…_b.jpg)
    const original = src.replace(/_[yz]\.(jpe?g)$/i, "_b.$1");
    if (!res.ok && original !== src) res = await get(original);
  } catch {
    return new Response(null, { status: 504 });
  }
  const type = res.headers.get("content-type") ?? "";
  const size = Number(res.headers.get("content-length") ?? 0);
  if (!res.ok || !type.startsWith("image/") || size > MAX_BYTES) return new Response(null, { status: res.ok ? 415 : 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": type,
      ...(size ? { "Content-Length": String(size) } : {}),
      // a foto do fornecedor não muda para o mesmo endereço: cache longo no navegador e na CDN
      "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
