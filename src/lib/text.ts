/** Regras de texto do site. */

/**
 * O site não usa travessão (—). Em texto de fornecedor ou digitado pela agência, entre palavras ele
 * vira " - " e, colado, "-". Mantém o tipo de entrada (null/undefined passam direto).
 */
export function noEmDash<T extends string | null | undefined>(s: T): T {
  if (!s || !s.includes("—")) return s;
  return s.replace(/[ \t]*—[ \t]*/g, (m) => (m.trim() === m ? "-" : " - ")) as T;
}
