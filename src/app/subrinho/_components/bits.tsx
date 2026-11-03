/** Pequenos componentes de servidor reutilizados no Painel Subrinho. */
import type { ReactNode } from "react";
import { Badge, cn, statusTone } from "@/components/ui";
import { ORDER_STATUS_LABEL, PAYOUT_STATUS_LABEL } from "@/lib/format";

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{ORDER_STATUS_LABEL[status] ?? status}</Badge>;
}

export function PayoutStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted">—</span>;
  return <Badge tone={statusTone(status)}>{PAYOUT_STATUS_LABEL[status] ?? status}</Badge>;
}

export function ActiveBadge({ active, on = "Ativo", off = "Inativo" }: { active: boolean; on?: string; off?: string }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? on : off}</Badge>;
}

/** Bloco JSON recolhível. */
export function JsonDetails({ label, value, className }: { label: ReactNode; value: unknown; className?: string }) {
  const empty = value === null || value === undefined || (typeof value === "object" && Object.keys(value as object).length === 0);
  return (
    <details className={cn("group rounded-xl border border-line bg-cream/40", className)}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-muted hover:text-ink">{label}</summary>
      <pre className="max-h-80 overflow-auto border-t border-line px-3 py-2 text-[11px] leading-relaxed text-ink">
        {empty ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** Grid de "rótulo: valor" compacto (fichas). */
export function InfoList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2", className)}>
      {items.map((i, idx) => (
        <div key={idx} className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words font-semibold text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 first:mt-0">
      <h2 className="text-lg font-black tracking-tight text-ink">{children}</h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Aviso exibido quando o usuário não tem permissão para alterar a seção. */
export function ReadOnlyNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-xl border border-line bg-cream/60 px-3 py-2 text-xs font-semibold text-muted">
      {children ?? "Somente leitura — seu perfil não permite alterar esta seção."}
    </p>
  );
}

/** Valor de <Stat> que pode quebrar linha em colunas estreitas (evita estourar o card no celular). */
export function Fit({ children }: { children: ReactNode }) {
  return <span className="block min-w-0 [overflow-wrap:anywhere]">{children}</span>;
}
