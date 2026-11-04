"use client";

import { Percent, Users } from "lucide-react";
import { useState } from "react";
import { ActionForm, Modal, SubmitButton, type ActionState } from "@/components/ui-client";
import { Alert, buttonClass, Input } from "@/components/ui";
import type { PaxRule } from "@/server/suppliers/types";
import type { ItemVM } from "./cart-vm";
import { PaxStepper } from "./pax-stepper";
import { ChildAgesPicker } from "./guests-field";

const KEY: Record<string, string> = { ADULT: "adults", CHILD: "children", SENIOR: "seniors", ROOM: "rooms", UNIT: "units" };
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Alterar quantidades (adulto/criança/quartos/unidades) — busca o preço certo na API do fornecedor. */
export function PaxModal({ item, action }: { item: ItemVM; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  if (!item.paxRules.length) return null;
  return (
    <Modal
      title="Alterar quantidades"
      triggerClassName={buttonClass("light", "sm")}
      trigger={
        <>
          <Users className="h-4 w-4" /> Quantidades
        </>
      }
    >
      {(close) => <PaxForm item={item} action={action} onDone={close} />}
    </Modal>
  );
}

function PaxForm({ item, action, onDone }: { item: ItemVM; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; onDone: () => void }) {
  const childRule = item.paxRules.find((r: PaxRule) => r.type === "CHILD" && r.ages);
  const [ages, setAges] = useState<(number | null)[]>(() => {
    const n = Number(item.pax.children ?? 0);
    const cur = item.pax.childrenAges ?? [];
    return Array.from({ length: n }, (_, i) => (cur[i] ?? null) as number | null);
  });
  const missing = !!childRule && ages.some((a) => a === null);
  return (
    <ActionForm action={action} onSuccess={onDone}>
      <p className="mb-3 text-sm text-muted">{item.title}</p>
      <input type="hidden" name="itemId" value={item.id} />
      {/* mantém campos não editáveis */}
      {(["adults", "children", "seniors", "rooms", "units"] as const)
        .filter((k) => !item.paxRules.some((r: PaxRule) => KEY[r.type] === k) && item.pax[k] !== undefined)
        .map((k) => (
          <input key={k} type="hidden" name={k} value={String(item.pax[k] ?? 0)} />
        ))}
      {childRule && <input type="hidden" name="childrenAges" value={ages.map((a) => a ?? "").join(",")} />}
      <div className="rounded-2xl bg-surface px-4 py-1 [&_button]:bg-white">
        {item.paxRules.map((r: PaxRule) => (
          <PaxStepper
            key={r.type}
            name={KEY[r.type]}
            label={r.label}
            hint={r.hint}
            min={r.min}
            max={r.max}
            defaultValue={Number(item.pax[KEY[r.type] as keyof typeof item.pax] ?? 0)}
            onChange={r === childRule ? (n) => setAges((cur) => (n > cur.length ? [...cur, ...Array(n - cur.length).fill(null)] : cur.slice(0, n))) : undefined}
          />
        ))}
      </div>
      {childRule && <ChildAgesPicker ages={ages} onChange={setAges} />}
      {missing && <p className="mt-2 text-[13px] font-medium text-muted">Informe a idade de cada criança para consultar o preço.</p>}
      <p className="mt-3 text-xs text-muted">Ao salvar, consultamos o fornecedor para trazer o preço correto para a nova quantidade.</p>
      <SubmitButton variant="accent" className="mt-4 w-full" pendingText="Consultando o fornecedor…" disabled={missing}>
        Atualizar
      </SubmitButton>
    </ActionForm>
  );
}

/** Modal de margem — SOMENTE para usuário da agência logado em modo ADMIN. Vale só para este carrinho. */
export function MarginModal({ item, action, maxPct }: { item: ItemVM; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; maxPct: string }) {
  const admin = item.admin!;
  const [val, setVal] = useState(Number(admin.marginPct));
  const valid = Number.isFinite(val) && val >= 0 && val <= Number(maxPct);
  const base = Number(admin.base);
  const minPix = admin.minPix ? Number(admin.minPix) : null;
  const raw = valid ? Math.round((base / (1 - val / 100)) * 100) / 100 : NaN;
  // preço mínimo de venda do fornecedor: o preço não fica abaixo dele (a Subrinho completa a diferença)
  const floored = minPix !== null && raw < minPix;
  const pix = floored ? minPix! : raw;
  const commission = valid ? (floored ? Math.round(pix * val) / 100 : pix - base) : NaN;
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
              <span className="mb-2 block text-[13px] font-medium text-muted">Nova margem da agência (%)</span>
              <Input name="marginPct" type="number" step="0.01" min={0} max={Number(maxPct)} defaultValue={admin.marginPct} onChange={(e) => setVal(Number(e.target.value))} required />
              <span className="mt-1 block text-xs text-muted">Mínimo 0% · máximo {Number(maxPct).toLocaleString("pt-BR")}%</span>
            </label>
            <div className="space-y-1.5 rounded-2xl bg-ink px-5 py-4 text-sm text-white [&_.text-muted]:text-white/60">
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
                <strong className="tabular text-emerald-300">{valid ? fmt(commission) : "—"}</strong>
              </div>
            </div>
            {minPix !== null && (
              <p className="text-xs text-muted">
                Este hotel tem preço mínimo de venda de <strong className="text-ink">{fmt(minPix)}</strong> (regra do fornecedor) — o preço não fica abaixo disso.
              </p>
            )}
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
