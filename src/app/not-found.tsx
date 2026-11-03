import Link from "next/link";
import { SubrinhoSymbol } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <SubrinhoSymbol className="mx-auto h-16 w-auto text-brand" />
        <h1 className="mt-6 text-3xl font-black text-ink">Página não encontrada</h1>
        <p className="mt-2 text-muted">O endereço pode ter mudado ou o item não existe mais.</p>
        <Link href="/" className="mt-6 inline-block font-bold text-brand hover:underline">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
