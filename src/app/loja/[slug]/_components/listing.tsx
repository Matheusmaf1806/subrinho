import type { ReactNode } from "react";
import { Plane, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";

/** Fundo de papel quadriculado na cor da agência, como no topo da página inicial. */
function Paper() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 via-brand-50/60 to-white" />
      <div aria-hidden className="grid-paper pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
    </>
  );
}

/** Título com a última palavra em marca-texto na cor da marca. */
function ListingTitle({ title }: { title: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.pop() ?? "";
  return (
    <>
      {words.length > 0 && <>{words.join(" ")} </>}
      <span className="marker whitespace-nowrap text-accent-ink">{last}</span>
    </>
  );
}

/** Topo das listagens: papel com textura, título com traço à mão, foto em arco e a busca logo abaixo. */
export function ListingHeader({ title, subtitle, children, image, eyebrow, compact }: { title: string; subtitle?: string; children?: ReactNode; image?: PhotoKey; eyebrow?: string; compact?: boolean }) {
  const chip = eyebrow && (
    <p className="mb-4 inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink ring-1 ring-inset ring-brand-100">
      <span className="h-2 w-2 bg-accent" aria-hidden /> {eyebrow}
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
            <div className="absolute bottom-0 right-0 h-[88%] w-[78%] rounded-[1.25rem] bg-accent" aria-hidden>
              <div className="grid-paper grid-paper-light absolute inset-0 rounded-[1.25rem]" />
            </div>
            <div className="absolute left-[6%] top-0 h-[86%] w-[80%] overflow-hidden rounded-[1.25rem] bg-surface ring-1 ring-black/5 shadow-[0_30px_60px_-35px_rgba(0,0,0,0.55)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(image, 800, 640)} alt="" className="h-full w-full object-cover" />
            </div>
            <span data-drop style={{ "--d": "380ms" } as React.CSSProperties} className="absolute -left-1 bottom-6 grid h-12 w-12 place-items-center rounded-xl bg-white text-ink ring-1 ring-ink/10 [--hs:var(--color-ink)] [--hx:5px] [--hy:5px] hard-shadow" aria-hidden>
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
