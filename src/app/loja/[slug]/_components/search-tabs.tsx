"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };

/**
 * Abas de busca por produto.
 * - "pill": pílulas (sobre fundo escuro ou claro);
 * - "underline": ícone + rótulo com traço na cor da agência (cartão de busca da home; no celular o
 *   ícone fica em cima do rótulo).
 */
export function SearchTabs({ tabs, tone = "dark", variant = "pill", center }: { tabs: Tab[]; tone?: "dark" | "light" | "photo"; variant?: "pill" | "underline"; center?: boolean }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const panels = tabs.map((t) => (
    <div key={t.key} hidden={t.key !== active} role="tabpanel" id={`painel-${t.key}`} aria-labelledby={`aba-${t.key}`}>
      {t.content}
    </div>
  ));

  if (variant === "underline")
    return (
      <div>
        <div className="no-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1 sm:gap-2" role="tablist">
          {tabs.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                id={`aba-${t.key}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`painel-${t.key}`}
                onClick={() => setActive(t.key)}
                className={cn(
                  "relative flex min-w-[4.5rem] shrink-0 flex-1 flex-col items-center gap-1.5 whitespace-nowrap px-2 pb-3 pt-1 text-[13px] font-semibold transition sm:min-w-0 sm:flex-none sm:flex-row sm:gap-2 sm:px-2.5 sm:text-[15px] [&_svg]:h-6 [&_svg]:w-6 sm:[&_svg]:h-5 sm:[&_svg]:w-5",
                  on ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <span className={on ? "text-accent-ink" : ""}>{t.icon}</span>
                {t.label}
                <span className={cn("absolute inset-x-1 -bottom-px h-[3px] rounded-full transition", on ? "bg-accent" : "bg-transparent")} aria-hidden />
              </button>
            );
          })}
        </div>
        {panels}
      </div>
    );

  return (
    <div>
      <div className={cn(center && "flex justify-center")}>
      <div
        className={cn(
          "no-scrollbar mb-3 inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1",
          tone === "dark" ? "bg-accent-fg/10 backdrop-blur" : tone === "photo" ? "bg-black/30 backdrop-blur-md" : "bg-surface",
        )}
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`aba-${t.key}`}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            aria-controls={`painel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition",
              active === t.key ? "bg-white text-ink shadow-sm" : tone === "dark" ? "text-accent-fg/75 hover:text-accent-fg" : tone === "photo" ? "text-white/80 hover:text-white" : "text-muted hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      </div>
      {panels}
    </div>
  );
}
