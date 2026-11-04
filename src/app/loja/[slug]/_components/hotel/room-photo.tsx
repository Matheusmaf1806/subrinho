"use client";

/** Foto no cartão do quarto: abre a galeria só com as fotos daquele quarto (ou com as fotos de quartos do hotel). */
import { Images } from "lucide-react";
import { GALLERY_EVENT, type GalleryRequest } from "./hotel-gallery";

export function RoomPhoto({ src, count, own, urls }: { src: string; count: number; own: boolean; urls?: string[] }) {
  const open = () => window.dispatchEvent(new CustomEvent<GalleryRequest>(GALLERY_EVENT, { detail: own ? { urls } : { tag: "Quartos" } }));
  return (
    <button type="button" onClick={open} className="group relative block h-48 w-full overflow-hidden bg-surface text-left sm:h-full sm:min-h-[200px]" aria-label={own ? "Ver fotos deste quarto" : "Ver fotos dos quartos do hotel"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-[12px] font-semibold text-white">
        <span className="inline-flex items-center gap-1.5">
          <Images className="h-3.5 w-3.5" aria-hidden />
          {own ? `${count} foto${count > 1 ? "s" : ""} deste quarto` : "Fotos dos quartos do hotel"}
        </span>
      </span>
    </button>
  );
}
