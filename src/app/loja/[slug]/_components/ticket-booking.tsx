"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { cn, Input } from "@/components/ui";
import { PaxStepper } from "./pax-stepper";

type Opt = { optionId: string; title: string; description?: string; adultPix: number; childPix: number | null; available: boolean };

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TicketBooking({
  action,
  supplier,
  productId,
  options,
  childLabel,
  defaultDate,
  minDate,
  defaultAdults,
  defaultChildren,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  supplier: string;
  productId: string;
  options: Opt[];
  childLabel: string;
  defaultDate: string;
  minDate: string;
  defaultAdults: number;
  defaultChildren: number;
}) {
  const [opt, setOpt] = useState(options.find((o) => o.available)?.optionId ?? options[0]?.optionId);
  const [adults, setAdults] = useState(Math.max(defaultAdults, 1));
  const [children, setChildren] = useState(defaultChildren);
  const current = options.find((o) => o.optionId === opt);
  const total = current ? adults * current.adultPix + children * (current.childPix ?? 0) : 0;

  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="supplier" value={supplier} />
      <input type="hidden" name="productId" value={productId} />
      <fieldset>
        <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Tipo de ingresso</legend>
        <div className="space-y-2">
          {options.map((o) => (
            <label
              key={o.optionId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition",
                opt === o.optionId ? "bg-white ring-2 ring-inset ring-ink" : "bg-surface ring-1 ring-inset ring-transparent hover:ring-line",
                !o.available && "cursor-not-allowed opacity-50",
              )}
            >
              <input type="radio" name="optionId" value={o.optionId} checked={opt === o.optionId} disabled={!o.available} onChange={() => setOpt(o.optionId)} className="mt-1 accent-[var(--store-accent)]" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">{o.title}</span>
                {o.description && <span className="block text-xs text-muted">{o.description}</span>}
              </span>
              <span className="text-right text-xs leading-tight text-muted tabular">
                <span className="block text-[15px] font-semibold text-ink">{fmt(o.adultPix)}</span>
                adulto{o.childPix !== null && <span className="block">{fmt(o.childPix)} criança</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Data da visita</span>
        <Input type="date" name="date" defaultValue={defaultDate} min={minDate} required />
      </label>
      <div className="rounded-2xl bg-surface px-4 py-1 [&_button]:bg-white">
        <PaxStepper name="adults" label="Adultos" min={0} max={20} defaultValue={adults} onChange={setAdults} />
        {current?.childPix !== null && <PaxStepper name="children" label="Crianças" hint={childLabel} min={0} max={20} defaultValue={children} onChange={setChildren} />}
      </div>
      <div className="rounded-2xl bg-ink px-5 py-4 text-white">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-white/60">Total estimado</span>
          <span className="text-[1.75rem] font-semibold tracking-[-0.04em] tabular">{fmt(total)} <span className="text-xs font-semibold tracking-normal text-white/60">Pix</span></span>
        </div>
        <p className="mt-1 text-xs text-white/50">Confirmado com o fornecedor ao adicionar. Também em 10x sem juros.</p>
      </div>
      <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Consultando o fornecedor…" disabled={adults + children === 0}>
        Adicionar ao carrinho
      </SubmitButton>
    </ActionForm>
  );
}
