import type { ReactNode } from "react";
import { Tag, X } from "lucide-react";
import { brl } from "@/lib/format";
import type { ActionState } from "@/components/ui-client";
import type { TotalsVM } from "./cart-vm";
import { CouponBox } from "./coupon-box";

/** Resumo em bloco preto (estilo cartaz). */
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
    <div className="rounded-[2rem] bg-ink p-6 text-white sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Resumo</p>
      <dl className="mt-5 space-y-2.5 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-white/60">Subtotal</dt>
          <dd className="font-semibold tabular">{brl(t.listPix)}</dd>
        </div>
        {t.coupons
          .filter((c) => Number(c.total) > 0)
          .map((c) => (
            <div key={c.layer} className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-1.5 text-emerald-300">
                <Tag className="h-3.5 w-3.5" /> {c.code}
                {removeCoupon && (
                  <form action={removeCoupon(c.layer)}>
                    <button className="grid h-6 w-6 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white" aria-label={`Remover cupom ${c.code}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </dt>
              <dd className="font-semibold text-emerald-300 tabular">− {brl(c.total)}</dd>
            </div>
          ))}
      </dl>
      {t.notices.map((n) => (
        <p key={n.layer + n.code} className="mt-3 rounded-2xl bg-amber-400/15 px-3.5 py-2.5 text-[13px] text-amber-200">
          Cupom {n.code}: {n.message}
        </p>
      ))}
      <div className="mt-6 border-t border-white/10 pt-6">
        <p className="text-[13px] text-white/60">Total no Pix</p>
        <p className="mt-1 text-[2.75rem] font-semibold leading-none tracking-[-0.05em] tabular">{brl(t.pix)}</p>
        <p className="mt-3 text-[14px] text-white/60 tabular">
          ou <span className="text-white">{t.plan.count}x de {brl(t.plan.installment)}</span> sem juros · {brl(t.installment)}
        </p>
        {t.commission && (
          <p className="mt-3 rounded-xl bg-emerald-400/15 px-3 py-2 text-[13px] font-semibold text-emerald-200 tabular" title="Só o ADMIN da agência vê">
            Comissão da agência neste carrinho: {brl(t.commission)}
          </p>
        )}
      </div>
      {couponAction && <CouponBox action={couponAction} />}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
