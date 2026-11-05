/**
 * Kit de UI (componentes de servidor — sem hooks). Componentes interativos em ui-client.tsx.
 *
 * Linguagem visual: superfícies chapadas (branco / cinza neutro / preto / vermelho da marca),
 * cantos bem arredondados, botões em pílula, tipografia grotesca apertada, sem bordas pesadas.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CountUp } from "./count-up";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger" | "dark" | "light";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-600",
  accent: "bg-accent text-accent-fg hover:brightness-110",
  secondary: "bg-surface text-ink hover:bg-surface-2",
  outline: "bg-white text-ink ring-1 ring-inset ring-line hover:ring-ink/30",
  ghost: "text-ink hover:bg-surface",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  dark: "bg-ink text-white hover:bg-ink-2",
  light: "bg-white text-ink hover:bg-white/90",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-14 px-7 text-[15px] gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap transition-[background-color,color,box-shadow,filter,transform] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...p} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...p} className={buttonClass(variant, size, className)} />;
}

/** Seta dentro de um círculo — o “chip” de ação da marca. */
export function ArrowChip({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" | "brand" }) {
  const t = tone === "light" ? "bg-white text-ink" : tone === "brand" ? "bg-brand text-brand-fg" : "bg-ink text-white";
  return (
    <span className={cn("inline-grid h-9 w-9 shrink-0 place-items-center rounded-full", t, className)} aria-hidden>
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
        <path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Card({ className, children, ...p }: ComponentProps<"div">) {
  return (
    <div {...p} className={cn("ui-card rounded-3xl bg-white ring-1 ring-inset ring-black/[0.06]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4", className)}>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cn("px-6 pb-6", className)} />;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-muted ring-1 ring-inset ring-black/[0.06] hover:text-ink">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="text-[2.1rem] font-semibold leading-[1.02] tracking-[-0.04em] text-ink sm:text-5xl">{title}</h1>
        {subtitle && <p className="ui-page-subtitle mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "dark";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface text-ink/70",
  brand: "bg-brand-50 text-brand-ink",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
  dark: "bg-ink text-white",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "PAID":
    case "CONVERTED":
      return "success";
    case "PENDING_PAYMENT":
    case "SCHEDULED":
    case "OPEN":
      return "warning";
    case "CANCELLED":
    case "REFUNDED":
    case "EXPIRED":
    case "UNAVAILABLE":
      return "danger";
    default:
      return "neutral";
  }
}

export function Stat({ label, value, hint, tone = "default", icon, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "brand" | "dark"; icon?: ReactNode; className?: string }) {
  const styles = cn(
    "ui-stat",
    tone === "brand" ? "ui-stat-brand bg-brand text-brand-fg" : tone === "dark" ? "ui-stat-dark bg-ink text-white" : "ui-stat-default bg-white text-ink ring-1 ring-inset ring-black/[0.06]",
  );
  const sub = tone === "default" ? "text-muted" : tone === "brand" ? "text-brand-fg/70" : "text-white/70";
  return (
    <div className={cn("flex min-h-[9.5rem] flex-col justify-between rounded-3xl p-6", styles, className)}>
      <div className={cn("flex items-center justify-between gap-2 text-[13px] font-medium", sub)}>
        <span>{label}</span>
        {icon && <span className="opacity-80 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      </div>
      <div>
        <div className="mt-4 min-w-0 text-[1.75rem] font-semibold leading-none tracking-[-0.04em] tabular [overflow-wrap:anywhere] sm:text-[2rem]">
          {typeof value === "string" || typeof value === "number" ? <CountUp text={String(value)} /> : value}
        </div>
        {hint && <div className={cn("mt-2 text-xs", sub)}>{hint}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-2 grid h-16 w-16 place-items-center rounded-full bg-surface text-ink/40 [&>svg]:h-7 [&>svg]:w-7">{icon}</div>}
      <p className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ───────── Tabelas ─────────

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <table className="w-full min-w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted [&_th]:border-b [&_th]:border-line">{children}</thead>;
}
export function Th({ children, className, ...p }: ComponentProps<"th">) {
  return (
    <th {...p} className={cn("px-6 py-3 font-semibold whitespace-nowrap", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...p }: ComponentProps<"td">) {
  return (
    <td {...p} className={cn("px-6 py-4 align-top", className)}>
      {children}
    </td>
  );
}
export function Tr({ children, className, ...p }: ComponentProps<"tr">) {
  return (
    <tr {...p} className={cn("border-b border-line/70 transition-colors last:border-0 hover:bg-surface/60", className)}>
      {children}
    </tr>
  );
}

// ───────── Formulários ─────────

export const inputClass =
  "ui-input block w-full h-12 rounded-2xl border-0 bg-surface px-4 text-[15px] text-ink placeholder:text-muted/70 outline-none ring-1 ring-inset ring-transparent transition focus:bg-white focus:ring-2 focus:ring-ink disabled:opacity-60";

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-2 block text-[13px] font-medium text-muted", className)}>
      {children}
    </label>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-2 block text-[13px] font-medium text-muted">{label}</span>
        {children}
      </label>
      {hint && !error && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cn(inputClass, className)} />;
}

const CHEVRON =
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22M4 6l4 4 4-4%22 stroke=%22%230a0a0b%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:16px] bg-[right_14px_center] bg-no-repeat";

export function Select({ className, children, ...p }: ComponentProps<"select">) {
  return (
    <select {...p} className={cn(inputClass, "appearance-none pr-10", CHEVRON, className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cn(inputClass, "h-auto min-h-28 py-3", className)} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const t = {
    info: "bg-white text-ink ring-1 ring-inset ring-black/[0.06]",
    warning: "bg-amber-50 text-amber-950",
    danger: "bg-red-50 text-red-900",
    success: "bg-emerald-50 text-emerald-950",
  }[tone];
  const dot = { info: "bg-ink", warning: "bg-amber-500", danger: "bg-red-600", success: "bg-emerald-600" }[tone];
  return (
    <div className={cn("ui-alert flex gap-3 rounded-2xl px-4 py-3.5 text-sm", `ui-alert-${tone}`, t, className)} role={tone === "danger" ? "alert" : "status"}>
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}

/** Linha "rótulo: valor" para fichas de detalhe. */
export function DetailRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("text-right tabular", strong ? "font-semibold text-ink" : "font-medium text-ink")}>{children}</dd>
    </div>
  );
}

/** Abas por link (estado na URL) — controle segmentado em pílula. */
export function LinkTabs({ tabs, active }: { tabs: { href: string; label: ReactNode; key: string }[]; active: string }) {
  return (
    <div className="no-scrollbar mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition", t.key === active ? "bg-ink text-white" : "text-muted hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Rótulo de seção pequeno em caixa alta (estilo sinalização). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-muted", className)}>{children}</p>;
}
