import Link from "next/link";
import { Check, ImageOff, MapPin, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/components/ui";
import type { PricedDetail } from "@/server/catalog";
import { CATEGORY_PHOTO, galleryFor, photo } from "@/lib/images";

/** Fotos da página: as reais do fornecedor (nunca misturadas com fotos ilustrativas). */
function photosOf(p: PricedDetail): string[] {
  // Fornecedor real (galeria informada): somente as fotos dele — inventar foto de hotel/casa engana o cliente.
  if (p.gallery) return [...new Set([...p.gallery, ...(p.imageUrl ? [p.imageUrl] : [])])].slice(0, 3);
  // Catálogo simulado: foto do produto + fotos ilustrativas do destino.
  const [stockA, stockB] = galleryFor(p.category, p.destination);
  return [p.imageUrl ?? photo(CATEGORY_PHOTO[p.category] ?? "colosseum", 1600), stockA, stockB];
}

export function ProductHero({ p, back, cta }: { p: PricedDetail; back: { href: string; label: string }; cta?: { href: string; label: string; note?: string; mobileOnly?: boolean } }) {
  const photos = photosOf(p);
  const paragraphs = p.description.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const info = p.info.filter((i) => !/fornecedor/i.test(i.label));
  return (
    <div className="min-w-0 space-y-10">
      <div>
        <Link href={back.href} className="group inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] transition hover:ring-ink/20">
          <span className="transition group-hover:-translate-x-0.5">←</span> {back.label}
        </Link>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {p.location}
          </span>
          {p.rating ? (
            <span className="inline-flex items-center gap-1 font-semibold text-ink">
              <Star className="h-4 w-4 fill-current" /> {p.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
        <h1 data-enter className="display mt-3 text-[clamp(2.5rem,5vw,4.75rem)] text-ink">
          {p.title}
        </h1>
        {p.subtitle && <p className="mt-4 max-w-2xl text-[17px] text-muted">{p.subtitle}</p>}
        {cta && (
          <div className={`mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 ${cta.mobileOnly ? "lg:hidden" : ""}`}>
            <a href={cta.href} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition hover:bg-ink-2">
              {cta.label} <span aria-hidden>↓</span>
            </a>
            {cta.note && <span className="text-[15px] text-muted">{cta.note}</span>}
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="grid h-[220px] place-items-center rounded-[2rem] bg-surface text-muted sm:h-[300px]">
          <div className="flex flex-col items-center gap-2 text-center">
            <ImageOff className="h-8 w-8" />
            <p className="text-[14px] font-semibold">O fornecedor ainda não enviou fotos deste local.</p>
          </div>
        </div>
      ) : (
        <div className={`grid h-[300px] gap-3 sm:h-[460px] ${photos.length >= 3 ? "grid-cols-3 grid-rows-2" : photos.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {photos.map((src, i) => (
            <div
              key={src}
              data-enter
              style={{ "--d": `${80 + i * 90}ms` } as React.CSSProperties}
              className={cn(
                "group relative overflow-hidden bg-surface shadow-[0_24px_50px_-36px_rgba(0,0,0,0.6)]",
                i === 0 && photos.length >= 3 ? "col-span-2 row-span-2 rounded-[2rem]" : i === 0 ? "rounded-[2rem]" : "rounded-[1.5rem]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src.replace("w=900", i === 0 ? "w=1600" : "w=900")} alt={i === 0 ? p.title : ""} className="h-full w-full object-cover transition duration-[1.2s] ease-out group-hover:scale-105" loading={i === 0 ? "eager" : "lazy"} />
              <div className="grain pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay" aria-hidden />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-10 border-t border-line pt-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="space-y-4">
            {paragraphs.slice(0, 3).map((t, i) => (
              <p key={i} className={i === 0 ? "whitespace-pre-line text-[19px] leading-relaxed text-ink" : "whitespace-pre-line text-[16px] leading-relaxed text-ink/80"}>
                {t}
              </p>
            ))}
            {paragraphs.length > 3 && (
              <details className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-[14px] font-semibold text-ink hover:bg-surface-2">
                  <span className="group-open:hidden">Ver descrição completa</span>
                  <span className="hidden group-open:inline">Mostrar menos</span>
                </summary>
                <div className="mt-4 space-y-3">
                  {paragraphs.slice(3).map((t, i) => (
                    <p key={i} className="whitespace-pre-line text-[15px] leading-relaxed text-ink/80">
                      {t}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>
          {p.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {p.tags.slice(0, 5).map((t) => (
                <span key={t} className="rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          {p.highlights.length > 0 && (
            <ul className="space-y-3">
              {p.highlights.map((h) => (
                <li key={h} className="flex items-start gap-3 text-[15px] text-ink" data-reveal>
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_6px_14px_-6px_var(--color-accent)]">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          )}
          {info.length > 0 && (
            <dl className="grid grid-cols-2 gap-3">
              {info.map((i) => (
                <div key={i.label} className="rounded-2xl border border-dashed border-ink/15 bg-white p-4" data-reveal>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{i.label}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-ink">{i.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

/** Painel de reserva fixo à direita. */
export function BookingPanel({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <aside id={id} className="scroll-mt-[calc(var(--store-top,72px)+24px)] lg:sticky lg:top-[calc(var(--store-top,72px)+24px)] lg:self-start">
      <div data-enter style={{ "--d": "160ms" } as React.CSSProperties} className="relative overflow-hidden rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-black/[0.07] shadow-[0_40px_100px_-50px_rgba(10,10,11,0.45)] sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-accent)_0_18px,transparent_18px_26px)] opacity-80" />
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Compra segura
        </p>
        <h2 className="mb-5 text-2xl font-semibold tracking-[-0.035em] text-ink">{title}</h2>
        {children}
      </div>
    </aside>
  );
}
