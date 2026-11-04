import { addDays, daysBetween, startOfLocalDay, todayLocal } from "@/lib/tz";
import type { Currency } from "@/server/db/schema";

/** Hash determinístico (FNV-1a) — mesma busca, mesmo preço. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Variação de preço por data (0,94 a 1,12), simulando tarifa dinâmica do fornecedor. */
export function dynamicFactor(key: string, date?: string): number {
  if (!date) return 1;
  const h = hash(`${key}|${date}`);
  return 0.94 + (h % 1800) / 10000;
}

export function money4(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

export function quoteRef(prefix: string, payload: unknown): string {
  return `${prefix}-${hash(JSON.stringify(payload)).toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

export function bookingRef(prefix: string): string {
  return `${prefix}${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
}

export function defaultDate(offsetDays = 30): string {
  return addDays(todayLocal(), offsetDays);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(1, daysBetween(checkIn, checkOut));
}

/** Expira às 00:00 (horário de Brasília) da data do serviço. */
export function expiresAtFor(date: string | null | undefined): Date | null {
  return date ? startOfLocalDay(date) : null;
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesDestination(dest: string | undefined, ...fields: string[]): boolean {
  if (!dest) return true;
  const q = normalize(dest);
  return fields.some((f) => normalize(f).includes(q));
}

export type CurrencyOf = Currency;
