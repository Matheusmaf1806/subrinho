import { Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui";

/** Categoria ainda sem fornecedor real: nada de catálogo de exemplo, só o aviso. */
export function ComingSoon({ title, base }: { title: string; base: string }) {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
      <div className="mx-auto max-w-xl rounded-[2rem] bg-surface p-10 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-accent-ink" />
        <h1 className="mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.04em] text-ink">{title}: em breve</h1>
        <p className="mt-3 text-[15px] text-muted">Estamos preparando esta categoria. Enquanto isso, fale com a gente pelo WhatsApp que montamos a sua viagem.</p>
        <ButtonLink href={base || "/"} className="mt-6">
          Voltar para o início
        </ButtonLink>
      </div>
    </main>
  );
}
