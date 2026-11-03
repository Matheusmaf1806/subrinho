/**
 * Tema white-label: cada afiliado define cor principal, cor escura, fonte e logo.
 * O tema vira variáveis CSS (--theme-*) aplicadas na Loja e no Painel do Afiliado;
 * os tokens do Tailwind (brand, accent, ink, font-sans) leem essas variáveis.
 */
import type { CSSProperties } from "react";
import { contrast, HEX_RE, mix, NEAR_BLACK, readableOn, textSafe, WHITE } from "./color";

export const FONT_OPTIONS = [
  { id: "inter-tight", label: "Moderna", sample: "Inter Tight", family: '"Inter Tight Variable"', tracking: "-0.045em" },
  { id: "manrope", label: "Geométrica", sample: "Manrope", family: '"Manrope Variable"', tracking: "-0.04em" },
  { id: "nunito", label: "Arredondada", sample: "Nunito", family: '"Nunito Variable"', tracking: "-0.035em" },
  { id: "fraunces", label: "Elegante", sample: "Fraunces", family: '"Fraunces Variable"', tracking: "-0.03em" },
] as const;

export type FontId = (typeof FONT_OPTIONS)[number]["id"];

export const DEFAULT_THEME = { brandColor: "#E4113F", darkColor: "#0A0A0B", fontFamily: "inter-tight" as FontId };

/** A cor escura é usada em blocos, botões e TEXTO: precisa ter contraste alto com branco. */
export const MIN_DARK_CONTRAST = 7;

export type ThemeInput = { brandColor?: string | null; darkColor?: string | null; fontFamily?: string | null };

export function fontOf(id?: string | null) {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
}

export function resolveTheme(t: ThemeInput) {
  const brand = t.brandColor && HEX_RE.test(t.brandColor) ? t.brandColor.toUpperCase() : DEFAULT_THEME.brandColor;
  let ink = t.darkColor && HEX_RE.test(t.darkColor) ? t.darkColor.toUpperCase() : DEFAULT_THEME.darkColor;
  if (contrast(ink, WHITE) < MIN_DARK_CONTRAST) ink = NEAR_BLACK;
  const font = fontOf(t.fontFamily);
  return {
    brand,
    brandFg: readableOn(brand), // texto sobre a cor principal
    brandInk: textSafe(brand, WHITE, 4.5), // cor principal usada como texto sobre branco
    ink,
    ink2: mix(ink, WHITE, 0.12),
    font,
  };
}

export type ResolvedTheme = ReturnType<typeof resolveTheme>;

/** Variáveis CSS do tema (aplique no elemento raiz da loja/painel, com a classe `font-sans`). */
export function themeStyle(t: ThemeInput): CSSProperties {
  const r = resolveTheme(t);
  return {
    ["--theme-brand" as string]: r.brand,
    ["--theme-brand-fg" as string]: r.brandFg,
    ["--theme-brand-ink" as string]: r.brandInk,
    ["--theme-ink" as string]: r.ink,
    ["--theme-ink-2" as string]: r.ink2,
    ["--theme-font" as string]: r.font.family,
    ["--theme-display-tracking" as string]: r.font.tracking,
  };
}

const STOP = new Set(["da", "de", "do", "das", "dos", "e", "&", "a", "o"]);

/** Iniciais para o monograma (ex.: "Viagens da Ana" → "VA"). */
export function monogram(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()) && /[a-z0-9]/i.test(w));
  if (!words.length) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

export const DEFAULT_HERO_TITLE = "Viaje mais.\nPague em 10x.";
export const DEFAULT_TAGLINE = "Sua próxima viagem começa aqui.";
