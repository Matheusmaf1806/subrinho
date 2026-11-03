"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function SubrinhoPanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-line bg-white px-6 py-12 text-center">
      <TriangleAlert className="mx-auto h-10 w-10 text-brand" aria-hidden />
      <h1 className="mt-3 text-xl font-semibold text-ink">Algo deu errado</h1>
      <p className="mt-1 text-sm text-muted">
        Não foi possível carregar ou concluir esta operação. Se você enviou arquivos, confira se o total não passa de 10 MB.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-muted">Código: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className={buttonClass("primary", "md")}>
          Tentar novamente
        </button>
        <a href="/subrinho" className={buttonClass("outline", "md")}>
          Ir para o início
        </a>
      </div>
    </div>
  );
}
