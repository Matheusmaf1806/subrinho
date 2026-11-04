/** Utilitários compartilhados pelos adaptadores de hotel reais (GGT/GoGlobal e Hotelbeds). */
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type { Currency } from "@/server/db/schema";
import { daysBetween, startOfLocalDay } from "@/lib/tz";
import { SupplierError } from "../types";

export const SUPPORTED_CURRENCIES: readonly Currency[] = ["USD", "EUR", "BRL"];

export function asCurrency(code: unknown): Currency | null {
  const c = String(code ?? "").trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c) ? (c as Currency) : null;
}

/** Minúsculo, sem acentos, sem pontuação, espaços simples. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "di", "del", "la", "le", "les", "el", "and", "e", "of", "the", "at", "by", "in", "on", "a", "en", "y"]);
const ACRONYMS = new Set(["USA", "UK", "UAE", "NYC", "DC", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "BW", "IHG", "YMCA", "JFK", "SPA", "MGM", "NH", "AC"]);

/**
 * "ORLANDO AND DISNEYWORLD AREA (FL)" → "Orlando and Disneyworld Area (FL)".
 * Só reescreve textos todos em maiúsculas/minúsculas; siglas entre parênteses e conhecidas continuam maiúsculas.
 */
export function titleCase(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean || (clean !== clean.toUpperCase() && clean !== clean.toLowerCase())) return clean;
  const inParens = new Set([...clean.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].toUpperCase().split(/[^A-Z0-9]+/)));
  let index = 0;
  return clean.replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (w) => {
    const upper = w.toUpperCase();
    const lower = w.toLowerCase();
    const first = index++ === 0;
    if (ACRONYMS.has(upper) || (inParens.has(upper) && /^[A-Z]{2,3}$/.test(upper))) return upper;
    if (!first && SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/** HTML simples dos fornecedores → texto com parágrafos. Remove tags/scripts e decodifica entidades. */
/** Texto corrido de fornecedor: espaço depois de "." e ":" colados ("arrival.Check-in" → "arrival. Check-in"). */
export function tidySupplierText(text: string): string {
  return text.replace(/([a-z0-9)])\.(?=[A-Z])/g, "$1. ").replace(/([a-zA-Z]):(?=[0-9A-Za-z])/g, "$1: ");
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/?\s*(p|div|li|ul|ol|h[1-6]|tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*—[ \t]*/g, " - ")
    .trim();
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "-", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", deg: "°", eacute: "é", aacute: "á", oacute: "ó", iacute: "í", uacute: "ú", ccedil: "ç", atilde: "ã", otilde: "õ", ecirc: "ê", acirc: "â", ocirc: "ô" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return named[e.toLowerCase()] ?? m;
  });
}

/** Identificador curto e estável (não muda entre buscas) a partir de partes descritivas. */
export function stableId(...parts: (string | number | boolean | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.map((p) => normalizeText(String(p ?? ""))).join("|"))
    .digest("base64url")
    .slice(0, 16);
}

/** Chave para reconhecer o mesmo hotel em fornecedores diferentes (nome normalizado). */
export function hotelGroupKey(name: string, countryCode?: string | null): string | undefined {
  const n = normalizeText(name)
    .replace(/\b(hotel|hotels|the|and|by|resort|suites|inn)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (n.length < 4) return undefined;
  return `hotel:${(countryCode ?? "").toLowerCase()}:${n}`;
}

/** Regimes de alimentação (códigos usados por GoGlobal e Hotelbeds). */
export const BOARD_LABEL: Record<string, string> = {
  RO: "Somente hospedagem",
  SC: "Somente hospedagem",
  OB: "Somente hospedagem",
  BB: "Café da manhã",
  BB2: "Café da manhã (até 2 pessoas)",
  CB: "Café da manhã continental",
  AB: "Café da manhã americano",
  BU: "Café da manhã buffet",
  DB: "Café da manhã",
  HB: "Meia pensão",
  BD: "Café da manhã e jantar",
  MP: "Meia pensão",
  FB: "Pensão completa",
  PC: "Pensão completa",
  AI: "All inclusive",
  AIS: "All inclusive (soft)",
  UAI: "Ultra all inclusive",
  TI: "All inclusive",
};

export function boardLabel(code: string | null | undefined, fallback?: string | null): string {
  const c = String(code ?? "").trim().toUpperCase();
  return BOARD_LABEL[c] ?? (fallback ? titleCase(fallback) : c || "Somente hospedagem");
}

/** Estrelas a partir de "3.5", "4EST", "4 STARS", "4LL"… */
export function parseStars(v: unknown): number | undefined {
  const m = String(v ?? "").match(/(\d+(?:[.,]5)?)/);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return n >= 1 && n <= 7 ? n : undefined;
}

export function starsText(n: number | undefined): string {
  if (!n) return "";
  return `${"★".repeat(Math.floor(n))}${n % 1 ? "½" : ""}`;
}

/** Valor monetário vindo da API (string/number) → string com 2 casas, sem float. */
export function money2(v: unknown): string {
  const d = new Decimal(String(v ?? "").trim() || "NaN");
  if (!d.isFinite() || d.lt(0)) throw new SupplierError("Preço inválido recebido do fornecedor");
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function validateStay(checkIn: string | undefined, checkOut: string | undefined): { checkIn: string; checkOut: string; nights: number } {
  if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut))
    throw new SupplierError("Informe as datas de check-in e check-out");
  const nights = daysBetween(checkIn, checkOut);
  if (nights < 1) throw new SupplierError("O check-out precisa ser depois do check-in");
  if (nights > 30) throw new SupplierError("Estadias de até 30 noites");
  if (startOfLocalDay(checkIn).getTime() <= Date.now()) throw new SupplierError("O check-in precisa ser a partir de amanhã");
  return { checkIn, checkOut, nights };
}

/** "dd/MMM/yyyy" (30/Dec/2026), "dd/mm/yyyy" ou ISO → "yyyy-mm-dd". */
export function parseSupplierDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/);
  if (m) {
    const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
    if (mon >= 0) return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** "2026-12-30" → "30/12/2026" */
export function brDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split("-");
  return `${d}/${mo}/${y}`;
}

/** Nome completo → { first, last } para os fornecedores (sobrenome obrigatório). */
export function splitName(full: string): { first: string; last: string } {
  const parts = full
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}' -]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) throw new SupplierError(`Informe nome e sobrenome do hóspede (“${full.trim()}”)`);
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Remove acentos (algumas APIs de reserva só aceitam ASCII nos nomes). */
export function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

const FACILITY_PRIORITY = [/piscina|pool/i, /wi-?fi|internet/i, /pequeno-almo|caf[eé] da manh|breakfast/i, /estacionamento gr[aá]tis|free parking/i, /transfer|transporte|shuttle/i, /parque aqu|water ?park/i, /spa\b/i, /gin[aá]sio|academia|fitness/i, /restaurante|restaurant/i, /bar\b/i, /crian[cç]as|kids|infantil/i, /lavandaria|lavanderia|laundry/i, /cozinha|kitchen/i];

/** Comodidades mais relevantes primeiro; remove itens negativos/técnicos. */
export function rankFacilities(list: string[]): string[] {
  const useful = list.filter((f) => f.length <= 80 && !/\bn[aã]o\b|limita|fumador|smoking|braille|sinaliza|alarme|barra de apoio|sobretaxa|surcharge/i.test(f));
  const score = (f: string) => {
    const i = FACILITY_PRIORITY.findIndex((r) => r.test(f));
    return i < 0 ? 99 : i;
  };
  return [...new Set(useful)].sort((a, b) => score(a) - score(b));
}
