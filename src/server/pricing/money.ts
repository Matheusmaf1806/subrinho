import DecimalBase from "decimal.js";

/** Decimal com arredondamento comercial (meio para cima) — nunca usar float para dinheiro. */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;
export type DecimalInput = Decimal | string | number;

export const ZERO = new Decimal(0);
export const HUNDRED = new Decimal(100);

export function d(v: DecimalInput | null | undefined): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  return v instanceof Decimal ? v : new Decimal(v);
}

/** Arredonda para centavos (2 casas, meio para cima). */
export function round2(v: DecimalInput): Decimal {
  return d(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function round4(v: DecimalInput): Decimal {
  return d(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** Converte pontos percentuais (4.5) em fração (0.045). */
export function pctToFraction(p: DecimalInput): Decimal {
  return d(p).div(HUNDRED);
}

/** "Por dentro": valor / (1 − taxa). É a fórmula usada em todas as camadas de preço. */
export function grossUp(value: DecimalInput, pctPoints: DecimalInput): Decimal {
  const f = pctToFraction(pctPoints);
  if (f.gte(1)) throw new Error("Percentual precisa ser menor que 100%");
  return d(value).div(new Decimal(1).minus(f));
}

export function toCents(v: DecimalInput): number {
  return round2(v).times(100).toNumber();
}

export function fromCents(c: number): Decimal {
  return new Decimal(c).div(100);
}

export function sum(values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function money(v: DecimalInput): string {
  return round2(v).toFixed(2);
}

export function maxD(a: DecimalInput, b: DecimalInput): Decimal {
  return Decimal.max(d(a), d(b));
}

export function minD(a: DecimalInput, b: DecimalInput): Decimal {
  return Decimal.min(d(a), d(b));
}
