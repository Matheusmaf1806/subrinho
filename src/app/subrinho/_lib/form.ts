/**
 * Utilitários para Server Actions do Painel Subrinho: leitura de FormData e tratamento de erros.
 * (Arquivo comum — NÃO é "use server".)
 */
import { unstable_rethrow } from "next/navigation";
import { DrizzleQueryError } from "drizzle-orm/errors";
import type { ActionState } from "@/components/ui-client";

/** Erro de validação de formulário (mensagem exibida ao usuário). */
export class FormError extends Error {}

/**
 * Converte qualquer erro em ActionState. Erros internos do Next (redirect/notFound) são relançados.
 * Erros de banco não expõem SQL ao usuário.
 */
export function actionError(e: unknown): ActionState {
  unstable_rethrow(e);
  if (e instanceof DrizzleQueryError) {
    const code = (e.cause as { code?: string } | undefined)?.code;
    console.error("[painel-subrinho]", e.cause ?? e);
    if (code === "23505") return { error: "Já existe um registro com esses dados." };
    if (code === "23503") return { error: "Registro relacionado não encontrado." };
    return { error: "Não foi possível concluir a operação. Tente novamente." };
  }
  if (e instanceof Error && e.message) return { error: e.message };
  console.error("[painel-subrinho]", e);
  return { error: "Erro inesperado. Tente novamente." };
}

export function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optText(fd: FormData, key: string): string | null {
  return text(fd, key) || null;
}

export function checkbox(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string | null | undefined): s is string {
  return !!s && UUID_RE.test(s);
}

export function uuid(fd: FormData, key: string, label = "Registro"): string {
  const v = text(fd, key);
  if (!isUuid(v)) throw new FormError(`${label} inválido`);
  return v;
}

export function optUuid(fd: FormData, key: string): string | null {
  const v = text(fd, key);
  if (!v) return null;
  if (!isUuid(v)) throw new FormError("Identificador inválido");
  return v;
}

/**
 * Número decimal digitado em formato brasileiro ou internacional ("2.465,00", "2465.00", "4,5%").
 * Retorna string normalizada com ponto decimal, ou null se vazio.
 */
export function parseDecimal(raw: string, label: string): string | null {
  let s = raw.trim().replace(/\s|R\$|%|US\$|€|\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new FormError(`${label}: número inválido`);
  return s;
}

export function decimal(fd: FormData, key: string, label: string): string | null {
  return parseDecimal(text(fd, key), label);
}

export function requiredDecimal(fd: FormData, key: string, label: string): string {
  const v = decimal(fd, key, label);
  if (v === null) throw new FormError(`Informe ${label.toLowerCase()}`);
  return v;
}

export function optInt(fd: FormData, key: string, label: string, opts: { min?: number; max?: number } = {}): number | null {
  const s = text(fd, key);
  if (!s) return null;
  if (!/^\d+$/.test(s)) throw new FormError(`${label}: informe um número inteiro`);
  const n = Number(s);
  if (opts.min !== undefined && n < opts.min) throw new FormError(`${label}: mínimo ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new FormError(`${label}: máximo ${opts.max}`);
  return n;
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) throw new FormError(`${label} inválido`);
  return value as T;
}
