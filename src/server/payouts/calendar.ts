/**
 * Calendário de repasses.
 *
 * Regra:
 *  - Vendido entre os dias 1 e 15 → pago no 5º dia útil após o fechamento da quinzena (dia 15).
 *  - Vendido do dia 16 em diante → pago no 5º dia útil do mês seguinte.
 *  - A quinzena fecha no dia 16 (relatório do dia 1 ao 15) e no dia 1 (relatório do 16 ao fim do mês).
 *
 * Dias úteis: segunda a sexta, exceto feriados nacionais/bancários (inclui Carnaval e
 * Corpus Christi, dias sem expediente bancário) e feriados extras cadastrados no Painel Subrinho.
 * A data da venda é a data do PAGAMENTO no fuso America/Sao_Paulo.
 */
import { addDays, localDate } from "@/lib/tz";

export const PAYOUT_BUSINESS_DAYS = 5;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Feriados nacionais + dias sem expediente bancário. */
export function nationalHolidays(year: number): Map<string, string> {
  const y = String(year);
  const easter = easterSunday(year);
  const list: [string, string][] = [
    [`${y}-01-01`, "Confraternização Universal"],
    [addDays(easter, -48), "Carnaval (segunda-feira)"],
    [addDays(easter, -47), "Carnaval (terça-feira)"],
    [addDays(easter, -2), "Sexta-feira Santa"],
    [`${y}-04-21`, "Tiradentes"],
    [`${y}-05-01`, "Dia do Trabalho"],
    [addDays(easter, 60), "Corpus Christi"],
    [`${y}-09-07`, "Independência do Brasil"],
    [`${y}-10-12`, "Nossa Senhora Aparecida"],
    [`${y}-11-02`, "Finados"],
    [`${y}-11-15`, "Proclamação da República"],
    [`${y}-12-25`, "Natal"],
  ];
  if (year >= 2024) list.push([`${y}-11-20`, "Dia Nacional de Zumbi e da Consciência Negra"]);
  return new Map(list);
}

export type HolidayCalendar = { extra?: Iterable<string> };

export class BusinessCalendar {
  private extra: Set<string>;
  private cache = new Map<number, Map<string, string>>();

  constructor(opts: HolidayCalendar = {}) {
    this.extra = new Set(opts.extra ?? []);
  }

  holidayName(date: string): string | null {
    const year = Number(date.slice(0, 4));
    if (!this.cache.has(year)) this.cache.set(year, nationalHolidays(year));
    return this.cache.get(year)!.get(date) ?? (this.extra.has(date) ? "Feriado" : null);
  }

  isBusinessDay(date: string): boolean {
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) return false;
    return this.holidayName(date) === null;
  }

  /** N-ésimo dia útil estritamente DEPOIS de `date`. */
  addBusinessDays(date: string, n: number): string {
    let cur = date;
    let count = 0;
    while (count < n) {
      cur = addDays(cur, 1);
      if (this.isBusinessDay(cur)) count++;
    }
    return cur;
  }
}

export type Fortnight = { start: string; end: string; half: 1 | 2 };

export function lastDayOfMonth(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month, 0)); // month é 1-based → dia 0 do próximo mês
  return dt.toISOString().slice(0, 10);
}

/** Quinzena a que pertence uma data local (YYYY-MM-DD). */
export function fortnightOf(date: string): Fortnight {
  const [y, m, d] = date.split("-").map(Number);
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  if (d <= 15) return { start: `${ym}-01`, end: `${ym}-15`, half: 1 };
  return { start: `${ym}-16`, end: lastDayOfMonth(y, m), half: 2 };
}

/** Data de repasse de uma quinzena = 5º dia útil após o último dia da quinzena. */
export function payoutDateForFortnight(f: Fortnight, cal: BusinessCalendar, businessDays = PAYOUT_BUSINESS_DAYS): string {
  return cal.addBusinessDays(f.end, businessDays);
}

/** Data de repasse de uma venda paga em `paidAt`. */
export function payoutDateForSale(paidAt: Date, cal: BusinessCalendar, businessDays = PAYOUT_BUSINESS_DAYS): string {
  return payoutDateForFortnight(fortnightOf(localDate(paidAt)), cal, businessDays);
}

/** Última quinzena já encerrada na data local `today`. */
export function lastClosedFortnight(today: string): Fortnight {
  const [y, m, d] = today.split("-").map(Number);
  if (d >= 16) return fortnightOf(`${y}-${String(m).padStart(2, "0")}-01`);
  const prev = addDays(`${y}-${String(m).padStart(2, "0")}-01`, -1);
  return fortnightOf(prev);
}
