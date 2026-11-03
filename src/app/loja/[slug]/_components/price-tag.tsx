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
  invert,
}: {
  pix: Decimal | string;
  plan: InstallmentPlan;
  from?: boolean;
  size?: "sm" | "md" | "lg";
  note?: string;
  className?: string;
  invert?: boolean;
}) {
  const sub = invert ? "text-white/60" : "text-muted";
  return (
    <div className={cn("leading-tight", className)}>
      {from && <div className={cn("text-xs font-medium", sub)}>a partir de</div>}
      <div className={cn("flex items-baseline gap-1.5 font-semibold tracking-[-0.035em] tabular", size === "lg" ? "text-[2.5rem] leading-none" : size === "sm" ? "text-xl" : "text-[1.75rem]")}>
        {brl(pix)}
        <span className={cn("text-[13px] font-semibold tracking-normal", invert ? "text-white" : "text-accent-ink")}>no Pix</span>
      </div>
      <div className={cn("mt-1 text-[13px] tabular", sub)}>
        ou <span className={invert ? "text-white" : "text-ink"}>{plan.count}x de {brl(plan.installment)}</span> sem juros
      </div>
      {note && <div className={cn("mt-1 text-xs", sub)}>{note}</div>}
    </div>
  );
}
