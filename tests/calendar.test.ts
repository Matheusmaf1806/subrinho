import { describe, expect, it } from "vitest";
import {
  BusinessCalendar,
  easterSunday,
  fortnightOf,
  lastClosedFortnight,
  payoutDateForFortnight,
  payoutDateForSale,
} from "@/server/payouts/calendar";
import { localDate, startOfLocalDay } from "@/lib/tz";

const cal = new BusinessCalendar();

describe("calendário", () => {
  it("Páscoa", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });
  it("feriados e fins de semana não são dias úteis", () => {
    expect(cal.isBusinessDay("2026-11-20")).toBe(false); // Consciência Negra
    expect(cal.isBusinessDay("2026-02-16")).toBe(false); // Carnaval
    expect(cal.isBusinessDay("2026-11-21")).toBe(false); // sábado
    expect(cal.isBusinessDay("2026-11-23")).toBe(true);
  });
});

describe("data de repasse", () => {
  it("venda entre 1 e 15 → 5º dia útil após o dia 15", () => {
    // 16 (seg), 17, 18, 19, 20 é feriado, 23 (seg) = 5º dia útil
    expect(payoutDateForFortnight(fortnightOf("2026-11-03"), cal)).toBe("2026-11-23");
  });
  it("venda do dia 16 em diante → 5º dia útil do mês seguinte", () => {
    // dez/2026: 1 (ter), 2, 3, 4, 7 (seg)
    expect(payoutDateForFortnight(fortnightOf("2026-11-20"), cal)).toBe("2026-12-07");
  });
  it("2ª quinzena de dezembro cai em janeiro (pula 1º de janeiro)", () => {
    // jan/2027: 1 feriado, 4 (seg), 5, 6, 7, 8
    expect(payoutDateForFortnight(fortnightOf("2026-12-31"), cal)).toBe("2027-01-08");
  });
  it("feriado extra cadastrado é respeitado", () => {
    const c2 = new BusinessCalendar({ extra: ["2026-11-16"] });
    expect(payoutDateForFortnight(fortnightOf("2026-11-10"), c2)).toBe("2026-11-24");
  });
  it("usa a data do pagamento no fuso de São Paulo", () => {
    // 15/11 23:30 em SP = 16/11 02:30 UTC → ainda é 1ª quinzena
    const paidAt = new Date("2026-11-16T02:30:00Z");
    expect(localDate(paidAt)).toBe("2026-11-15");
    expect(payoutDateForSale(paidAt, cal)).toBe("2026-11-23");
  });
  it("início do dia local", () => {
    expect(startOfLocalDay("2026-11-16").toISOString()).toBe("2026-11-16T03:00:00.000Z");
  });
});

describe("fechamento de quinzena", () => {
  it("no dia 16 fecha 1 a 15", () => {
    expect(lastClosedFortnight("2026-11-16")).toEqual({ start: "2026-11-01", end: "2026-11-15", half: 1 });
  });
  it("no dia 1 fecha 16 ao fim do mês anterior", () => {
    expect(lastClosedFortnight("2026-12-01")).toEqual({ start: "2026-11-16", end: "2026-11-30", half: 2 });
    expect(lastClosedFortnight("2026-03-01")).toEqual({ start: "2026-02-16", end: "2026-02-28", half: 2 });
  });
});
