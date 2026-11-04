"use client";

import { Pencil, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * No celular, depois de buscar, o formulário vira um resumo de uma linha ("Orlando · 18–23 dez ·
 * 2 adultos") com "Alterar" — os resultados aparecem logo na primeira tela. No computador o
 * formulário fica sempre aberto.
 */
export function MobileSearchToggle({ summary, detail, children }: { summary: string; detail?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-[1.5rem] bg-white p-3 pl-4 text-left shadow-[0_30px_80px_-40px_rgba(10,10,11,0.45)] ring-1 ring-inset ring-black/[0.06] sm:hidden"
          aria-expanded={false}
        >
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{summary}</span>
            {detail && <span className="block truncate text-[12px] text-muted">{detail}</span>}
          </span>
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-white">
            <Pencil className="h-3.5 w-3.5" /> Alterar
          </span>
        </button>
      )}
      <div className={open ? "" : "hidden sm:block"}>{children}</div>
    </>
  );
}
