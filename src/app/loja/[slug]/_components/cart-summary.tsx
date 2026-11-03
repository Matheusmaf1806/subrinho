import type { ReactNode } from "react";
import { Tag, X } from "lucide-react";
import { Alert, Card } from "@/components/ui";
import { brl } from "@/lib/format";
import type { ActionState } from "@/components/ui-client";
import type { TotalsVM } from "./cart-vm";
import { CouponBox } from "./coupon-box";

export function CartSummary({
  t,
  couponAction,
  removeCoupon,
  children,
}: {
  t: TotalsVM;
  couponAction?: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  removeCoupon?: (layer: "SUBRINHO" | "AFFILIATE") => () => Promise<void>;
  children?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-black text-ink">Resumo</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-bold tabular">{brl(t.listPix)}</dd>
        </div>
        {t.coupons
          .filter((c) => Number(c.total) > 0)
          .map((c) => (
            <div key={c.layer} className="flex items-center justify-between text-success">
              <dt className="inline-flex items-center gap-1 font-bold">
                <Tag className="h-3.5 w-3.5" /> Cupom {c.code}
                {removeCoupon && (
                  <form action={removeCoupon(c.layer)}>
                    <button className="ml-1 rounded p-0.5 text-muted hover:bg-cream hover:text-red-700" aria-label={`Remover cupom ${c.code}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </dt>
              <dd className="font-bold tabular">− {brl(c.total)}</dd>
            </div>
          ))}
      </dl>
      {t.notices.map((n) => (
        <Alert key={n.layer + n.code} tone="warning" className="mt-2">
          Cupom {n.code}: {n.message}
        </Alert>
      ))}
      <div className="mt-4 rounded-2xl bg-cream p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Total no Pix</p>
        <p className="text-3xl font-black text-ink tabular">{brl(t.pix)}</p>
        <p className="mt-1 text-sm text-muted tabular">
          ou <strong className="text-ink">{t.plan.count}x de {brl(t.plan.installment)}</strong> sem juros
          <br />
          total no cartão {brl(t.installment)}
        </p>
      </div>
      {couponAction && <CouponBox action={couponAction} />}
      {children && <div className="mt-4">{children}</div>}
    </Card>
  );
}
