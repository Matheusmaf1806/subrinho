import type { ReactNode } from "react";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";

/** Topo das listagens: bloco chapado na cor da loja com título de cartaz + foto, busca sobreposta. */
export function ListingHeader({ title, subtitle, children, image, eyebrow, compact }: { title: string; subtitle?: string; children?: ReactNode; image?: PhotoKey; eyebrow?: string; compact?: boolean }) {
  if (compact)
    return (
      <section className="px-3 pt-3 sm:px-4">
        <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[2rem] bg-accent text-accent-fg sm:rounded-[2.5rem]">
          <div className="relative px-6 pb-20 pt-7 sm:px-12 sm:pb-24 sm:pt-10">
            {eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-fg/70">{eyebrow}</p>}
            <h1 className="display text-[clamp(2rem,4.5vw,3.5rem)]">{title}</h1>
          </div>
        </div>
        {children && <div className="relative mx-auto -mt-14 max-w-[1440px] px-3 sm:-mt-14 sm:px-8">{children}</div>}
      </section>
    );
  return (
    <section className="px-3 pt-3 sm:px-4">
      <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[2rem] bg-accent text-accent-fg sm:rounded-[2.5rem]">
        {image && (
          <div className="absolute inset-y-0 right-0 hidden w-[42%] lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo(image, 1400)} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-accent to-transparent to-40%" />
          </div>
        )}
        <div className="relative px-6 pb-28 pt-12 sm:px-12 sm:pb-32 sm:pt-16 lg:max-w-[62%]">
          {eyebrow && <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-fg/70">{eyebrow}</p>}
          <h1 className="display text-[clamp(2.75rem,6.5vw,5.75rem)]">{title}</h1>
          {subtitle && <p className="mt-4 max-w-xl text-[17px] text-accent-fg/85">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="relative mx-auto -mt-20 max-w-[1440px] px-3 sm:-mt-16 sm:px-8">{children}</div>}
    </section>
  );
}

export function NoResults({ what }: { what: string }) {
  return <EmptyState icon={<SearchX className="h-10 w-10" />} title={`Nenhum ${what} encontrado`} description="Tente outro destino ou outras datas." />;
}

export function ResultsMeta({ children }: { children: ReactNode }) {
  return <p className="mb-6 text-[15px] text-muted">{children}</p>;
}
