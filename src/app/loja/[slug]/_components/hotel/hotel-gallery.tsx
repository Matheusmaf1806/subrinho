"use client";

/**
 * Galeria do hotel: mosaico com as primeiras fotos e, ao clicar, todas as fotos em tela cheia com
 * filtro por categoria (Quartos, Piscina…), setas do teclado e miniaturas. Abre por portal no body
 * (o topo da loja tem backdrop-filter, que prende elementos `fixed`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { cn } from "@/components/ui";

type Photo = { url: string; tag: string | null };

export function HotelGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const thumbs = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of photos) if (p.tag) count.set(p.tag, (count.get(p.tag) ?? 0) + 1);
    return [...count.entries()];
  }, [photos]);
  const list = useMemo(() => (tag ? photos.filter((p) => p.tag === tag) : photos), [photos, tag]);
  const current = list[Math.min(index, list.length - 1)];

  const show = (i: number) => {
    setTag(null);
    setIndex(i);
    setOpen(true);
  };
  const step = useCallback((d: number) => setIndex((i) => (list.length ? (i + d + list.length) % list.length : 0)), [list.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, step]);

  // miniatura ativa sempre visível
  useEffect(() => {
    thumbs.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index, tag, open]);

  // deslizar no celular
  const touch = useRef<number | null>(null);

  if (!photos.length) return null;
  const tiles = photos.slice(0, 5);
  const layout =
    tiles.length >= 5
      ? ["col-span-2 row-span-2", "", "", "", ""]
      : tiles.length === 4
        ? ["col-span-2 row-span-2", "col-span-2", "", ""]
        : tiles.length === 3
          ? ["col-span-2 row-span-2", "col-span-2", "col-span-2"]
          : tiles.length === 2
            ? ["col-span-2 row-span-2", "col-span-2 row-span-2"]
            : ["col-span-4 row-span-2"];

  return (
    <>
      {/* celular: fotos deslizando */}
      <div className="relative -mx-4 sm:hidden">
        <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
          {photos.slice(0, 10).map((p, i) => (
            <button key={p.url} type="button" onClick={() => show(i)} className="relative h-64 w-[86%] shrink-0 snap-center overflow-hidden rounded-[1.5rem] bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={i === 0 ? title : ""} className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => show(0)} className="absolute bottom-3 right-7 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-[13px] font-semibold text-ink shadow-lg backdrop-blur">
          <Images className="h-4 w-4" aria-hidden /> {photos.length} fotos
        </button>
      </div>

      {/* computador: mosaico */}
      <div className="relative hidden h-[480px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[2rem] sm:grid">
        {tiles.map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => show(i)}
            data-enter
            style={{ "--d": `${60 + i * 70}ms` } as React.CSSProperties}
            className={cn("group relative overflow-hidden bg-surface", layout[i])}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={i === 0 ? title : ""} className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]" loading={i === 0 ? "eager" : "lazy"} />
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" aria-hidden />
          </button>
        ))}
        {photos.length > 1 && (
          <button type="button" onClick={() => show(0)} className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-[14px] font-semibold text-ink shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] ring-1 ring-black/5 backdrop-blur transition hover:bg-white">
            <Images className="h-4 w-4" aria-hidden /> Ver todas as {photos.length} fotos
          </button>
        )}
      </div>

      {open &&
        current &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={`Fotos de ${title}`} className="fixed inset-0 z-[90] flex flex-col bg-[#0b0b0d] text-white">
            <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-4 sm:px-8">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{title}</p>
                <p className="text-[13px] text-white/55 tabular">
                  {Math.min(index, list.length - 1) + 1} de {list.length}
                  {current.tag ? ` · ${current.tag}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20" aria-label="Fechar fotos">
                <X className="h-5 w-5" />
              </button>
            </div>
            {tags.length > 1 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 sm:px-8">
                {[[null, photos.length] as const, ...tags].map(([t, n]) => (
                  <button
                    key={t ?? "todas"}
                    type="button"
                    onClick={() => {
                      setTag(t);
                      setIndex(0);
                    }}
                    className={cn("shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition", tag === t ? "bg-white text-ink" : "bg-white/10 text-white/80 hover:bg-white/20")}
                  >
                    {t ?? "Todas"} <span className="opacity-60">{n}</span>
                  </button>
                ))}
              </div>
            )}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-20"
              onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (touch.current == null) return;
                const dx = e.changedTouches[0].clientX - touch.current;
                if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
                touch.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={current.url} src={current.url} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
              {list.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition hover:bg-white/25 sm:left-6" aria-label="Foto anterior">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button type="button" onClick={() => step(1)} className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition hover:bg-white/25 sm:right-6" aria-label="Próxima foto">
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>
            <div ref={thumbs} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4 sm:px-8">
              {list.map((p, i) => (
                <button key={p.url} data-i={i} type="button" onClick={() => setIndex(i)} className={cn("h-16 w-24 shrink-0 overflow-hidden rounded-lg transition", i === index ? "ring-2 ring-white" : "opacity-50 hover:opacity-90")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
