import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { monogram, resolveTheme } from "@/lib/theme";

/** Favicon padrão da loja: monograma da agência na cor da marca (quando não há favicon próprio). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [a] = await db.select({ name: affiliates.name, brandColor: affiliates.brandColor, darkColor: affiliates.darkColor }).from(affiliates).where(eq(affiliates.slug, slug));
  if (!a) return new Response("Não encontrado", { status: 404 });
  const t = resolveTheme(a);
  const text = monogram(a.name).replace(/[^A-Z0-9?]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${t.brand}"/><text x="32" y="42" text-anchor="middle" font-family="Inter Tight, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="-1.5" fill="${t.brandFg}">${text}</text></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
