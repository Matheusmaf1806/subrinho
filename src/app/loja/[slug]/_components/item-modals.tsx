"use client";

import { Percent, Users } from "lucide-react";
import { useState } from "react";
import { ActionForm, Modal, SubmitButton, type ActionState } from "@/components/ui-client";
import { Alert, buttonClass, Input } from "@/components/ui";
import type { PaxRule } from "@/server/suppliers/types";
import type { ItemVM } from "./cart-vm";
import { PaxStepper } from "./pax-stepper";

const KEY: Record<string, string> = { ADULT: "adults", CHILD: "children", SENIOR: "seniors", ROOM: "rooms", UNIT: "units" };
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Alterar quantidades (adulto/criança/quartos/unidades) — busca o preço certo na API do fornecedor. */
export function PaxModal({ item, action }: { item: ItemVM; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  if (!item.paxRules.length) return null;
  return (
    <Modal
      title="Alterar quantidades"
      triggerClassName={buttonClass("outline", "sm")}
      trigger={
        <>
          <Users className="h-4 w-4" /> Quantidades
        </>
      }
    >
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <p className="mb-3 text-sm text-muted">{item.title}</p>
          <input type="hidden" name="itemId" value={item.id} />
          {/* mantém campos não editáveis */}
          {(["adults", "children", "seniors", "rooms", "units"] as const)
            .filter((k) => !item.paxRules.some((r: PaxRule) => KEY[r.type] === k) && item.pax[k] !== undefined)
            .map((k) => (
              <input key={k} type="hidden" name={k} value={String(item.pax[k] ?? 0)} />
            ))}
          <div className="rounded-xl border border-line px-3 py-1">
            {item.paxRules.map((r: PaxRule) => (
              <PaxStepper key={r.type} name={KEY[r.type]} label={r.label} hint={r.hint} min={r.min} max={r.max} defaultValue={Number(item.pax[KEY[r.type] as keyof typeof item.pax] ?? 0)} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Ao salvar, consultamos o fornecedor para trazer o preço correto para a nova quantidade.</p>
          <SubmitButton variant="accent" className="mt-4 w-full" pendingText="Consultando o fornecedor…">
            Atualizar
          </SubmitButton>
        </ActionForm>
      )}
    </Modal>
  );
}

/** Modal de margem — SOMENTE para usuário da agência logado em modo ADMIN. Vale só para este carrinho. */
export function MarginModal({ item, action, maxPct }: { item: ItemVM; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; maxPct: string }) {
  const admin = item.admin!;
  const [val, setVal] = useState(Number(admin.marginPct));
  const valid = Number.isFinite(val) && val >= 0 && val <= Number(maxPct);
  const base = Number(admin.base);
  const pix = valid ? Math.round((base / (1 - val / 100)) * 100) / 100 : NaN;
  const installment = valid ? Math.round((pix / (1 - Number(admin.installmentFeePct) / 100)) * 100) / 100 : NaN;
  return (
    <Modal
      title="Alterar margem deste item"
      triggerClassName={buttonClass("dark", "sm")}
      trigger={
        <>
          <Percent className="h-4 w-4" /> Margem {Number(admin.marginPct).toLocaleString("pt-BR")}%
        </>
      }
    >
      {(close) => (
        <div className="space-y-4">
          <Alert tone="info">
            A alteração vale <strong>somente para este item neste carrinho</strong>. A margem padrão da agência para este produto é{" "}
            <strong>{Number(admin.defaultPct).toLocaleString("pt-BR")}%</strong>.
          </Alert>
          <ActionForm action={action} onSuccess={close} className="space-y-3">
            <input type="hidden" name="itemId" value={item.id} />
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">Nova margem da agência (%)</span>
              <Input name="marginPct" type="number" step="0.01" min={0} max={Number(maxPct)} defaultValue={admin.marginPct} onChange={(e) => setVal(Number(e.target.value))} required />
              <span className="mt-1 block text-xs text-muted">Mínimo 0% · máximo {Number(maxPct).toLocaleString("pt-BR")}%</span>
            </label>
            <div className="rounded-xl bg-cream px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Preço no Pix (antes de cupons)</span>
                <strong className="tabular">{valid ? fmt(pix) : "—"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Parcelado (10x sem juros)</span>
                <strong className="tabular">{valid ? fmt(installment) : "—"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Sua comissão</span>
                <strong className="tabular text-success">{valid ? fmt(pix - base) : "—"}</strong>
              </div>
            </div>
            <SubmitButton variant="accent" className="w-full" disabled={!valid}>
              Aplicar neste carrinho
            </SubmitButton>
          </ActionForm>
          {admin.source === "OVERRIDE" && (
            <ActionForm action={action} onSuccess={close}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="reset" value="1" />
              <SubmitButton variant="ghost" className="w-full">
                Voltar para a margem padrão ({Number(admin.defaultPct).toLocaleString("pt-BR")}%)
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </Modal>
  );
}
