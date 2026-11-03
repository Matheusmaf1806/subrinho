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
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <div className="text-sm font-bold text-ink">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Diminuir ${label}`} onClick={() => set(v - 1)} disabled={v <= min} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-accent disabled:opacity-40">
          <Minus className="h-4 w-4" />
        </button>
        <input type="hidden" name={name} value={v} />
        <span className="w-8 text-center text-base font-extrabold tabular" aria-live="polite">{v}</span>
        <button type="button" aria-label={`Aumentar ${label}`} onClick={() => set(v + 1)} disabled={v >= max} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-accent disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
