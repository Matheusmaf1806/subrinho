"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/ui";

export const CHILD_AGE_OPTIONS = Array.from({ length: 18 }, (_, a) => ({ value: a, label: a === 0 ? "Menos de 1 ano" : `${a} ano${a > 1 ? "s" : ""}` }));

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = "grid h-9 w-9 place-items-center rounded-full bg-surface text-ink transition hover:bg-ink hover:text-white disabled:opacity-30 disabled:hover:bg-surface disabled:hover:text-ink";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <div className="text-[15px] font-semibold text-ink">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-[17px] font-semibold tabular" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Idade de cada criança (obrigatória para cotar hotel). `ages` com null = ainda não escolhida. */
export function ChildAgesPicker({ ages, onChange, error }: { ages: (number | null)[]; onChange: (ages: (number | null)[]) => void; error?: boolean }) {
  if (!ages.length) return null;
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {ages.map((a, i) => (
        <label key={i} className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Idade da criança {i + 1} no check-in</span>
          <select
            value={a ?? ""}
            onChange={(e) => onChange(ages.map((x, j) => (j === i ? (e.target.value === "" ? null : Number(e.target.value)) : x)))}
            className={cn("h-11 w-full rounded-xl border-0 bg-surface px-3 text-[15px] font-semibold text-ink ring-1 ring-inset focus:ring-2 focus:ring-ink", error && a === null ? "ring-red-500" : "ring-transparent")}
          >
            <option value="">Selecione</option>
            {CHILD_AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function guestsSummary(rooms: number, adults: number, children: number): string {
  return [`${rooms} quarto${rooms > 1 ? "s" : ""}`, `${adults} adulto${adults > 1 ? "s" : ""}`, children ? `${children} criança${children > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
}

/**
 * Quartos, adultos, crianças e a idade de cada criança — num único campo com painel.
 * Envia: quartos, adultos, criancas, idades ("7,10").
 */
export function GuestsField({ rooms: r0 = 1, adults: a0 = 2, ages: ages0 = [], className }: { rooms?: number; adults?: number; ages?: number[]; className?: string }) {
  const [rooms, setRooms] = useState(r0);
  const [adults, setAdults] = useState(Math.max(a0, r0));
  const [ages, setAges] = useState<(number | null)[]>(ages0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  // Bloqueia a busca enquanto faltar idade de criança.
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      if (ages.some((a) => a === null)) {
        e.preventDefault();
        setError(true);
        setOpen(true);
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [ages]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setChildren = (n: number) => setAges((cur) => (n > cur.length ? [...cur, ...Array(n - cur.length).fill(null)] : cur.slice(0, n)));
  const missing = ages.some((a) => a === null);

  return (
    <div
      ref={box}
      className={cn("relative rounded-[1.25rem] transition hover:bg-surface focus-within:bg-surface", className)}
    >
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="block w-full px-5 py-3 text-left max-sm:px-4 max-sm:py-2.5">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Hóspedes</span>
        <span className={cn("mt-0.5 block truncate text-[15px] font-semibold", missing && error ? "text-red-600" : "text-ink")}>{guestsSummary(rooms, adults, ages.length)}</span>
      </button>
      <input type="hidden" name="quartos" value={rooms} />
      <input type="hidden" name="adultos" value={adults} />
      <input type="hidden" name="criancas" value={ages.length} />
      <input type="hidden" name="idades" value={ages.map((a) => a ?? "").join(",")} />
      <div id={id} hidden={!open} className="absolute right-0 top-full z-40 mt-2 w-[min(92vw,24rem)] rounded-2xl bg-white p-4 shadow-[0_24px_60px_-20px_rgba(10,10,11,0.35)] ring-1 ring-black/[0.06]">
        <Stepper
          label="Quartos"
          value={rooms}
          min={1}
          max={5}
          onChange={(v) => {
            setRooms(v);
            if (adults < v) setAdults(v);
          }}
        />
        <Stepper label="Adultos" hint="18 anos ou mais" value={adults} min={rooms} max={16} onChange={setAdults} />
        <Stepper label="Crianças" hint="0 a 17 anos" value={ages.length} min={0} max={8} onChange={setChildren} />
        <ChildAgesPicker ages={ages} onChange={setAges} error={error} />
        {error && missing && <p className="mt-2 text-[13px] font-medium text-red-600">Informe a idade de cada criança: o preço do hotel depende dela.</p>}
        <button type="button" onClick={() => (missing ? setError(true) : setOpen(false))} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white transition hover:bg-ink-2">
          Pronto
        </button>
      </div>
    </div>
  );
}
