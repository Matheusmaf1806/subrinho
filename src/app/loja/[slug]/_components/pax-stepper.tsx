"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

/** Campo numérico com botões − / + (envia no formulário pelo `name`). */
export function PaxStepper({ name, label, hint, min = 0, max = 20, defaultValue = 0, onChange }: { name: string; label: string; hint?: string; min?: number; max?: number; defaultValue?: number; onChange?: (v: number) => void }) {
  const [v, setV] = useState(defaultValue);
  const set = (n: number) => {
    const x = Math.min(max, Math.max(min, n));
    setV(x);
    onChange?.(x);
  };
  const btn = "grid h-9 w-9 place-items-center rounded-full bg-surface text-ink transition hover:bg-ink hover:text-white disabled:opacity-30 disabled:hover:bg-surface disabled:hover:text-ink";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-ink">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Diminuir ${label}`} onClick={() => set(v - 1)} disabled={v <= min} className={btn}>
          <Minus className="h-4 w-4" />
        </button>
        <input type="hidden" name={name} value={v} />
        <span className="w-8 text-center text-[17px] font-semibold tabular" aria-live="polite">
          {v}
        </span>
        <button type="button" aria-label={`Aumentar ${label}`} onClick={() => set(v + 1)} disabled={v >= max} className={btn}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
