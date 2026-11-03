"use client";

import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";

export function CouponBox({ action }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  return (
    <ActionForm action={action} resetOnSuccess className="mt-6 [&_[role=alert]]:bg-red-500/15 [&_[role=alert]]:text-red-100 [&_[role=status]]:bg-emerald-500/15 [&_[role=status]]:text-emerald-100 [&_[role=status]]:ring-0">
      <label className="mb-2 block text-[13px] text-white/60" htmlFor="coupon">
        Cupom de desconto
      </label>
      <div className="flex gap-2 rounded-full bg-white/10 p-1">
        <input id="coupon" name="code" placeholder="DIGITE O CUPOM" autoComplete="off" className="h-10 min-w-0 flex-1 bg-transparent px-4 text-sm font-semibold uppercase tracking-wide text-white outline-none placeholder:text-white/35" />
        <SubmitButton variant="light" size="sm" pendingText="…" className="h-10 px-5">
          Aplicar
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
