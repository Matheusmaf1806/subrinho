"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

export default function PainelAfiliadoError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-line bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold text-ink">Algo deu errado por aqui</p>
      <p className="mt-2 text-sm text-muted">Não foi possível carregar esta página. Tente novamente em instantes.</p>
      {digest && <p className="mt-2 text-xs text-muted">Código do erro: {digest}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          Tentar novamente
        </button>
        <a href="/afiliado" className={buttonClass("outline")}>
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
