import type { Decimal } from "@/server/pricing/money";

type Num = Decimal | string | number | null | undefined;

const toNum = (v: Num) => (v === null || v === undefined || v === "" ? 0 : typeof v === "object" ? Number(v.toString()) : Number(v));

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(v: Num): string {
  return brlFmt.format(toNum(v));
}

export function money(v: Num, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2 }).format(toNum(v));
}

export function num(v: Num, digits = 2): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toNum(v));
}

/** Percentual a partir de pontos percentuais ("4.5000" → "4,5%"). */
export function pct(v: Num, digits = 2): string {
  const n = toNum(v);
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n)}%`;
}

export function fxRate(v: Num): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(toNum(v));
}

/** Data (YYYY-MM-DD ou Date) → dd/mm/aaaa. */
export function date(v: string | Date | null | undefined): string {
  if (!v) return "-";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function weekdayDate(v: string | null | undefined): string {
  if (!v) return "-";
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function orderNumber(n: number): string {
  return `#${String(n).padStart(6, "0")}`;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  CANCELLED: "Cancelado",
  REFUNDED: "Estornado",
};

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  PAID: "Pago",
  CANCELLED: "Cancelado",
  OPEN: "Quinzena em aberto",
};

export function paxSummary(p: { adults?: number; children?: number; seniors?: number; rooms?: number; units?: number } | null | undefined): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.rooms) parts.push(`${p.rooms} quarto${p.rooms > 1 ? "s" : ""}`);
  if (p.adults) parts.push(`${p.adults} adulto${p.adults > 1 ? "s" : ""}`);
  if (p.children) parts.push(`${p.children} criança${p.children > 1 ? "s" : ""}`);
  if (p.seniors) parts.push(`${p.seniors} sênior${p.seniors > 1 ? "es" : ""}`);
  if (p.units) parts.push(`${p.units} unidade${p.units > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
