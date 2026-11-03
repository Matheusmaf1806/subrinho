import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";

/** Arquivos públicos das lojas (logos e imagens). Somente imagens marcadas como públicas. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Não encontrado", { status: 404 });
  const [f] = await db.select().from(files).where(and(eq(files.id, id), eq(files.isPublic, true)));
  if (!f || !["image/png", "image/jpeg", "image/webp"].includes(f.mimeType)) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(f.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
