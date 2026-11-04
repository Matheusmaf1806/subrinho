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

/** Etiqueta compacta (cards da vitrine, carrinho). */
export function CommissionTag({ c, label = "Comissão", className }: { c?: Commission | null; label?: string; className?: string }) {
  if (!c) return null;
  return (
    <span title="Só o ADMIN da agência vê a comissão" className={cn("inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(5,150,105,0.8)] tabular", className)}>
      <Coins className="h-3.5 w-3.5" aria-hidden /> {label} {brl(c.amount)} · {pctLabel(c.pct)}
    </span>
  );
}

/** Caixa em destaque (junto do preço nas páginas de detalhe). */
export function CommissionBox({ c, className }: { c?: Commission | null; className?: string }) {
  if (!c) return null;
  return (
    <div title="Só o ADMIN da agência vê a comissão" className={cn("inline-flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-2.5 text-left text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.9)]", className)}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/15">
        <Coins className="h-4 w-4" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">Sua comissão</span>
        <span className="block text-[17px] font-semibold tabular">
          {brl(c.amount)} <span className="text-[13px] font-medium text-white/80">· {pctLabel(c.pct)}</span>
        </span>
      </span>
    </div>
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
