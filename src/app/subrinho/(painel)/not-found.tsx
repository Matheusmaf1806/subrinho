import { ButtonLink, EmptyState } from "@/components/ui";

export default function SubrinhoPanelNotFound() {
  return (
    <div className="rounded-2xl border border-line bg-white">
      <EmptyState
        title="Não encontrado"
        description="O registro que você procura não existe ou foi removido."
        action={<ButtonLink href="/subrinho">Voltar ao painel</ButtonLink>}
      />
    </div>
  );
}
