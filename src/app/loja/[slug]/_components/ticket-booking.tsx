"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { openCartDrawer } from "./cart-drawer";
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
      <label className="block">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Data da visita</span>
        <Input
          type="date"
          name="date"
          defaultValue={defaultDate}
          min={minDate}
          required
          // horários e preços dependem da data: recarrega a página com a nova data
          onChange={(e) => {
            if (!e.target.value) return;
            const sp = new URLSearchParams(window.location.search);
            sp.set("data", e.target.value);
            sp.set("adultos", String(adults));
            sp.set("criancas", String(children));
            router.replace(`?${sp}`, { scroll: false });
          }}
        />
      </label>
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
              <span className="text-right text-xs leading-tight text-muted tabular">
                <span className="block text-[15px] font-semibold text-ink">{fmt(o.adultPix)}</span>
                adulto{o.childPix !== null && <span className="block">{fmt(o.childPix)} criança</span>}
                {o.adultCommission !== undefined && <span className="mt-1 block font-semibold text-emerald-700">comissão {fmt(o.adultCommission)}</span>}
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
          <p className="mt-2 text-[13px] font-semibold text-emerald-300 tabular">
            Comissão da agência: {fmt(commission)}
            {current?.commissionPct !== undefined ? ` · ${current.commissionPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : ""}
          </p>
        )}
      </div>
      <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Consultando o fornecedor…" disabled={adults + children === 0 || !current?.available}>
        Adicionar ao carrinho
      </SubmitButton>
    </ActionForm>
  );
}
