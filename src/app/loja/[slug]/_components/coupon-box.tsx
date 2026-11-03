"use client";

import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { Input } from "@/components/ui";

export function CouponBox({ action }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  return (
    <ActionForm action={action} resetOnSuccess className="mt-4">
      <label className="mb-1.5 block text-sm font-bold text-ink" htmlFor="coupon">
        Cupom de desconto
      </label>
      <div className="flex gap-2">
        <Input id="coupon" name="code" placeholder="Digite o cupom" className="uppercase" autoComplete="off" />
        <SubmitButton variant="outline" pendingText="…">
          Aplicar
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
