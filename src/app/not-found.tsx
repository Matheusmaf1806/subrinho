import Link from "next/link";
import { SubrinhoSymbol } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <SubrinhoSymbol className="mx-auto h-16 w-auto text-brand" />
        <h1 className="display mt-8 text-[clamp(2.75rem,6vw,5rem)] text-ink">Página não encontrada.</h1>
        <p className="mt-2 text-muted">O endereço pode ter mudado ou o item não existe mais.</p>
        <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white hover:bg-ink-2">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
