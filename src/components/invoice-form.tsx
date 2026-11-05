/** Formulário para registrar uma nota fiscal (número, data, valor, PDF/XML ou link). */
import { DateInput } from "@/components/date-picker";
import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function InvoiceForm({ action, hidden, amount, today, submitLabel = "Registrar nota" }: { action: Action; hidden: Record<string, string>; amount: string; today: string; submitLabel?: string }) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Field label="Número da nota">
        <Input name="number" required maxLength={40} placeholder="Ex.: 1234" />
      </Field>
      <Field label="Série (opcional)">
        <Input name="series" maxLength={10} placeholder="Ex.: 1" />
      </Field>
      <Field label="Data de emissão">
        <DateInput name="issuedAt" defaultValue={today} />
      </Field>
      <Field label="Valor da nota (R$)">
        <Input name="amount" inputMode="decimal" required defaultValue={amount.replace(".", ",")} />
      </Field>
      <Field label="PDF da nota">
        <Input type="file" name="pdf" accept="application/pdf,.pdf" />
      </Field>
      <Field label="XML (opcional)">
        <Input type="file" name="xml" accept=".xml,application/xml,text/xml" />
      </Field>
      <Field label="Link de consulta (opcional)" hint="Se não anexar o PDF, informe o link da prefeitura" className="sm:col-span-2">
        <Input name="url" type="url" placeholder="https://" maxLength={500} />
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <Input name="notes" maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Enviando…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
