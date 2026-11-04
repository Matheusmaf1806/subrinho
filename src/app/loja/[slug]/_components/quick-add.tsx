"use client";

/**
 * "Adicionar ao carrinho" direto do card, numa tela só:
 *  - datas e pessoas no topo, já preenchidas (carrinho > busca) e sempre editáveis;
 *  - os preços aparecem sozinhos quando as datas foram escolhidas pelo cliente (busca ou carrinho)
 *    e se atualizam a cada mudança; datas só sugeridas pedem confirmação antes;
 *  - lista de opções do mais barato ao mais caro (foto do quarto, café, cancelamento grátis);
 *  - rodapé fixo com o total para as pessoas escolhidas, o resumo e o botão.
 * Abre por portal no body (o topo tem desfoque, que prenderia o "fixed").
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, BadgeCheck, CalendarClock, Coffee, Loader2, ShoppingBag, X } from "lucide-react";
import { DateInput, DateRange, formatDateBr } from "@/components/date-picker";
import type { ActionState } from "@/components/ui-client";
import { cn } from "@/components/ui";
import type { QuickDefaults } from "../_lib/quick-defaults";
import type { QuickInput, QuickOption } from "../actions";
import { PaxStepper } from "./pax-stepper";
import { GuestsField } from "./guests-field";
import { openCartDrawer } from "./cart-events";

export type QuickCtx = {
  add: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  options: (ref: string, input: QuickInput) => Promise<{ options: QuickOption[]; error?: string }>;
  defaults: QuickDefaults;
  minDate: string;
};

type Category = "TICKETS" | "LODGING" | "HOUSES";

const fmt = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string) => formatDateBr(iso, { weekday: false, year: false });
const nightsOf = (a: string, b: string) => (a && b && b > a ? Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) : 0);

export function QuickAdd({
  ctx,
  productRef,
  category,
  title,
  destination,
  href,
  size = "md",
  className,
}: {
  ctx: QuickCtx;
  productRef: string;
  category: Category;
  title: string;
  /** Cidade do produto: vai junto para o carrinho sugerir o que combina com a viagem. */
  destination?: string;
  /** Página do produto ("Ver detalhes" dentro da janela). */
  href?: string;
  /** "sm": botão compacto (sugestões do carrinho). */
  size?: "md" | "sm";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    // o foco volta para o botão que abriu
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Adicionar ${title} ao carrinho`}
        className={cn("inline-flex items-center justify-center gap-1.5 rounded-full bg-ink font-semibold text-white transition hover:bg-ink-2", size === "sm" ? "h-8 px-3 text-[12px]" : "h-10 px-4 text-[13px]", className)}
      >
        <ShoppingBag className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden /> Adicionar
      </button>
      {open && <QuickDialog ctx={ctx} productRef={productRef} category={category} title={title} destination={destination} href={href} onClose={close} />}
    </>
  );
}

type Trip = { date: string; checkin: string; checkout: string; rooms: number; adults: number; children: number; ages: (number | null)[] };

function QuickDialog({ ctx, productRef, category, title, destination, href, onClose }: { ctx: QuickCtx; productRef: string; category: Category; title: string; destination?: string; href?: string; onClose: () => void }) {
  const d = ctx.defaults;
  const isTicket = category === "TICKETS";
  const isLodging = category === "LODGING";
  const confirmed = isTicket ? !!d.confirmed?.date : !!d.confirmed?.stay;
  const box = useRef<HTMLDivElement>(null);
  const [trip, setTrip] = useState<Trip>({ date: d.date, checkin: d.checkin, checkout: d.checkout, rooms: d.rooms, adults: d.adults, children: d.children, ages: isLodging ? [...d.ages] : [] });
  // preços automáticos: já de cara com datas escolhidas pelo cliente; senão, depois de confirmar
  const [armed, setArmed] = useState(confirmed);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<QuickOption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  const children = isLodging ? trip.ages.length : trip.children;
  const input = useMemo<QuickInput>(
    () =>
      isTicket
        ? { date: trip.date, adults: trip.adults, children }
        : isLodging
          ? { checkin: trip.checkin, checkout: trip.checkout, rooms: trip.rooms, adults: trip.adults, children, ages: trip.ages.filter((a): a is number => a !== null) }
          : { checkin: trip.checkin, checkout: trip.checkout, adults: trip.adults, children },
    [trip, children, isTicket, isLodging],
  );
  const key = JSON.stringify(input);
  const problem = (() => {
    if (isTicket && !trip.date) return "Escolha a data da visita";
    if (!isTicket && (!trip.checkin || !trip.checkout || trip.checkout <= trip.checkin)) return "Escolha o check-in e o check-out";
    if (trip.adults + children === 0) return "Escolha pelo menos uma pessoa";
    if (isLodging && trip.ages.some((a) => a === null)) return "Informe a idade de cada criança para ver os preços";
    return null;
  })();

  const load = useCallback(async () => {
    if (problem) return;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await ctx.options(productRef, input);
      if (n !== seq.current) return;
      setOptions(r.options);
      setNotice(r.error ?? null);
      setLoadedFor(key);
      // mantém a escolha se ainda existir; senão, a mais barata disponível
      setChosen((cur) => (r.options.some((o) => o.optionId === cur && o.available) ? cur : (r.options.find((o) => o.available)?.optionId ?? null)));
    } catch {
      if (n === seq.current) setNotice("Não foi possível consultar agora. Tente de novo em instantes.");
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [ctx, productRef, input, key, problem]);

  // recalcula sozinho a cada mudança (com uma pausa curta para não consultar a cada clique)
  useEffect(() => {
    if (!armed || problem) return;
    const t = setTimeout(() => void load(), loadedFor === null ? 0 : 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, key, problem]);

  // trava a rolagem da página, foco na janela, Esc fecha (menos quando o calendário/hóspedes está aberto)
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-date-popover]") || document.querySelector("[data-guests-panel]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const update = (patch: Partial<Trip>, dates = false) => {
    setTrip((t) => ({ ...t, ...patch }));
    if (dates) setArmed(true);
  };

  const stale = loadedFor !== key;
  const picked = !stale ? options.find((o) => o.optionId === chosen && o.available) : undefined;
  const cheapest = options.find((o) => o.available)?.optionId;
  const nights = nightsOf(trip.checkin, trip.checkout);
  const people = isLodging
    ? [plural(trip.rooms, "quarto", "quartos"), plural(trip.adults, "adulto", "adultos"), children ? plural(children, "criança", "crianças") : null].filter(Boolean).join(", ")
    : [trip.adults ? plural(trip.adults, "adulto", "adultos") : null, children ? plural(children, "criança", "crianças") : null].filter(Boolean).join(" e ");
  const when = isTicket ? (trip.date ? day(trip.date) : "") : trip.checkin && trip.checkout ? `${day(trip.checkin)} a ${day(trip.checkout)} · ${plural(nights, "noite", "noites")}` : "";
  const source = d.fromCart ? "Datas e pessoas do seu carrinho" : confirmed ? "Datas e pessoas da sua busca" : null;

  const add = async () => {
    if (!picked) return;
    const fd = new FormData();
    fd.set("ref", picked.ref);
    fd.set("optionId", picked.optionId);
    if (destination) fd.set("destino", destination);
    if (isTicket) fd.set("date", trip.date);
    else {
      fd.set("checkIn", trip.checkin);
      fd.set("checkOut", trip.checkout);
    }
    fd.set("adults", String(trip.adults));
    fd.set("children", String(children));
    if (isLodging) {
      fd.set("rooms", String(trip.rooms));
      fd.set("childrenAges", input.ages?.join(",") ?? "");
    }
    setAdding(true);
    setError(null);
    try {
      const r = await ctx.add({}, fd);
      if (r?.error) return setError(r.error);
      onClose();
      openCartDrawer({ added: true });
    } catch {
      setError("Não foi possível adicionar. Tente de novo.");
    } finally {
      setAdding(false);
    }
  };

  const optionLabel = isLodging ? "Escolha o quarto" : isTicket ? "Escolha o ingresso" : "Confira a opção";

  return createPortal(
    <div data-quick-dialog className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Adicionar ${title} ao carrinho`}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl outline-none sm:max-w-xl sm:rounded-[1.75rem]"
      >
        {/* cabeçalho */}
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Adicionar ao carrinho</p>
            <p className="mt-1 line-clamp-2 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">{title}</p>
            {href && (
              <Link href={href} onClick={onClose} className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-muted underline decoration-ink/20 underline-offset-4 hover:text-ink">
                Ver detalhes <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-ink transition hover:bg-surface-2" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
          {/* viagem: datas e pessoas, sempre à vista */}
          <section aria-label="Datas e pessoas" className="rounded-2xl bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{isTicket ? "Visita" : isLodging ? "Estadia e hóspedes" : "Estadia e pessoas"}</p>
              {source ? (
                <p className="text-[12px] text-muted">{source}</p>
              ) : (
                <p className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-900">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Confira as datas
                </p>
              )}
            </div>
            {isTicket ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <DateInput name="date" label="Data da visita" variant="card" value={trip.date} onChange={(v) => update({ date: v }, true)} min={ctx.minDate} />
                <div className="rounded-2xl border border-line bg-white px-4 [&_button]:h-8 [&_button]:w-8">
                  <PaxStepper name="adults" label="Adultos" min={0} max={20} defaultValue={trip.adults} onChange={(v) => update({ adults: v })} />
                  <PaxStepper name="children" label="Crianças" min={0} max={10} defaultValue={trip.children} onChange={(v) => update({ children: v })} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <DateRange names={["checkin", "checkout"]} labels={["Check-in", "Check-out"]} defaultValues={[trip.checkin, trip.checkout]} onChange={([a, b]) => update({ checkin: a, checkout: b }, !!(a && b))} min={ctx.minDate} variant="card" />
                </div>
                {isLodging ? (
                  <GuestsField rooms={trip.rooms} adults={trip.adults} ages={d.ages} onChange={(g) => update({ rooms: g.rooms, adults: g.adults, ages: g.ages })} className="rounded-2xl border border-line bg-white" />
                ) : (
                  <div className="rounded-2xl border border-line bg-white px-4 [&_button]:h-8 [&_button]:w-8">
                    <PaxStepper name="adults" label="Adultos" min={1} max={20} defaultValue={trip.adults} onChange={(v) => update({ adults: v })} />
                    <PaxStepper name="children" label="Crianças" min={0} max={10} defaultValue={trip.children} onChange={(v) => update({ children: v })} />
                  </div>
                )}
              </div>
            )}
            {problem && armed && <p className="mt-2 px-1 text-[13px] font-medium text-amber-800">{problem}</p>}
          </section>

          {/* opções */}
          {armed && (
            <section className="mt-5" aria-label={optionLabel} aria-busy={loading}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-ink">{optionLabel}</h3>
                {loading ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" role="status">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Atualizando preços
                  </span>
                ) : options.length > 1 ? (
                  <span className="text-[12px] text-muted">{options.length} opções · do mais barato ao mais caro</span>
                ) : null}
              </div>
              {options.length === 0 && loading ? (
                <ul className="space-y-2" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface" />
                  ))}
                </ul>
              ) : notice && !options.length ? (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-950" role="status">
                  {notice}. Troque as datas ou as pessoas acima.
                </p>
              ) : (
                <ul className={cn("space-y-2 transition-opacity", loading && "pointer-events-none opacity-50")}>
                  {options.map((o) => (
                    <li key={`${o.ref}-${o.optionId}`}>
                      <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 ring-inset transition", chosen === o.optionId ? "bg-white ring-2 ring-ink" : "bg-surface ring-transparent hover:ring-ink/15", !o.available && "cursor-not-allowed opacity-50")}>
                        <input type="radio" name="quick-option" className="sr-only" checked={chosen === o.optionId} disabled={!o.available} onChange={() => setChosen(o.optionId)} />
                        <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2 ring-inset", chosen === o.optionId ? "ring-ink" : "ring-ink/25")}>
                          {chosen === o.optionId && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                        </span>
                        {o.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.photo} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-surface-2 object-cover" decoding="async" onError={(e) => (e.currentTarget.style.display = "none")} />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-snug text-ink">{o.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                            {o.subtitle && !o.title.toLowerCase().includes(o.subtitle.toLowerCase()) && (
                              <span className="inline-flex items-center gap-1">
                                {/caf[eé]/i.test(o.subtitle) && <Coffee className="h-3.5 w-3.5" aria-hidden />} {o.subtitle}
                              </span>
                            )}
                            {o.freeCancel && (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Cancelamento grátis
                              </span>
                            )}
                            {!o.available && <span className="font-semibold text-red-700">Esgotado</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-right leading-tight">
                          {o.optionId === cheapest && options.length > 1 && <span className="mb-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Mais barato</span>}
                          <span className="block text-[15px] font-semibold text-ink tabular">{fmt(o.total?.pix ?? o.pix)}</span>
                          <span className="block text-[11px] text-muted">
                            {isTicket ? (!people ? "por adulto" : o.totalComplete ? `total · ${people}` : `total de ${plural(trip.adults, "adulto", "adultos")}`) : `total · ${plural(nights, "noite", "noites")}`}
                          </span>
                          {isTicket && trip.adults + children > 1 && <span className="block text-[11px] text-muted tabular">{fmt(o.pix)} por adulto{o.childPix && children ? ` · ${fmt(o.childPix)} criança` : ""}</span>}
                          {o.commission && <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white tabular">comissão {fmt(o.commission)}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* rodapé fixo: total + resumo + botão */}
        <div className="shrink-0 border-t border-line bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
          {error && <p className="mb-2 text-[13px] font-medium text-red-600">{error}</p>}
          {armed && (when || people) && <p className="mb-1.5 text-[12px] font-medium text-ink/80">{[when, people].filter(Boolean).join(" · ")}</p>}
          {!armed ? (
            <button type="button" onClick={() => setArmed(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-fg transition hover:opacity-90">
              {isLodging ? "Ver quartos e preços" : "Ver preços"}
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1 leading-tight" aria-live="polite">
                {picked?.total ? (
                  <>
                    <p className="text-[12px] text-muted">Total no Pix</p>
                    <p className="text-[22px] font-semibold tracking-[-0.03em] text-ink tabular">{fmt(picked.total.pix)}</p>
                    <p className="text-[12px] text-muted">
                      ou {picked.total.planCount}x de {fmt(picked.total.planInstallment)} sem juros
                    </p>
                    {!picked.totalComplete && <p className="text-[11px] text-amber-800">Crianças: preço confirmado ao adicionar</p>}
                  </>
                ) : (
                  <p className="text-[13px] text-muted">{loading ? "Consultando preços…" : problem ?? (options.length ? "Escolha uma opção" : "")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={add}
                disabled={!picked || adding || loading}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-50"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}
                {adding ? "Adicionando…" : "Adicionar"}
              </button>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-muted">O preço final é confirmado na hora de adicionar.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
