/** Utilidades de cor (WCAG) — usadas para garantir legibilidade com qualquer cor de marca. */

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function parseHex(hex: string): [number, number, number] {
  if (!HEX_RE.test(hex)) throw new Error(`Cor inválida: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** Luminância relativa (WCAG 2.x). */
export function luminance(hex: string): number {
  const ch = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export const WHITE = "#FFFFFF";
export const NEAR_BLACK = "#0A0A0B";

/** Cor de texto (branco ou quase-preto) com melhor contraste sobre `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, WHITE) >= contrast(bg, NEAR_BLACK) ? WHITE : NEAR_BLACK;
}

export function mix(a: string, b: string, t: number): string {
  const [x, y] = [parseHex(a), parseHex(b)];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/**
 * Versão da cor que pode ser usada como TEXTO sobre `on` (padrão: branco) com contraste mínimo.
 * Escurece (ou clareia, se o fundo for escuro) até atingir o mínimo.
 */
export function textSafe(hex: string, on = WHITE, min = 4.5): string {
  if (contrast(hex, on) >= min) return hex.toUpperCase();
  const target = luminance(on) > 0.5 ? NEAR_BLACK : WHITE;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(hex, target, t);
    if (contrast(c, on) >= min) return c;
  }
  return target;
}
