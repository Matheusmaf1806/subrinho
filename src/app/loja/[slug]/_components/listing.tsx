import type { ReactNode } from "react";
import { Plane, SearchX } from "lucide-react";
import { Scribble } from "./journal";
import { EmptyState } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";

/** Fundo de papel na cor da agência (grão + pontilhado), como no topo da página inicial. */
function Paper() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 via-brand-50/60 to-white" />
      <div aria-hidden className="grain pointer-events-none absolute inset-0 -z-10 opacity-[0.12] mix-blend-multiply [mask-image:linear-gradient(to_bottom,black_60%,transparent)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle,var(--color-brand-200)_1.2px,transparent_1.6px)] bg-[length:22px_22px] [mask-image:radial-gradient(ellipse_50%_70%_at_15%_20%,black,transparent)]"
      />
    </>
  );
}

/** Título com a última palavra na cor da marca e sublinhada à mão. */
function ListingTitle({ title }: { title: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.pop() ?? "";
  return (
    <>
      {words.length > 0 && <>{words.join(" ")} </>}
      <span className="relative inline-block whitespace-nowrap text-accent-ink">
        {last}
        <Scribble draw className="absolute -bottom-1.5 left-0 h-2.5 w-full text-accent sm:-bottom-2.5 sm:h-3.5" />
      </span>
    </>
  );
}

/** Topo das listagens: papel com textura, título com traço à mão, foto em arco e a busca logo abaixo. */
export function ListingHeader({ title, subtitle, children, image, eyebrow, compact }: { title: string; subtitle?: string; children?: ReactNode; image?: PhotoKey; eyebrow?: string; compact?: boolean }) {
  const chip = eyebrow && (
    <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> {eyebrow}
    </p>
  );
  if (compact)
    return (
      <section className="relative isolate overflow-x-clip">
        <Paper />
        <div className="mx-auto max-w-[1440px] px-4 pb-4 pt-6 sm:px-8 sm:pt-9">
          {chip}
          <h1 data-enter className="text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
            <ListingTitle title={title} />
          </h1>
          {children && (
            <div className="mt-6" data-enter style={{ "--d": "120ms" } as React.CSSProperties}>
              {children}
            </div>
          )}
        </div>
      </section>
    );
  return (
    <section className="relative isolate overflow-x-clip">
      <Paper />
      <div className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div data-enter>
          {chip}
          <h1 className="display text-[clamp(2.6rem,6vw,5.25rem)] text-ink">
            <ListingTitle title={title} />
          </h1>
          {subtitle && <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {image && (
          <div className="relative hidden h-[330px] lg:block" data-enter style={{ "--d": "120ms" } as React.CSSProperties}>
            <div className="absolute inset-y-0 right-4 w-[300px] rotate-[2deg] overflow-hidden rounded-b-[2rem] rounded-t-[150px] bg-surface shadow-[0_30px_60px_-35px_rgba(0,0,0,0.55)] ring-8 ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(image, 700, 800)} alt="" className="h-full w-full object-cover" />
              <div className="grain absolute inset-0 opacity-25 mix-blend-overlay" aria-hidden />
            </div>
            <span data-bob className="absolute bottom-10 left-0 grid h-12 w-12 place-items-center rounded-full bg-white text-ink shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/[0.05]" aria-hidden>
              <Plane className="h-5 w-5" />
            </span>
          </div>
        )}
      </div>
      {children && (
        <div className="mx-auto max-w-[1440px] px-4 pb-4 pt-7 sm:px-8 sm:pt-9" data-enter style={{ "--d": "180ms" } as React.CSSProperties}>
          {children}
        </div>
      )}
    </section>
  );
}

export function NoResults({ what }: { what: string }) {
  return <EmptyState icon={<SearchX className="h-10 w-10" />} title={`Nenhum ${what} encontrado`} description="Tente outro destino ou outras datas." />;
}

export function ResultsMeta({ children }: { children: ReactNode }) {
  return <p className="mb-6 text-[15px] text-muted">{children}</p>;
}
