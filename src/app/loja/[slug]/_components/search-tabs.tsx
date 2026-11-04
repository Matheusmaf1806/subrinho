"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };

/** Abas de busca por produto, em pílulas sobre a foto do banner do topo. */
export function SearchTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div>
      <div className="no-scrollbar mb-3 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-black/30 p-1 backdrop-blur-md" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`aba-${t.key}`}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            aria-controls={`painel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition", active === t.key ? "bg-white text-ink shadow-sm" : "text-white/80 hover:text-white")}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={t.key !== active} role="tabpanel" id={`painel-${t.key}`} aria-labelledby={`aba-${t.key}`}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
