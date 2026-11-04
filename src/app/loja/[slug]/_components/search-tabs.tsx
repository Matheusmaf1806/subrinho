"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export function SearchTabs({ tabs, tone = "dark" }: { tabs: { key: string; label: string; icon: ReactNode; content: ReactNode }[]; tone?: "dark" | "light" }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div>
      <div className={cn("no-scrollbar mb-3 inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1", tone === "dark" ? "bg-accent-fg/10 backdrop-blur" : "bg-surface")} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition",
              active === t.key ? "bg-white text-ink shadow-sm" : tone === "dark" ? "text-accent-fg/75 hover:text-accent-fg" : "text-muted hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={t.key !== active} role="tabpanel">
          {t.content}
        </div>
      ))}
    </div>
  );
}
