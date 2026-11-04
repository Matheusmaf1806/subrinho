"use client";

/**
 * "Adicionar ao carrinho" direto do card: pergunta só o necessário (data ou período, pessoas e, se
 * houver mais de uma, a opção), já preenchido com o que o cliente usa no carrinho ou na busca,
 * mostra o preço para essas escolhas e adiciona. Abre por portal no body.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Loader2, ShoppingBag, X } from "lucide-react";
import { DateInput, DateRange } from "@/components/date-picker";
import type { ActionState } from "@/components/ui-client";
import { cn } from "@/components/ui";
import type { QuickDefaults } from "../_lib/quick";
import type { QuickInput, QuickOption } from "../actions";
import { PaxStepper } from "./pax-stepper";
import { GuestsField } from "./guests-field";
import { openCartDrawer } from "./cart-drawer";

export type QuickCtx = {
  add: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  options: (ref: string, input: QuickInput) => Promise<{ options: QuickOption[]; error?: string }>;
  defaults: QuickDefaults;
  minDate: string;
};

const fmt = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function QuickAdd({ ctx, productRef, category, title, className }: { ctx: QuickCtx; productRef: string; category: "TICKETS" | "LODGING" | "HOUSES"; title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-white transition hover:bg-ink-2", className)}>
        <ShoppingBag className="h-4 w-4" aria-hidden /> Adicionar
      </button>
      {open && <QuickDialog ctx={ctx} productRef={productRef} category={category} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickDialog({ ctx, productRef, category, title, onClose }: { ctx: QuickCtx; productRef: string; category: "TICKETS" | "LODGING" | "HOUSES"; title: string; onClose: () => void }) {
  const d = ctx.defaults;
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<"ask" | "pick">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<QuickOption[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [input, setInput] = useState<QuickInput | null>(null);

  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /** Lê o formulário (calendário e pessoas guardam o valor em campos escondidos). */
  const read = (): QuickInput => {
    const fd = new FormData(form.current!);
    const num = (k: string, def = 0) => {
      const v = Number(fd.get(k));
      return Number.isFinite(v) ? v : def;
    };
    if (category === "LODGING") {
      const children = num("criancas");
      return {
        checkin: String(fd.get("checkin") ?? ""),
        checkout: String(fd.get("checkout") ?? ""),
        rooms: num("quartos", 1),
        adults: num("adultos", 2),
        children,
        ages: String(fd.get("idades") ?? "")
          .split(",")
          .filter((x) => x !== "")
          .map(Number)
          .slice(0, children),
      };
    }
    if (category === "HOUSES") return { checkin: String(fd.get("checkin") ?? ""), checkout: String(fd.get("checkout") ?? ""), adults: num("adults", 2), children: num("children") };
    return { date: String(fd.get("date") ?? ""), adults: num("adults", 2), children: num("children") };
  };

  const search = async () => {
    const i = read();
    if ((category === "TICKETS" && !i.date) || (category !== "TICKETS" && (!i.checkin || !i.checkout))) return setError("Escolha as datas");
    if (i.adults + i.children === 0) return setError("Escolha pelo menos uma pessoa");
    if (category === "LODGING" && (i.ages?.length ?? 0) < i.children) return setError("Informe a idade de cada criança");
    setBusy(true);
    setError(null);
    try {
      const r = await ctx.options(productRef, i);
      setInput(i);
      setOptions(r.options);
      setChosen(r.options.find((o) => o.available)?.optionId ?? null);
      if (r.error) setError(r.error);
      setStep("pick");
    } catch {
      setError("Não foi possível consultar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const o = options.find((x) => x.optionId === chosen);
    if (!o || !input) return;
    const fd = new FormData();
    fd.set("ref", o.ref);
    fd.set("optionId", o.optionId);
    if (category === "TICKETS") fd.set("date", input.date!);
    else {
      fd.set("checkIn", input.checkin!);
      fd.set("checkOut", input.checkout!);
    }
    fd.set("adults", String(input.adults));
    fd.set("children", String(input.children));
    if (category === "LODGING") {
      fd.set("rooms", String(input.rooms ?? 1));
      fd.set("childrenAges", (input.ages ?? []).join(","));
    }
    setBusy(true);
    setError(null);
    try {
      const r = await ctx.add({}, fd);
      if (r?.error) return setError(r.error);
      onClose();
      openCartDrawer({ added: true });
    } catch {
      setError("Não foi possível adicionar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const picked = options.find((o) => o.optionId === chosen);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Adicionar ${title}`} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[1.75rem] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Adicionar ao carrinho</p>
            <p className="mt-1 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">{title}</p>
            {d.fromCart && step === "ask" && <p className="mt-1 text-[12px] text-muted">Preenchido com as datas e pessoas do seu carrinho.</p>}
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-ink" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form ref={form} className={cn("mt-5 space-y-4", step !== "ask" && "hidden")} onSubmit={(e) => (e.preventDefault(), search())}>
          {category === "TICKETS" ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Data da visita</p>
              <DateInput name="date" label="Data da visita" defaultValue={d.date} min={ctx.minDate} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <DateRange names={["checkin", "checkout"]} labels={["Check-in", "Check-out"]} defaultValues={[d.checkin, d.checkout]} min={ctx.minDate} variant="card" />
            </div>
          )}
          {category === "LODGING" ? (
            <GuestsField rooms={d.rooms} adults={d.adults} ages={d.ages} className="rounded-2xl border border-line bg-white" />
          ) : (
            <div className="rounded-2xl bg-surface px-4 py-1 [&_button]:bg-white">
              <PaxStepper name="adults" label="Adultos" min={category === "HOUSES" ? 1 : 0} max={20} defaultValue={d.adults} />
              <PaxStepper name="children" label="Crianças" min={0} max={10} defaultValue={d.children} />
            </div>
          )}
          {error && <p className="text-[13px] font-medium text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Consultando preços…" : category === "LODGING" ? "Ver quartos e preços" : "Ver preços"}
          </button>
        </form>

        {step === "pick" && (
          <div className="mt-5 space-y-4">
            <button type="button" onClick={() => setStep("ask")} className="text-[13px] font-semibold text-ink underline decoration-ink/25 underline-offset-4">
              ← Alterar datas ou pessoas
            </button>
            {options.length > 0 && (
              <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {options.map((o) => (
                  <li key={`${o.ref}-${o.optionId}`}>
                    <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 ring-inset transition", chosen === o.optionId ? "bg-white ring-2 ring-ink" : "bg-surface ring-transparent hover:ring-ink/15", !o.available && "cursor-not-allowed opacity-50")}>
                      <input type="radio" name="opt" className="mt-1 accent-brand" checked={chosen === o.optionId} disabled={!o.available} onChange={() => setChosen(o.optionId)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-snug text-ink">{o.title}</span>
                        {o.subtitle && <span className="block text-[12px] text-muted">{o.subtitle}</span>}
                        {o.freeCancel && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Cancelamento grátis
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right leading-tight">
                        <span className="block text-[15px] font-semibold text-ink tabular">{fmt(o.pix)}</span>
                        <span className="block text-[11px] text-muted">{o.per === "adult" ? "por adulto · Pix" : "total · Pix"}</span>
                        {o.commission && <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white tabular">comissão {fmt(o.commission)}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-[13px] font-medium text-red-600">{error}</p>}
            {options.length > 0 && (
              <button type="button" onClick={add} disabled={busy || !picked?.available} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
                {busy ? "Confirmando com o fornecedor…" : "Adicionar ao carrinho"}
              </button>
            )}
            <p className="text-center text-[12px] text-muted">O preço final é confirmado com o fornecedor ao adicionar.</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
