/**
 * "Dados legais e rastreamento" da loja (Painel do Afiliado e Painel Subrinho): endereço e Cadastur no
 * rodapé e nas páginas legais, observações da política de cancelamento e os IDs do Pixel da Meta e do
 * Google Analytics 4 (carregados só com o consentimento de cookies do cliente).
 */
import { Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";

type Store = { address: string | null; cadastur: string | null; policyNotes: string | null; metaPixelId: string | null; ga4Id: string | null };
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function StoreLegalCard({ store, save, readOnly, hidden = {}, policiesHref }: { store: Store; save: Action; readOnly?: boolean; hidden?: Record<string, string>; policiesHref?: string }) {
  return (
    <Card className="mb-6">
      <CardHeader title="Dados legais e rastreamento" subtitle="Rodapé da loja, Termos, Privacidade, Cancelamento, Pixel da Meta e Google Analytics" />
      <CardBody>
        <ActionForm action={save}>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <fieldset disabled={readOnly} className="grid gap-5 md:grid-cols-2">
            <legend className="sr-only">Dados legais e rastreamento</legend>
            <Field label="Endereço da agência" hint="Aparece no rodapé e nas páginas legais">
              <Input name="address" defaultValue={store.address ?? ""} maxLength={300} placeholder="Rua, número, bairro, cidade, UF" />
            </Field>
            <Field label="Cadastur" hint="Registro no Ministério do Turismo (obrigatório para agências)">
              <Input name="cadastur" defaultValue={store.cadastur ?? ""} maxLength={40} placeholder="Ex.: 12.345678.10.0001-1" />
            </Field>
            <Field label="Observações da política de cancelamento" hint="Opcional. Entra no fim da página Cancelamento e reembolso" className="md:col-span-2">
              <Textarea name="policyNotes" defaultValue={store.policyNotes ?? ""} rows={3} maxLength={2000} placeholder="Ex.: Reembolsos no Pix em até 5 dias úteis após a confirmação do fornecedor." />
            </Field>
            <Field label="ID do Pixel da Meta" hint="Gerenciador de Eventos da Meta › Fontes de dados (só números)">
              <Input name="metaPixelId" defaultValue={store.metaPixelId ?? ""} inputMode="numeric" maxLength={20} placeholder="123456789012345" />
            </Field>
            <Field label="ID do Google Analytics 4" hint="Administrador › Fluxos de dados (começa com G-)">
              <Input name="ga4Id" defaultValue={store.ga4Id ?? ""} maxLength={20} placeholder="G-XXXXXXXXXX" />
            </Field>
            <p className="text-[12px] text-muted md:col-span-2">
              Com Pixel ou Analytics, a loja mostra o aviso de cookies e só carrega o rastreamento quando o cliente aceita (LGPD). Eventos enviados: visita, produto visto, item no
              carrinho, início do checkout e compra.{policiesHref ? " " : ""}
              {policiesHref && (
                <a href={policiesHref} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  Ver as páginas legais
                </a>
              )}
            </p>
            {!readOnly && (
              <div className="md:col-span-2">
                <SubmitButton>Salvar</SubmitButton>
              </div>
            )}
          </fieldset>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
