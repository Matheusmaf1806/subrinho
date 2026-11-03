import { BUSINESS_TZ, startOfLocalDay } from "@/lib/tz";
import { date } from "@/lib/format";
import { FormError } from "./form";

/** Date → "YYYY-MM-DDTHH:mm" no fuso do negócio (para <input type="datetime-local">). */
export function toLocalInput(v: Date | null | undefined): string {
  if (!v) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(v);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** "YYYY-MM-DDTHH:mm" (horário de Brasília) → Date. Vazio → null. */
export function fromLocalInput(s: string, label = "Data"): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new FormError(`${label}: data/hora inválida`);
  const base = startOfLocalDay(m[1]);
  return new Date(base.getTime() + (Number(m[2]) * 60 + Number(m[3])) * 60_000);
}

export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s;
}

export function periodLabel(start: string, end: string): string {
  return `${date(start)} a ${date(end)}`;
}
