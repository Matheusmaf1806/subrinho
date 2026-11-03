"use client";

import { CreditCard, QrCode } from "lucide-react";
import { useState } from "react";
import { cn, Input, Select } from "@/components/ui";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lab = "mb-2 block text-[13px] font-medium text-muted";

export function PayerFields({ defaultSame = true, sameLabel }: { defaultSame?: boolean; sameLabel: string }) {
  const [same, setSame] = useState(defaultSame);
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-[15px] font-semibold text-ink">
        <input type="checkbox" name="payerSame" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-5 w-5 accent-[var(--store-accent)]" />
        {sameLabel}
      </label>
      {!same && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={lab}>Nome completo do pagador</span>
            <Input name="payerName" required autoComplete="name" />
          </label>
          <label className="block">
            <span className={lab}>CPF ou CNPJ</span>
            <Input name="payerDocument" required inputMode="numeric" placeholder="000.000.000-00" />
          </label>
          <label className="block">
            <span className={lab}>E-mail</span>
            <Input name="payerEmail" type="email" required />
          </label>
          <label className="block">
            <span className={lab}>Telefone</span>
            <Input name="payerPhone" inputMode="tel" />
          </label>
        </div>
      )}
      <details className="group rounded-2xl bg-surface px-4 py-3.5 [&_input]:bg-white">
        <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink">
          <span className="mr-2 inline-block transition group-open:rotate-90">›</span>Endereço de cobrança (opcional)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-6">
          <label className="block sm:col-span-2">
            <span className={lab}>CEP</span>
            <Input name="zip" inputMode="numeric" />
          </label>
          <label className="block sm:col-span-3">
            <span className={lab}>Rua</span>
            <Input name="street" />
          </label>
          <label className="block sm:col-span-1">
            <span className={lab}>Número</span>
            <Input name="number" />
          </label>
          <label className="block sm:col-span-2">
            <span className={lab}>Complemento</span>
            <Input name="complement" />
          </label>
          <label className="block sm:col-span-2">
            <span className={lab}>Bairro</span>
            <Input name="district" />
          </label>
          <label className="block sm:col-span-1">
            <span className={lab}>Cidade</span>
            <Input name="city" />
          </label>
          <label className="block sm:col-span-1">
            <span className={lab}>UF</span>
            <Input name="state" maxLength={2} />
          </label>
        </div>
      </details>
    </div>
  );
}

export function PaymentFields({ pix, installment, maxInstallments }: { pix: number; installment: number; maxInstallments: number }) {
  const [method, setMethod] = useState<"PIX" | "CARD">("PIX");
  const save = installment - pix;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { key: "PIX" as const, icon: QrCode, title: "Pix", price: fmt(pix), sub: save > 0 ? `Economize ${fmt(save)}` : "Aprovação imediata" },
          { key: "CARD" as const, icon: CreditCard, title: "Cartão de crédito", price: `${maxInstallments}x de ${fmt(Math.floor((installment / maxInstallments) * 100) / 100)}`, sub: `sem juros · total ${fmt(installment)}` },
        ].map((m) => (
          <label key={m.key} className={cn("flex cursor-pointer gap-3 rounded-[1.5rem] p-5 transition", method === m.key ? "bg-ink text-white" : "bg-surface text-ink hover:bg-surface-2")}>
            <input type="radio" name="paymentMethod" value={m.key} checked={method === m.key} onChange={() => setMethod(m.key)} className="mt-1 accent-[var(--store-accent)]" />
            <span>
              <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                <m.icon className="h-4 w-4 text-accent" /> {m.title}
              </span>
              <span className="mt-2 block text-[1.6rem] font-semibold leading-none tracking-[-0.04em] tabular">{m.price}</span>
              <span className={cn("mt-1.5 block text-xs", method === m.key ? "text-white/60" : "text-muted")}>{m.sub}</span>
            </span>
          </label>
        ))}
      </div>
      {method === "CARD" && (
        <div className="grid gap-3 rounded-[1.5rem] bg-surface p-4 sm:grid-cols-4 sm:p-5 [&_input]:bg-white [&_select]:bg-white">
          <label className="block sm:col-span-4">
            <span className={lab}>Nome impresso no cartão</span>
            <Input name="cardHolder" required autoComplete="cc-name" />
          </label>
          <label className="block sm:col-span-2">
            <span className={lab}>Número do cartão</span>
            <Input name="cardNumber" required inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" />
          </label>
          <label className="block">
            <span className={lab}>Validade</span>
            <Input name="cardExpiry" required placeholder="MM/AA" autoComplete="cc-exp" pattern="\d{2}/\d{2}" />
          </label>
          <label className="block">
            <span className={lab}>CVV</span>
            <Input name="cardCvv" required inputMode="numeric" autoComplete="cc-csc" maxLength={4} />
          </label>
          <label className="block sm:col-span-4">
            <span className={lab}>Parcelas</span>
            <Select name="installments" defaultValue={String(maxInstallments)}>
              {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x de {fmt(Math.floor((installment / n) * 100) / 100)} sem juros
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs text-muted sm:col-span-4">Ambiente de testes: qualquer cartão é aprovado, exceto final 0002 (recusado). Os dados do cartão não são armazenados.</p>
        </div>
      )}
    </div>
  );
}

export function TravelerFields({ count, firstName }: { count: number; firstName?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-[1.5rem] bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr] [&_input]:bg-white">
          <label className="block">
            <span className={lab}>{i === 0 ? "Viajante principal" : `Viajante ${i + 1}`}</span>
            <Input name="travelerName" required={i === 0} defaultValue={i === 0 ? firstName : undefined} placeholder="Nome completo" />
          </label>
          <label className="block">
            <span className={lab}>Documento</span>
            <Input name="travelerDocument" placeholder="CPF ou passaporte" />
          </label>
          <label className="block">
            <span className={lab}>Nascimento</span>
            <Input name="travelerBirthDate" type="date" />
          </label>
        </div>
      ))}
    </div>
  );
}
