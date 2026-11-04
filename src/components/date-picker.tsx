"use client";

/**
 * Calendário do site (substitui o <input type="date"> do navegador, que muda de cara em cada
 * navegador e mostra mm/dd/aaaa). Em português, com navegação por mês/ano, data única
 * (DateInput) ou período (DateRange, ex.: check-in → check-out com 2 meses lado a lado e o total de
 * noites). Abre por portal no body (o topo da loja tem backdrop-filter e prenderia o `fixed`); no
 * celular vira painel de baixo para cima. Envia o valor em campos escondidos (aaaa-mm-dd).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "./ui";

// ───────────────────────── datas (sem fuso: tudo em aaaa-mm-dd) ─────────────────────────

type YMD = { y: number; m: number; d: number }; // m: 0..11
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (v: YMD) => `${v.y}-${pad(v.m + 1)}-${pad(v.d)}`;
const parse = (s: string | null | undefined): YMD | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};
const todayIso = () => {
  const t = new Date();
  return toIso({ y: t.getFullYear(), m: t.getMonth(), d: t.getDate() });
};
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const addMonths = (y: number, m: number, n: number) => {
  const t = new Date(y, m + n, 1);
  return { y: t.getFullYear(), m: t.getMonth() };
};
const nightsBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEK_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "sáb, 19 dez 2026" (ou sem o dia da semana). */
export function formatDateBr(iso: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}) {
  const v = parse(iso);
  if (!v) return "";
  const wd = WEEK_SHORT[new Date(v.y, v.m, v.d).getDay()];
  return `${opts.weekday === false ? "" : `${wd}, `}${v.d} ${MONTHS_SHORT[v.m]}${opts.year === false ? "" : ` ${v.y}`}`;
}

// ───────────────────────── popover ─────────────────────────

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

function Popover({ anchor, open, onClose, children, label }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    if (!anchor || !box.current || phone) return;
    const r = anchor.getBoundingClientRect();
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const below = r.bottom + 8 + h <= window.innerHeight || r.top - 8 - h < 0;
    setPos({ top: below ? r.bottom + 8 : r.top - 8 - h, left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8) });
  }, [anchor, phone]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, onClose, anchor, place]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    phone ? (
      <div className="fixed inset-0 z-[95] flex items-end bg-black/40" role="presentation">
        <div ref={box} role="dialog" aria-label={label} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[1.75rem] bg-white p-4 pb-6 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[15px] font-semibold text-ink">{label}</p>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink" aria-label="Fechar calendário">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    ) : (
      <div
        ref={box}
        role="dialog"
        aria-label={label}
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        className="fixed z-[95] rounded-[1.5rem] bg-white p-4 shadow-[0_30px_80px_-20px_rgba(10,10,11,0.45)] ring-1 ring-black/[0.08]"
      >
        {children}
      </div>
    ),
    document.body,
  );
}

// ───────────────────────── grade do mês ─────────────────────────

function Month({
  y,
  m,
  min,
  max,
  start,
  end,
  hover,
  onPick,
  onHover,
}: {
  y: number;
  m: number;
  min?: string;
  max?: string;
  start: string | null;
  end: string | null;
  hover?: string | null;
  onPick: (iso: string) => void;
  onHover?: (iso: string | null) => void;
}) {
  const first = new Date(y, m, 1).getDay();
  const total = daysIn(y, m);
  const today = todayIso();
  const rangeEnd = end ?? (start && hover && hover > start ? hover : null);
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => toIso({ y, m, d: i + 1 }))];
  return (
    <div className="w-[17.5rem]">
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-muted">
        {WEEK.map((w, i) => (
          <span key={i} className="py-1.5">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover?.(null)}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />;
          const disabled = (!!min && iso < min) || (!!max && iso > max);
          const isStart = iso === start;
          const isEnd = iso === rangeEnd;
          const inRange = !!start && !!rangeEnd && iso > start && iso < rangeEnd;
          const edge = isStart || isEnd;
          return (
            <span key={iso} className={cn("relative py-0.5", inRange && "bg-brand-50", isStart && rangeEnd && "bg-gradient-to-r from-transparent from-50% to-brand-50 to-50%", isEnd && start && "bg-gradient-to-l from-transparent from-50% to-brand-50 to-50%")}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso)}
                onMouseEnter={() => onHover?.(iso)}
                aria-label={formatDateBr(iso)}
                aria-pressed={edge}
                className={cn(
                  "relative mx-auto grid h-10 w-10 place-items-center rounded-full text-[14px] font-medium tabular transition",
                  disabled ? "cursor-not-allowed text-ink/25 line-through decoration-ink/20" : edge ? "bg-ink font-semibold text-white" : "text-ink hover:bg-surface",
                  !edge && iso === today && !disabled && "ring-1 ring-inset ring-ink/30",
                )}
              >
                {+iso.slice(8)}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Cabeçalho: setas + mês/ano (com seletor de ano para datas distantes, ex.: nascimento). */
function Nav({ y, m, onChange, count, min, max, yearSelect }: { y: number; m: number; onChange: (y: number, m: number) => void; count: number; min?: string; max?: string; yearSelect?: boolean }) {
  const minYM = min ? min.slice(0, 7) : null;
  const maxYM = max ? max.slice(0, 7) : null;
  const ym = (yy: number, mm: number) => `${yy}-${pad(mm + 1)}`;
  const prev = addMonths(y, m, -1);
  const lastShown = addMonths(y, m, count - 1);
  const next = addMonths(y, m, 1);
  const canPrev = !minYM || ym(prev.y, prev.m) >= minYM;
  const canNext = !maxYM || ym(addMonths(lastShown.y, lastShown.m, 1).y, addMonths(lastShown.y, lastShown.m, 1).m) <= maxYM;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 111 }, (_, i) => thisYear + 5 - i).filter((yy) => (!min || yy >= +min.slice(0, 4)) && (!max || yy <= +max.slice(0, 4)));
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <button type="button" onClick={() => onChange(prev.y, prev.m)} disabled={!canPrev} className="grid h-9 w-9 place-items-center rounded-full text-ink transition hover:bg-surface disabled:opacity-25" aria-label="Mês anterior">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex flex-1 items-center justify-around gap-4 text-[15px] font-semibold capitalize text-ink">
        {Array.from({ length: count }, (_, i) => {
          const t = addMonths(y, m, i);
          return i === 0 && yearSelect ? (
            <span key={i} className="flex items-center gap-1.5">
              <select value={t.m} onChange={(e) => onChange(t.y, +e.target.value)} className="rounded-lg bg-surface px-2 py-1 text-[14px] font-semibold capitalize outline-none" aria-label="Mês">
                {MONTHS.map((mn, mi) => (
                  <option key={mn} value={mi}>
                    {mn}
                  </option>
                ))}
              </select>
              <select value={t.y} onChange={(e) => onChange(+e.target.value, t.m)} className="rounded-lg bg-surface px-2 py-1 text-[14px] font-semibold outline-none" aria-label="Ano">
                {years.map((yy) => (
                  <option key={yy} value={yy}>
                    {yy}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            <span key={i} className={i > 0 ? "hidden md:inline" : undefined}>
              {MONTHS[t.m]} {t.y}
            </span>
          );
        })}
      </div>
      <button type="button" onClick={() => onChange(next.y, next.m)} disabled={!canNext} className="grid h-9 w-9 place-items-center rounded-full text-ink transition hover:bg-surface disabled:opacity-25" aria-label="Próximo mês">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

// ───────────────────────── gatilhos (aparência do campo) ─────────────────────────

export type DateVariant = "field" | "bar" | "card";

const TRIGGER: Record<DateVariant, string> = {
  field: "ui-input flex h-12 w-full items-center gap-2.5 rounded-2xl bg-surface px-4 text-left text-[15px] text-ink ring-1 ring-inset ring-transparent transition hover:ring-ink/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
  bar: "relative block w-full rounded-[1.25rem] px-5 py-3 text-left transition hover:bg-surface focus-visible:bg-surface focus-visible:outline-none max-sm:bg-surface/70 max-sm:px-4 max-sm:py-2.5",
  card: "relative block w-full rounded-2xl border border-line bg-white py-2.5 pl-11 pr-4 text-left transition hover:border-ink/30 focus-visible:border-ink focus-visible:outline-none",
};

function Trigger({ variant, label, value, placeholder, onClick, active, triggerRef, className, id }: { variant: DateVariant; label?: string; value: string | null; placeholder: string; onClick: () => void; active: boolean; triggerRef?: (el: HTMLButtonElement | null) => void; className?: string; id?: string }) {
  const text = value ? formatDateBr(value) : placeholder;
  if (variant === "field")
    return (
      <button id={id} ref={triggerRef} type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={active} className={cn(TRIGGER.field, active && "ring-2 ring-ink", className)}>
        <CalendarDays className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
        <span className={cn("truncate", value ? "font-semibold" : "text-muted")}>{text}</span>
      </button>
    );
  return (
    <button id={id} ref={triggerRef} type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={active} className={cn(TRIGGER[variant], active && "bg-surface", className)}>
      {variant === "card" && <CalendarDays className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />}
      {label && <span className={variant === "bar" ? "block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted" : "block text-[12px] font-medium text-muted"}>{label}</span>}
      <span className={cn("mt-0.5 block truncate text-[15px]", value ? "font-semibold text-ink" : "font-medium text-muted/70")}>{text}</span>
    </button>
  );
}

// ───────────────────────── data única ─────────────────────────

export function DateInput({
  name,
  label,
  value,
  defaultValue,
  onChange,
  min,
  max,
  variant = "field",
  placeholder = "Escolha a data",
  birth,
  className,
  id,
}: {
  name: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  min?: string;
  max?: string;
  variant?: DateVariant;
  placeholder?: string;
  /** Data de nascimento: abre uns anos atrás e mostra seletor de ano. */
  birth?: boolean;
  className?: string;
  id?: string;
}) {
  const [inner, setInner] = useState(value ?? defaultValue ?? "");
  useEffect(() => {
    if (value !== undefined) setInner(value);
  }, [value]);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const maxEff = birth ? (max ?? todayIso()) : max;
  const startView = () => {
    const v = parse(inner) ?? parse(min) ?? (birth ? { y: new Date().getFullYear() - 30, m: 0, d: 1 } : parse(todayIso()))!;
    return { y: v.y, m: v.m };
  };
  const [view, setView] = useState(startView);
  const toggle = () => {
    if (!open) setView(startView());
    setOpen((o) => !o);
  };
  const pick = (iso: string) => {
    setInner(iso);
    onChange?.(iso);
    setOpen(false);
  };
  return (
    <>
      <Trigger id={id} variant={variant} label={label} value={inner || null} placeholder={placeholder} onClick={toggle} active={open} triggerRef={setAnchor} className={className} />
      <input type="hidden" name={name} value={inner} />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label={label ?? "Escolha a data"}>
        <Nav y={view.y} m={view.m} count={1} min={min} max={maxEff} yearSelect={birth} onChange={(y, m) => setView({ y, m })} />
        <Month y={view.y} m={view.m} min={min} max={maxEff} start={inner || null} end={null} onPick={pick} />
        {!birth && (
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => pick(min && todayIso() < min ? min : todayIso())} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface">
              {min && todayIso() < min ? "Primeira data disponível" : "Hoje"}
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}

// ───────────────────────── período (início → fim) ─────────────────────────

/**
 * Dois campos (ex.: Check-in e Check-out) e um calendário só. Clicar num campo abre o calendário já
 * na etapa certa; escolhido o início, o próximo clique define o fim (nunca antes do início).
 * Os dois gatilhos são irmãos (ficam cada um numa célula da grade da barra de busca).
 */
export function DateRange({
  names,
  labels,
  defaultValues,
  values,
  onChange,
  min,
  max,
  variant = "field",
  unit = "noite",
  cellClassName,
}: {
  names: [string, string];
  labels: [string, string];
  defaultValues?: [string | undefined, string | undefined];
  values?: [string, string];
  onChange?: (v: [string, string]) => void;
  min?: string;
  max?: string;
  variant?: DateVariant;
  /** "noite" (hospedagem) ou "dia" (seguro): o rodapé mostra a duração. */
  unit?: "noite" | "dia";
  /** Classe de cada gatilho (ex.: meia linha no celular). */
  cellClassName?: [string?, string?];
}) {
  const [start, setStart] = useState(values?.[0] ?? defaultValues?.[0] ?? "");
  const [end, setEnd] = useState(values?.[1] ?? defaultValues?.[1] ?? "");
  useEffect(() => {
    if (values) {
      setStart(values[0]);
      setEnd(values[1]);
    }
  }, [values]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"start" | "end">("start");
  const [hover, setHover] = useState<string | null>(null);
  const anchors = useRef<(HTMLElement | null)[]>([null, null]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const phone = useIsPhone();
  const viewOf = () => {
    const v = parse(start) ?? parse(min) ?? parse(todayIso())!;
    return { y: v.y, m: v.m };
  };
  const [view, setView] = useState(viewOf);
  const id = useId();

  const openAt = (s: "start" | "end") => {
    setStep(s === "end" && !start ? "start" : s);
    setAnchor(anchors.current[s === "start" ? 0 : 1]);
    setView(viewOf());
    setOpen(true);
  };
  const commit = (a: string, b: string) => {
    setStart(a);
    setEnd(b);
    onChange?.([a, b]);
  };
  const pick = (iso: string) => {
    if (step === "start" || !start || iso <= start) {
      // novo início: se o fim ficou antes, limpa
      commit(iso, end && end > iso ? end : "");
      setStep("end");
      return;
    }
    commit(start, iso);
    setOpen(false);
    setStep("start");
  };
  const n = start && end ? nightsBetween(start, end) : 0;
  const dur = unit === "noite" ? (n ? `${n} noite${n > 1 ? "s" : ""}` : "") : n ? `${n + 1} dia${n + 1 > 1 ? "s" : ""}` : "";
  const months = phone ? 1 : 2;

  return (
    <>
      <Trigger id={`${id}-a`} variant={variant} label={labels[0]} value={start || null} placeholder="Escolha" onClick={() => openAt("start")} active={open && step === "start"} triggerRef={(el) => (anchors.current[0] = el)} className={cellClassName?.[0]} />
      <Trigger id={`${id}-b`} variant={variant} label={labels[1]} value={end || null} placeholder="Escolha" onClick={() => openAt("end")} active={open && step === "end"} triggerRef={(el) => (anchors.current[1] = el)} className={cellClassName?.[1]} />
      <input type="hidden" name={names[0]} value={start} />
      <input type="hidden" name={names[1]} value={end} />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label={step === "start" ? labels[0] : labels[1]}>
        <div className="mb-3 flex gap-2 text-[13px]">
          {(["start", "end"] as const).map((s, i) => (
            <button key={s} type="button" onClick={() => setStep(s === "end" && !start ? "start" : s)} className={cn("flex-1 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition", step === s ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line hover:ring-ink/30")}>
              <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.1em]", step === s ? "text-white/60" : "text-muted")}>{labels[i]}</span>
              <span className="font-semibold">{(i === 0 ? start : end) ? formatDateBr(i === 0 ? start : end) : "Escolha"}</span>
            </button>
          ))}
        </div>
        <Nav y={view.y} m={view.m} count={months} min={min} max={max} onChange={(y, m) => setView({ y, m })} />
        <div className="flex gap-6">
          {Array.from({ length: months }, (_, i) => {
            const t = addMonths(view.y, view.m, i);
            return (
              <div key={i}>
                {i > 0 && <p className="sr-only">{MONTHS[t.m]} {t.y}</p>}
                <Month y={t.y} m={t.m} min={step === "end" && start ? start : min} max={max} start={start || null} end={end || null} hover={step === "end" ? hover : null} onPick={pick} onHover={setHover} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-[13px] text-muted">{dur ? <strong className="font-semibold text-ink">{dur}</strong> : step === "start" ? `Escolha ${labels[0].toLowerCase()}` : `Escolha ${labels[1].toLowerCase()}`}</p>
          <button type="button" onClick={() => setOpen(false)} disabled={!start || !end} className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-ink-2 disabled:opacity-40">
            Pronto
          </button>
        </div>
      </Popover>
    </>
  );
}
