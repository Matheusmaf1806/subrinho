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
        <input type="checkbox" name="payerSame" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-5 w-5 accent-brand" />
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

export function PaymentFields({
  pix,
  installment,
  maxInstallments,
  cardCheckout = "inline",
  pixAvailable = true,
  simulated = true,
}: {
  pix: number;
  installment: number;
  maxInstallments: number;
  /** "paypal": o cartão é pago nos botões do PayPal, na página do pedido. */
  cardCheckout?: "inline" | "paypal";
  pixAvailable?: boolean;
  simulated?: boolean;
}) {
  const [method, setMethod] = useState<"PIX" | "CARD">(pixAvailable ? "PIX" : "CARD");
  const save = installment - pix;
  const paypal = cardCheckout === "paypal";
  const options = [
    ...(pixAvailable ? [{ key: "PIX" as const, icon: QrCode, title: "Pix", price: fmt(pix), sub: save > 0 ? `Economize ${fmt(save)}` : "Aprovação imediata" }] : []),
    {
      key: "CARD" as const,
      icon: CreditCard,
      title: paypal ? "Cartão de crédito ou PayPal" : "Cartão de crédito",
      price: `${maxInstallments}x de ${fmt(Math.floor((installment / maxInstallments) * 100) / 100)}`,
      sub: `sem juros · total ${fmt(installment)}`,
    },
  ];
  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", options.length > 1 && "sm:grid-cols-2")}>
        {options.map((m) => (
          <label key={m.key} className={cn("flex cursor-pointer gap-3 rounded-[1.5rem] p-5 transition", method === m.key ? "bg-ink text-white" : "bg-surface text-ink hover:bg-surface-2")}>
            <input type="radio" name="paymentMethod" value={m.key} checked={method === m.key} onChange={() => setMethod(m.key)} className="mt-1 accent-brand" />
            <span>
              <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                <m.icon className={cn("h-4 w-4", method === m.key ? "text-accent" : "text-accent-ink")} /> {m.title}
              </span>
              <span className="mt-2 block text-[1.6rem] font-semibold leading-none tracking-[-0.04em] tabular">{m.price}</span>
              <span className={cn("mt-1.5 block text-xs", method === m.key ? "text-white/60" : "text-muted")}>{m.sub}</span>
            </span>
          </label>
        ))}
      </div>
      {method === "CARD" && paypal && (
        <p className="rounded-[1.5rem] bg-surface p-4 text-[14px] text-ink sm:p-5">
          Na próxima tela você paga com <strong>cartão de crédito</strong> ou com a sua <strong>conta PayPal</strong>, em ambiente seguro do PayPal, e escolhe as parcelas (até {maxInstallments}x).
        </p>
      )}
      {method === "CARD" && !paypal && (
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
          {simulated && <p className="text-xs text-muted sm:col-span-4">Ambiente de testes: qualquer cartão é aprovado, exceto final 0002 (recusado). Pagamento simulado: nenhuma reserva é feita.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Viajantes. Hotéis exigem o nome (e sobrenome) de TODOS os hóspedes — adultos primeiro, depois
 * crianças com a idade informada na busca. Cada linha envia todos os campos (os arrays ficam alinhados).
 */
export function TravelerFields({
  count,
  firstName,
  adults,
  childAges = [],
  hotel = false,
}: {
  count?: number;
  firstName?: string;
  adults?: number;
  childAges?: number[];
  hotel?: boolean;
}) {
  const nAdults = Math.max(1, adults ?? count ?? 1);
  const rows = [
    ...Array.from({ length: nAdults }, (_, i) => ({ type: "ADULT" as const, i, age: null as number | null })),
    ...childAges.map((age, i) => ({ type: "CHILD" as const, i, age })),
  ];
  return (
    <div className="space-y-3">
      {hotel && <p className="text-[13px] text-muted">Os hotéis exigem nome e sobrenome de todos os hóspedes, como no documento.</p>}
      {rows.map((r, k) => {
        const lead = r.type === "ADULT" && r.i === 0;
        const label = r.type === "CHILD" ? `Criança ${r.i + 1} · ${r.age === 0 ? "menos de 1 ano" : `${r.age} ano${(r.age ?? 0) > 1 ? "s" : ""}`}` : lead ? "Viajante principal" : `Adulto ${r.i + 1}`;
        return (
          <div key={k} className={cn("grid gap-3 rounded-[1.5rem] bg-surface p-4 [&_input]:bg-white [&_select]:bg-white", hotel && r.type === "ADULT" ? "sm:grid-cols-[0.7fr_2fr_1fr_1fr]" : "sm:grid-cols-[2fr_1fr_1fr]")}>
            <input type="hidden" name="travelerType" value={r.type} />
            <input type="hidden" name="travelerAge" value={r.age ?? ""} />
            {hotel && r.type === "ADULT" ? (
              <label className="block">
                <span className={lab}>Tratamento</span>
                <Select name="travelerTitle" defaultValue="MR">
                  <option value="MR">Sr.</option>
                  <option value="MRS">Sra.</option>
                </Select>
              </label>
            ) : (
              <input type="hidden" name="travelerTitle" value="" />
            )}
            <label className="block">
              <span className={lab}>{label}</span>
              <Input
                name="travelerName"
                required={lead || hotel}
                defaultValue={lead ? firstName : undefined}
                placeholder="Nome e sobrenome"
                autoComplete={lead ? "name" : "off"}
                pattern={hotel ? "\\s*\\S+(\\s+\\S+)+\\s*" : undefined}
                title={hotel ? "Informe nome e sobrenome" : undefined}
              />
            </label>
            <label className="block">
              <span className={lab}>Documento{hotel && <span className="font-normal normal-case tracking-normal"> · opcional</span>}</span>
              <Input name="travelerDocument" placeholder="CPF ou passaporte" />
            </label>
            <label className="block">
              <span className={lab}>Nascimento{hotel && <span className="font-normal normal-case tracking-normal"> · opcional</span>}</span>
              <Input name="travelerBirthDate" type="date" />
            </label>
          </div>
        );
      })}
    </div>
  );
}
