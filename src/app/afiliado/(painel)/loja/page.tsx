import type { Metadata } from "next";
import { ExternalLink, Lock } from "lucide-react";
import { Alert, Card, CardBody, CardHeader, DetailRow, PageHeader, buttonClass } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { requireAffiliateUser } from "@/server/auth/session";
import { appUrl, storePath } from "../../_lib/helpers";
import { updateStoreAction } from "./actions";
import { StoreForm } from "./store-form";
import { BrandingEditor } from "@/components/branding-editor";
import { brandingInitial, brandPresets } from "@/lib/branding-view";
import { updateBrandingAction } from "./branding-actions";

export const metadata: Metadata = { title: "Minha loja" };

export default async function AfiliadoLojaPage() {
  const { user, affiliate } = await requireAffiliateUser();
  const readOnly = user.role !== "ADMIN";
  const storeUrl = `${appUrl()}${storePath(affiliate.slug)}`;

  return (
    <>
      <PageHeader
        title="Minha loja"
        subtitle="Personalize a sua loja e mantenha os dados de contato e de repasse atualizados."
        actions={
          <a href={storePath(affiliate.slug)} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir minha loja
          </a>
        }
      />

      {readOnly && (
        <Alert tone="warning" className="mb-6" title="Somente leitura">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-4 w-4" aria-hidden /> Apenas usuários ADMIN da agência podem alterar os dados da loja.
          </span>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader title="Endereço e dados cadastrais" subtitle="Alterados somente pela equipe Subrinho" />
        <CardBody className="grid gap-x-8 md:grid-cols-2">
          <dl>
            <DetailRow label="Endereço da loja">
              <span className="break-all">{storeUrl}</span>
            </DetailRow>
            <DetailRow label="Identificador (slug)">{affiliate.slug}</DetailRow>
          </dl>
          <dl>
            <DetailRow label="Razão social">{affiliate.legalName || "—"}</DetailRow>
            <DetailRow label="CPF/CNPJ">{affiliate.document || "—"}</DetailRow>
          </dl>
          <div className="mt-2 md:col-span-2">
            <CopyButton text={storeUrl} label="Copiar link da loja" copiedLabel="Link copiado!" />
          </div>
        </CardBody>
      </Card>

      <h2 className="mb-1 mt-2 text-[1.75rem] font-semibold tracking-[-0.04em]">Identidade da loja</h2>
      <p className="mb-5 text-[15px] text-muted">Logo, cores, fonte e conteúdo da página inicial — a loja é 100% da sua agência.</p>
      <div className="mb-12">
        <BrandingEditor action={updateBrandingAction} initial={brandingInitial(affiliate)} presets={brandPresets()} readOnly={readOnly} />
      </div>

      <h2 className="mb-5 text-[1.75rem] font-semibold tracking-[-0.04em]">Contato e repasse</h2>
      <StoreForm
        action={updateStoreAction}
        readOnly={readOnly}
        storeUrl={storeUrl}
        initial={{
          name: affiliate.name,
          email: affiliate.email ?? "",
          phone: affiliate.phone ?? "",
          whatsapp: affiliate.whatsapp ?? "",
          pixKey: affiliate.pixKey ?? "",
          bankName: affiliate.bankName ?? "",
          bankAgency: affiliate.bankAgency ?? "",
          bankAccount: affiliate.bankAccount ?? "",
        }}
      />
    </>
  );
}
