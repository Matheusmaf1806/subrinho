"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export function SearchTabs({ tabs }: { tabs: { key: string; label: string; icon: ReactNode; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].key);
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold transition",
              active === t.key ? "bg-white text-accent shadow" : "bg-white/15 text-white hover:bg-white/25",
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
