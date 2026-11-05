/**
 * "Endereço da loja" (Painel do Afiliado e Painel Subrinho): subdomínio da plataforma, domínio próprio,
 * instruções de DNS e verificação. O endereço oficial é o domínio próprio verificado; senão o subdomínio.
 */
import { BadgeCheck, Clock, ExternalLink, Globe } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Input } from "@/components/ui";
import { ActionForm, CopyButton, SubmitButton, type ActionState } from "@/components/ui-client";
import { domainConfig, isApexDomain, subdomainHost } from "@/lib/store-domains";
import { storePublicUrl } from "@/server/store-links";

type Store = { id: string; slug: string; subdomain: string | null; customDomain: string | null; customDomainVerifiedAt: Date | null };
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Domínio raiz mostrado no campo, mesmo antes de os subdomínios estarem ligados. */
const DISPLAY_ROOT = "subrinho.com.br";

export function StoreDomainCard({ store, save, verify, readOnly, hidden = {} }: { store: Store; save: Action; verify: Action; readOnly?: boolean; hidden?: Record<string, string> }) {
  const cfg = domainConfig();
  const root = cfg.root ?? DISPLAY_ROOT;
  const official = storePublicUrl(store);
  const sub = subdomainHost(store, cfg);
  const apex = store.customDomain ? isApexDomain(store.customDomain) : false;
  const hiddenInputs = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <Card className="mb-6">
      <CardHeader title="Endereço da loja" subtitle="Subdomínio da plataforma ou domínio próprio da agência, sem /loja/ na URL" />
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3">
          <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-muted">Endereço oficial agora</p>
            <a href={official} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-semibold text-ink hover:underline">
              {official.replace(/^https?:\/\//, "")} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </a>
          </div>
          <CopyButton text={official} label="Copiar" copiedLabel="Copiado!" />
        </div>
        {!cfg.root && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
            Os subdomínios .{root} entram no ar quando a equipe Subrinho ligar o domínio da plataforma. Até lá, a loja abre pelo endereço acima.
          </p>
        )}

        <ActionForm action={save} className="grid gap-5 md:grid-cols-2">
          {hiddenInputs}
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium text-muted">Subdomínio na plataforma</span>
            <span className="flex items-stretch overflow-hidden rounded-xl ring-1 ring-inset ring-line focus-within:ring-2 focus-within:ring-ink">
              <Input name="subdomain" defaultValue={store.subdomain ?? store.slug} disabled={readOnly} required className="rounded-none border-0 ring-0 focus:ring-0" autoComplete="off" spellCheck={false} />
              <span className="flex items-center whitespace-nowrap bg-surface px-3 text-[14px] text-muted">.{root}</span>
            </span>
            <span className="mt-1 block text-[12px] text-muted">Letras, números e hífen. Ex.: viagensdaana</span>
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium text-muted">Domínio próprio (opcional)</span>
            <Input name="customDomain" defaultValue={store.customDomain ?? ""} disabled={readOnly} placeholder="viagensdaana.com.br ou loja.viagensdaana.com.br" autoComplete="off" spellCheck={false} />
            <span className="mt-1 block text-[12px] text-muted">Domínio da agência ou um subdomínio dele.</span>
          </label>
          {!readOnly && (
            <div className="md:col-span-2">
              <SubmitButton>Salvar endereço</SubmitButton>
            </div>
          )}
        </ActionForm>

        {store.customDomain && (
          <div className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{store.customDomain}</p>
              {store.customDomainVerifiedAt ? (
                <Badge tone="success">
                  <BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden /> Ativo
                </Badge>
              ) : (
                <Badge tone="warning">
                  <Clock className="mr-1 h-3.5 w-3.5" aria-hidden /> Aguardando DNS
                </Badge>
              )}
            </div>
            {!store.customDomainVerifiedAt && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] text-ink">
                <li>
                  No DNS do domínio (Registro.br, GoDaddy, Cloudflare…), crie:{" "}
                  {apex ? (
                    <>
                      um registro <code className="rounded bg-surface px-1">A</code> em <code className="rounded bg-surface px-1">@</code> apontando para{" "}
                      <code className="rounded bg-surface px-1">76.76.21.21</code> e um <code className="rounded bg-surface px-1">CNAME</code> em{" "}
                      <code className="rounded bg-surface px-1">www</code> para <code className="rounded bg-surface px-1">cname.vercel-dns.com</code>.
                    </>
                  ) : (
                    <>
                      um registro <code className="rounded bg-surface px-1">CNAME</code> em <code className="rounded bg-surface px-1">{store.customDomain.split(".")[0]}</code> apontando para{" "}
                      <code className="rounded bg-surface px-1">cname.vercel-dns.com</code>.
                    </>
                  )}
                </li>
                <li>A equipe Subrinho adiciona {store.customDomain} ao projeto na Vercel (o certificado HTTPS sai sozinho).</li>
                <li>Depois, clique em Verificar domínio. Enquanto isso, a loja segue no endereço oficial acima.</li>
              </ol>
            )}
            <ActionForm action={verify} className="mt-4">
              {hiddenInputs}
              <SubmitButton variant="outline" pendingText="Verificando…">
                Verificar domínio
              </SubmitButton>
            </ActionForm>
          </div>
        )}
        {sub && <p className="text-[12px] text-muted">Pelo subdomínio, a loja também abre em https://{sub}.</p>}
      </CardBody>
    </Card>
  );
}
