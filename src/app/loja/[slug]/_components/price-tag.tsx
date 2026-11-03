import { brl } from "@/lib/format";
import type { InstallmentPlan } from "@/server/pricing/engine";
import type { Decimal } from "@/server/pricing/money";
import { cn } from "@/components/ui";

export function PriceTag({
  pix,
  plan,
  from,
  size = "md",
  note,
  className,
}: {
  pix: Decimal | string;
  plan: InstallmentPlan;
  from?: boolean;
  size?: "sm" | "md" | "lg";
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("leading-tight", className)}>
      {from && <div className="text-xs font-semibold text-muted">a partir de</div>}
      <div className={cn("font-black tracking-tight text-ink tabular", size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl")}>
        {brl(pix)} <span className="text-sm font-bold text-accent">no Pix</span>
      </div>
      <div className="text-sm text-muted tabular">
        ou <strong className="text-ink">{plan.count}x de {brl(plan.installment)}</strong> sem juros ({brl(plan.total)})
      </div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}
