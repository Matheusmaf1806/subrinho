"use client";

import { useEffect } from "react";

/** Erro inesperado no servidor (ex.: banco indisponível). */
export default function GlobalSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="display text-[clamp(2.5rem,6vw,4rem)] text-ink">Algo deu errado.</h1>
        <p className="mt-4 text-[15px] text-muted">Não foi possível carregar esta página agora. Tente novamente em instantes.</p>
        <button onClick={reset} className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white">
          Tentar de novo
        </button>
        {error.digest && <p className="mt-6 text-xs text-muted">Código: {error.digest}</p>}
      </div>
    </main>
  );
}
