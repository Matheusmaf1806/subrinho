/** Kit de UI (componentes de servidor — sem hooks). Componentes interativos em ui-client.tsx. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-600 shadow-sm shadow-brand/20",
  accent: "bg-accent text-white hover:brightness-95 shadow-sm",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-line bg-white text-ink hover:border-brand-200 hover:bg-brand-50/50",
  ghost: "text-ink hover:bg-brand-50",
  danger: "bg-white border border-red-200 text-red-700 hover:bg-red-50",
  dark: "bg-plum text-white hover:bg-plum-700",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-2xl gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center font-bold whitespace-nowrap transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
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

export function Card({ className, children, ...p }: ComponentProps<"div">) {
  return (
    <div {...p} className={cn("rounded-2xl border border-line bg-white shadow-[0_1px_0_rgba(54,2,33,0.03)]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div>
        <h3 className="text-base font-extrabold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cn("px-5 py-4", className)} />;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "dark";
const TONE: Record<Tone, string> = {
  neutral: "bg-cream text-muted ring-line",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-800 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  dark: "bg-plum text-white ring-plum",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset", TONE[tone], className)}>{children}</span>;
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "PAID":
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
    case "CONVERTED":
      return "success";
    default:
      return "neutral";
  }
}

export function Stat({ label, value, hint, tone = "default", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "brand" | "dark"; icon?: ReactNode }) {
  const styles =
    tone === "brand" ? "bg-brand text-white border-brand" : tone === "dark" ? "bg-plum text-white border-plum" : "bg-white text-ink border-line";
  const sub = tone === "default" ? "text-muted" : "text-white/75";
  return (
    <div className={cn("rounded-2xl border p-5", styles)}>
      <div className={cn("flex items-center justify-between text-sm font-semibold", sub)}>
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 min-w-0 text-2xl font-black tracking-tight tabular [overflow-wrap:anywhere]">{value}</div>
      {hint && <div className={cn("mt-1 text-xs", sub)}>{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-brand-200">{icon}</div>}
      <p className="text-base font-extrabold text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
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
  return <thead className="border-b border-line bg-cream/60 text-xs font-bold uppercase tracking-wide text-muted">{children}</thead>;
}
export function Th({ children, className, ...p }: ComponentProps<"th">) {
  return (
    <th {...p} className={cn("px-4 py-3 whitespace-nowrap", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...p }: ComponentProps<"td">) {
  return (
    <td {...p} className={cn("px-4 py-3 align-top", className)}>
      {children}
    </td>
  );
}
export function Tr({ children, className, ...p }: ComponentProps<"tr">) {
  return (
    <tr {...p} className={cn("border-b border-line/70 last:border-0 hover:bg-cream/40", className)}>
      {children}
    </tr>
  );
}

// ───────── Formulários ─────────

export const inputClass =
  "block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-cream";

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-bold text-ink", className)}>
      {children}
    </label>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>
        {children}
      </label>
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cn(inputClass, className)} />;
}

export function Select({ className, children, ...p }: ComponentProps<"select">) {
  return (
    <select {...p} className={cn(inputClass, "pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cn(inputClass, "min-h-24", className)} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const t = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", t, className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-extrabold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

/** Linha "rótulo: valor" para fichas de detalhe. */
export function DetailRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("text-right tabular", strong ? "font-extrabold text-ink" : "font-semibold text-ink")}>{children}</dd>
    </div>
  );
}

/** Abas por link (estado na URL). */
export function LinkTabs({ tabs, active }: { tabs: { href: string; label: ReactNode; key: string }[]; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "rounded-lg px-3.5 py-2 text-sm font-bold whitespace-nowrap transition",
            t.key === active ? "bg-brand text-white" : "text-muted hover:bg-brand-50 hover:text-brand-700",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
