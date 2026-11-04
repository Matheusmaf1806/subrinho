/**
 * Etiquetas que só aparecem para quem pode ver (ver _lib/insight.ts): fornecedor da oferta
 * (equipe Subrinho) e comissão da agência (ADMIN dela). Sem os dados, não renderiza nada.
 */
import { Building2, Coins } from "lucide-react";
import { brl } from "@/lib/format";
import type { Decimal } from "@/server/pricing/money";
import { cn } from "@/components/ui";

export type Commission = { amount: Decimal | string | number; pct: Decimal | string | number };

export const pctLabel = (pct: Commission["pct"]) => `${Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function SupplierTag({ name, className }: { name?: string | null; className?: string }) {
  if (!name) return null;
  return (
    <span title="Só a equipe Subrinho vê o fornecedor" className={cn("inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-900 ring-1 ring-inset ring-violet-200", className)}>
      <Building2 className="h-3 w-3" aria-hidden /> {name}
    </span>
  );
}

export function CommissionTag({ c, label = "Comissão", className }: { c?: Commission | null; label?: string; className?: string }) {
  if (!c) return null;
  return (
    <span title="Só o ADMIN da agência vê a comissão" className={cn("inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200 tabular", className)}>
      <Coins className="h-3 w-3" aria-hidden /> {label} {brl(c.amount)} · {pctLabel(c.pct)}
    </span>
  );
}

/** As duas juntas (quando houver). */
export function RevealTags({ supplier, commission, className }: { supplier?: string | null; commission?: Commission | null; className?: string }) {
  if (!supplier && !commission) return null;
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      <SupplierTag name={supplier} />
      <CommissionTag c={commission} />
    </span>
  );
}
