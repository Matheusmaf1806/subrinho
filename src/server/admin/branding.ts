/**
 * White-label: identidade visual de cada loja (cores, fonte, logos, hero, rodapé).
 * Usado pelo Painel do Afiliado (ADMIN) e pelo Painel Subrinho.
 */
import { eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates, files, type UserType } from "@/server/db/schema";
import { contrast, HEX_RE, WHITE } from "@/lib/color";
import { FONT_OPTIONS, MIN_DARK_CONTRAST } from "@/lib/theme";
import { PHOTO, photo } from "@/lib/images";

export class BrandingError extends Error {}

export type BrandingInput = {
  brandColor: string;
  darkColor: string;
  fontFamily: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
  faviconUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroImage2Url: string | null;
  tagline: string | null;
  instagram: string | null;
  showPoweredBy?: boolean;
};

export const IMAGE_FIELDS = ["logoUrl", "logoOnDarkUrl", "faviconUrl", "heroImageUrl", "heroImage2Url"] as const;
export type ImageField = (typeof IMAGE_FIELDS)[number];

/** Limites por arquivo. A Vercel aceita até 4,5 MB por requisição (soma de todos os arquivos enviados juntos). */
const MAX_BYTES: Record<ImageField, number> = {
  logoUrl: 1024 * 1024,
  logoOnDarkUrl: 1024 * 1024,
  faviconUrl: 512 * 1024,
  heroImageUrl: 3 * 1024 * 1024,
  heroImage2Url: 3 * 1024 * 1024,
};

const LABEL: Record<ImageField, string> = {
  logoUrl: "Logo",
  logoOnDarkUrl: "Logo para fundo escuro",
  faviconUrl: "Ícone da aba",
  heroImageUrl: "Imagem principal",
  heroImage2Url: "Imagem secundária",
};

/** Confere o tipo real pelo conteúdo (não confia no navegador). SVG não é aceito (pode conter script). */
export function sniffImage(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export const publicFileUrl = (id: string) => `/api/public/files/${id}`;

export async function savePublicImage(tx: Tx, field: ImageField, file: File, by: { type: UserType; id: string }): Promise<string> {
  if (file.size > MAX_BYTES[field]) {
    const max = MAX_BYTES[field] >= 1024 * 1024 ? `${MAX_BYTES[field] / 1024 / 1024} MB` : `${MAX_BYTES[field] / 1024} KB`;
    throw new BrandingError(`${LABEL[field]}: arquivo maior que ${max}`);
  }
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(data);
  if (!mime) throw new BrandingError(`${LABEL[field]}: envie PNG, JPG ou WEBP`);
  const [f] = await tx
    .insert(files)
    .values({ filename: (file.name || "imagem").slice(0, 200), mimeType: mime, size: data.length, data, isPublic: true, uploadedByType: by.type, uploadedById: by.id })
    .returning({ id: files.id });
  return publicFileUrl(f.id);
}

function validUrl(v: string): boolean {
  if (v.startsWith("/api/public/files/")) return /^\/api\/public\/files\/[0-9a-f-]{36}$/i.test(v);
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

const trimOrNull = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

/** Lê o formulário do editor de marca (uploads, URLs, fotos prontas e "remover"). */
export async function brandingFromForm(
  tx: Tx,
  fd: FormData,
  by: { type: UserType; id: string },
  opts: { allowPoweredBy: boolean },
): Promise<BrandingInput> {
  const images = {} as Record<ImageField, string | null>;
  for (const field of IMAGE_FIELDS) {
    const file = fd.get(`${field}File`);
    if (file instanceof File && file.size > 0) {
      images[field] = await savePublicImage(tx, field, file, by);
      continue;
    }
    if (fd.get(`${field}Remove`) === "on") {
      images[field] = null;
      continue;
    }
    const raw = trimOrNull(fd.get(field));
    if (raw?.startsWith("preset:")) {
      const key = raw.slice(7);
      if (!(key in PHOTO)) throw new BrandingError(`${LABEL[field]}: foto inválida`);
      images[field] = photo(key, field === "heroImageUrl" ? 1200 : 900, field === "heroImageUrl" ? 1500 : 1000);
      continue;
    }
    if (raw && !validUrl(raw)) throw new BrandingError(`${LABEL[field]}: use um link https://`);
    images[field] = raw;
  }
  return {
    brandColor: String(fd.get("brandColor") ?? "").trim(),
    darkColor: String(fd.get("darkColor") ?? "").trim(),
    fontFamily: String(fd.get("fontFamily") ?? "").trim(),
    heroTitle: trimOrNull(fd.get("heroTitle")),
    heroSubtitle: trimOrNull(fd.get("heroSubtitle")),
    tagline: trimOrNull(fd.get("tagline")),
    instagram: trimOrNull(fd.get("instagram"))?.replace(/^@/, "") ?? null,
    ...images,
    ...(opts.allowPoweredBy ? { showPoweredBy: fd.get("showPoweredBy") === "on" } : {}),
  };
}

export function validateBranding(b: BrandingInput) {
  if (!HEX_RE.test(b.brandColor)) throw new BrandingError("Cor principal inválida (use #RRGGBB)");
  if (!HEX_RE.test(b.darkColor)) throw new BrandingError("Cor escura inválida (use #RRGGBB)");
  if (contrast(b.darkColor, WHITE) < MIN_DARK_CONTRAST)
    throw new BrandingError("A cor escura precisa ser bem escura: ela também é usada em textos (contraste mínimo de 7:1 com o branco)");
  if (!FONT_OPTIONS.some((f) => f.id === b.fontFamily)) throw new BrandingError("Fonte inválida");
  if (b.heroTitle && (b.heroTitle.length > 80 || b.heroTitle.split(/\r?\n/).length > 3)) throw new BrandingError("Título da página inicial: até 80 caracteres e 3 linhas");
  if (b.heroSubtitle && b.heroSubtitle.length > 220) throw new BrandingError("Subtítulo: até 220 caracteres");
  if (b.tagline && b.tagline.length > 120) throw new BrandingError("Frase do rodapé: até 120 caracteres");
  if (b.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(b.instagram)) throw new BrandingError("Instagram inválido (use só o @usuário)");
}

export async function updateBranding(tx: Tx, affiliateId: string, b: BrandingInput) {
  validateBranding(b);
  const [a] = await tx
    .update(affiliates)
    .set({ ...b, brandColor: b.brandColor.toUpperCase(), darkColor: b.darkColor.toUpperCase() })
    .where(eq(affiliates.id, affiliateId))
    .returning();
  if (!a) throw new BrandingError("Afiliado não encontrado");
  return a;
}
