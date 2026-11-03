"use client";

/** Calculadora da regra de preço (mesmo motor usado na loja e no checkout). */
import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { installmentPlan, priceItem } from "@/server/pricing/engine";
import { brl, fxRate as fmtFx, money, pct } from "@/lib/format";

type Currency = "USD" | "EUR" | "BRL";

export type CalculatorDefaults = {
  fx: Partial<Record<"USD" | "EUR", string>>;
  subrinhoMarginPct: string;
  affiliateMarginPct: string;
  installmentFeePct: string;
  maxInstallments: number;
};

const SPEC = { unit: "100", qty: "5", currency: "USD" as Currency, fx: "4,93", ms: "4,5", ma: "3,7", fee: "9,68" };

const br = (v: string) => v.replace(".", ",");
function parse(v: string): string {
  let s = v.trim().replace(/\s|%|R\$|\$|€/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return s;
}

export function PriceCalculator({ defaults }: { defaults: CalculatorDefaults }) {
  const [unit, setUnit] = useState(SPEC.unit);
  const [qty, setQty] = useState(SPEC.qty);
  const [currency, setCurrency] = useState<Currency>(SPEC.currency);
  const [fx, setFx] = useState(SPEC.fx);
  const [ms, setMs] = useState(SPEC.ms);
  const [ma, setMa] = useState(SPEC.ma);
  const [fee, setFee] = useState(SPEC.fee);

  const result = useMemo(() => {
    try {
      const u = parse(unit);
      const q = Number(qty);
      if (!/^\d+(\.\d+)?$/.test(u)) throw new Error("Preço unitário inválido");
      if (!Number.isInteger(q) || q < 1 || q > 10000) throw new Error("Quantidade deve ser um inteiro entre 1 e 10.000");
      const rate = currency === "BRL" ? "1" : parse(fx);
      if (!/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) throw new Error("Câmbio inválido");
      for (const [label, v] of [["Margem Subrinho", ms], ["Margem afiliado", ma], ["Taxa do parcelado", fee]] as const)
        if (!/^\d+(\.\d+)?$/.test(parse(v))) throw new Error(`${label} inválida`);
      const p = priceItem({
        costCurrency: currency,
        lines: [{ unitCost: u, quantity: q }],
        fxRate: rate,
        subrinhoMarginPct: parse(ms),
        affiliateMarginPct: parse(ma),
        installmentFeePct: parse(fee),
      });
      return { ok: true as const, p, plan: installmentPlan(p.installmentPrice, defaults.maxInstallments) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Valores inválidos" };
    }
  }, [unit, qty, currency, fx, ms, ma, fee, defaults.maxInstallments]);

  const applyCurrent = () => {
    const rate = currency === "BRL" ? undefined : defaults.fx[currency];
    if (rate) setFx(br(String(Number(rate))));
    setMs(br(String(Number(defaults.subrinhoMarginPct))));
    setMa(br(String(Number(defaults.affiliateMarginPct))));
    setFee(br(String(Number(defaults.installmentFeePct))));
  };
  const reset = () => {
    setUnit(SPEC.unit);
    setQty(SPEC.qty);
    setCurrency(SPEC.currency);
    setFx(SPEC.fx);
    setMs(SPEC.ms);
    setMa(SPEC.ma);
    setFee(SPEC.fee);
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, opts: { suffix?: string; disabled?: boolean; mode?: "decimal" | "numeric" } = {}) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => set(e.target.value)}
          inputMode={opts.mode ?? "decimal"}
          disabled={opts.disabled}
          className={cn(inputClass, "py-2 tabular", opts.suffix && "pr-8")}
        />
        {opts.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{opts.suffix}</span>}
      </div>
    </div>
  );

  const steps = result.ok
    ? [
        {
          n: 1,
          title: "Custo na moeda",
          formula: `${money(parse(unit), currency)} × ${qty}`,
          value: money(result.p.costForeign.toString(), currency),
        },
        {
          n: 2,
          title: "Custo R$",
          formula: currency === "BRL" ? "tarifa já em reais" : `${money(result.p.costForeign.toString(), currency)} × ${fmtFx(result.p.fxRate.toString())}`,
          value: brl(result.p.costBrl.toString()),
        },
        {
          n: 3,
          title: "NET Subrinho",
          formula: `${brl(result.p.costBrl.toString())} ÷ (1 − ${pct(result.p.subrinhoMarginPct.toString())})`,
          value: brl(result.p.netSubrinho.toString()),
          hint: `margem Subrinho ${brl(result.p.subrinhoMarginAmount.toString())}`,
        },
        {
          n: 4,
          title: "NET Afiliado = preço PIX",
          formula: `${brl(result.p.netSubrinho.toString())} ÷ (1 − ${pct(result.p.affiliateMarginPct.toString())})`,
          value: brl(result.p.netAffiliate.toString()),
          hint: `margem afiliado ${brl(result.p.affiliateMarginAmount.toString())}`,
        },
        {
          n: 5,
          title: "PARCELADO (sem juros)",
          formula: `${brl(result.p.netAffiliate.toString())} ÷ (1 − ${pct(result.p.installmentFeePct.toString())})`,
          value: brl(result.p.installmentPrice.toString()),
          hint: `${result.plan.count}x de ${brl(result.plan.installment.toString())}${result.plan.first.eq(result.plan.installment) ? "" : ` (1ª de ${brl(result.plan.first.toString())})`}`,
        },
      ]
    : [];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("calc-unit", "Preço unitário", unit, setUnit)}
        {field("calc-qty", "Quantidade", qty, setQty, { mode: "numeric" })}
        <div>
          <label htmlFor="calc-cur" className="mb-1 block text-xs font-semibold text-ink">
            Moeda
          </label>
          <select id="calc-cur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={cn(inputClass, "py-2 pr-8")}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="BRL">BRL</option>
          </select>
        </div>
        {field("calc-fx", "Câmbio (R$)", currency === "BRL" ? "1" : fx, setFx, { disabled: currency === "BRL" })}
        {field("calc-ms", "Margem Subrinho", ms, setMs, { suffix: "%" })}
        {field("calc-ma", "Margem afiliado", ma, setMa, { suffix: "%" })}
        {field("calc-fee", "Taxa parcelado", fee, setFee, { suffix: "%" })}
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={applyCurrent} className={buttonClass("outline", "sm", "h-10 min-w-0 flex-1")} title="Câmbio vigente, margem padrão Subrinho, margem padrão do afiliado e taxa configurada">
            Valores atuais
          </button>
          <button type="button" onClick={reset} className={buttonClass("ghost", "sm", "h-10")} title="Exemplo da especificação">
            Exemplo
          </button>
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        {!result.ok ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {result.error}
          </p>
        ) : (
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.n} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", s.n >= 4 ? "bg-brand-50" : "bg-surface/70")}>
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", s.n >= 4 ? "bg-brand text-white" : "bg-white text-brand-ink")}>
                  {s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{s.title}</p>
                  <p className="text-xs text-muted tabular">
                    {s.formula}
                    {s.hint && <span className="block sm:inline sm:before:content-['_·_']">{s.hint}</span>}
                  </p>
                </div>
                <p className="whitespace-nowrap text-right text-base font-semibold tabular text-ink">{s.value}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Calculator className="h-3.5 w-3.5" aria-hidden /> Cada etapa é arredondada para centavos, exatamente como no checkout.
      </p>
    </div>
  );
}
