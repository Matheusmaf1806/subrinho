"use client";

import { DateInput } from "@/components/date-picker";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { openCartDrawer } from "./cart-events";
import { cn, Input } from "@/components/ui";
import { PaxStepper } from "./pax-stepper";

type Opt = {
  optionId: string;
  title: string;
  description?: string;
  adultPix: number;
  childPix: number | null;
  available: boolean;
  /** Só vêm quando quem vê pode (decidido no servidor): fornecedor (Subrinho) e comissão (ADMIN da agência). */
  supplier?: string;
  adultCommission?: number;
  childCommission?: number | null;
  commissionPct?: number;
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function TicketBooking({
  action,
  productRef,
  destination,
  options,
  childLabel,
  defaultDate,
  minDate,
  defaultAdults,
  defaultChildren,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** Referência neutra do produto (sem o nome do fornecedor). */
  productRef: string;
  /** Cidade do ingresso: o carrinho usa para sugerir hotéis no mesmo destino. */
  destination?: string;
  options: Opt[];
  childLabel: string;
  defaultDate: string;
  minDate: string;
  defaultAdults: number;
  defaultChildren: number;
}) {
  const router = useRouter();
  const [opt, setOpt] = useState(options.find((o) => o.available)?.optionId ?? options[0]?.optionId);
  const [adults, setAdults] = useState(Math.max(defaultAdults, 1));
  const [children, setChildren] = useState(defaultChildren);
  const current = options.find((o) => o.optionId === opt);
  const total = current ? adults * current.adultPix + children * (current.childPix ?? 0) : 0;
  const commission = current?.adultCommission !== undefined ? adults * current.adultCommission + children * (current.childCommission ?? 0) : null;

  return (
    <ActionForm action={action} className="space-y-4" onSuccess={() => openCartDrawer({ added: true })}>
      <input type="hidden" name="ref" value={productRef} />
      {destination && <input type="hidden" name="destino" value={destination} />}
      <div>
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Data da visita</span>
        <DateInput
          name="date"
          label="Data da visita"
          variant="field"
          defaultValue={defaultDate}
          min={minDate}
          // horários e preços dependem da data: recarrega a página com a nova data
          onChange={(v) => {
            const sp = new URLSearchParams(window.location.search);
            sp.set("data", v);
            sp.set("adultos", String(adults));
            sp.set("criancas", String(children));
            router.replace(`?${sp}`, { scroll: false });
          }}
        />
      </div>
      {options.length === 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3.5 text-sm text-amber-950">Sem horários disponíveis nesta data. Escolha outra data acima.</p>
      )}
      <fieldset hidden={options.length === 0}>
        <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{options.length > 1 ? "Horário / tipo de ingresso" : "Ingresso"}</legend>
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
              <input type="radio" name="optionId" value={o.optionId} checked={opt === o.optionId} disabled={!o.available} onChange={() => setOpt(o.optionId)} className="mt-1 accent-brand" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">{o.title}</span>
                {o.description && <span className="block text-xs text-muted">{o.description}</span>}
                {o.supplier && <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">{o.supplier}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end text-right text-xs leading-tight text-muted tabular">
                <span className="text-[15px] font-semibold text-ink">{fmt(o.adultPix)}</span>
                <span>por adulto</span>
                {o.childPix !== null && <span>{fmt(o.childPix)} por criança</span>}
                {o.adultCommission !== undefined && (
                  <span className="mt-2 whitespace-nowrap rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                    comissão {fmt(o.adultCommission)}
                    {o.childCommission ? ` · ${fmt(o.childCommission)} criança` : ""}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
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
        {commission !== null && (
          <p className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-white tabular">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">Sua comissão</span>
            <span className="text-[17px] font-semibold">
              {fmt(commission)}
              {current?.commissionPct !== undefined ? <span className="text-[13px] font-medium text-white/80"> · {current.commissionPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span> : null}
            </span>
          </p>
        )}
      </div>
      <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Consultando o fornecedor…" disabled={adults + children === 0 || !current?.available}>
        Adicionar ao carrinho
      </SubmitButton>
    </ActionForm>
  );
}
