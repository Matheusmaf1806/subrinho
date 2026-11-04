"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition hover:bg-ink-2">
      <Printer className="h-4 w-4" /> Imprimir / salvar PDF
    </button>
  );
}
