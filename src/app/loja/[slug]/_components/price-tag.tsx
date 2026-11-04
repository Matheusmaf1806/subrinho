import { brl } from "@/lib/format";
import type { InstallmentPlan } from "@/server/pricing/engine";
import type { Decimal } from "@/server/pricing/money";
import { cn } from "@/components/ui";
import { CommissionBox, type Commission } from "./reveal";

/**
 * Preço Pix + parcelado. `align="right"`: tudo alinhado à direita a partir do tablet (coluna de
 * preço dos cartões); no celular fica à esquerda.
 */
export function PriceTag({
  pix,
  plan,
  from,
  size = "md",
  note,
  className,
  invert,
  commission,
  align = "left",
}: {
  pix: Decimal | string;
  plan: InstallmentPlan;
  from?: boolean;
  size?: "sm" | "md" | "lg";
  note?: string;
  className?: string;
  invert?: boolean;
  /** Só para o ADMIN da agência (vem nos dados apenas quando ele pode ver). */
  commission?: Commission | null;
  align?: "left" | "right";
}) {
  const sub = invert ? "text-white/60" : "text-muted";
  const right = align === "right";
  return (
    <div className={cn("flex flex-col leading-tight", right && "sm:items-end sm:text-right", className)}>
      {from && <div className={cn("text-xs font-medium", sub)}>a partir de</div>}
      <div className={cn("flex items-baseline gap-1.5 font-semibold tracking-[-0.035em] tabular", size === "lg" ? "text-[2.5rem] leading-none" : size === "sm" ? "text-[1.375rem]" : "text-[1.75rem]")}>
        {brl(pix)}
        <span className={cn("text-[13px] font-semibold tracking-normal", invert ? "text-white" : "text-accent-ink")}>no Pix</span>
      </div>
      <div className={cn("mt-1 text-[13px] tabular", sub)}>
        ou <span className={invert ? "text-white" : "text-ink"}>{plan.count}x de {brl(plan.installment)}</span> sem juros
      </div>
      {note && <div className={cn("mt-1 text-xs", sub)}>{note}</div>}
      {commission && <CommissionBox c={commission} className="mt-3" />}
    </div>
  );
}
