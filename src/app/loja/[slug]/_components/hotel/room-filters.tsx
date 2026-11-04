"use client";

/**
 * Filtros rápidos da lista de quartos (com café da manhã / cancelamento grátis). A lista vem pronta
 * do servidor; aqui só marcamos o filtro no contêiner e o CSS esconde os quartos que não servem
 * (ver [data-room-filter] no globals.css).
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

type Flags = { cafe: boolean; gratis: boolean };
const FILTERS: { key: keyof Flags; label: string }[] = [
  { key: "cafe", label: "Com café da manhã" },
  { key: "gratis", label: "Cancelamento grátis" },
];

export function RoomFilters({ rooms, children }: { rooms: Flags[]; children: ReactNode }) {
  const [on, setOn] = useState<(keyof Flags)[]>([]);
  // só oferece o filtro quando ele separa alguma coisa (nem todos, nem nenhum)
  const useful = FILTERS.filter((f) => {
    const n = rooms.filter((r) => r[f.key]).length;
    return n > 0 && n < rooms.length;
  });
  const visible = rooms.filter((r) => on.every((k) => r[k])).length;
  const toggle = (k: keyof Flags) => setOn((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div data-room-filter={on.join(" ")}>
      {useful.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {useful.map((f) => {
            const active = on.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(f.key)}
                className={cn("rounded-full px-4 py-2 text-[14px] font-semibold ring-1 ring-inset transition", active ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-black/10 hover:ring-ink/30")}
              >
                {f.label} <span className={active ? "text-white/60" : "text-muted"}>{rooms.filter((r) => r[f.key]).length}</span>
              </button>
            );
          })}
          {on.length > 0 && (
            <span className="text-[13px] text-muted" aria-live="polite">
              {visible} de {rooms.length} opções
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
