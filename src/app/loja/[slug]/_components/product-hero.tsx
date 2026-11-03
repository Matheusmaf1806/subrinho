import Link from "next/link";
import { Check, MapPin, Star } from "lucide-react";
import type { PricedDetail } from "@/server/catalog";
import { CATEGORY_PHOTO, galleryFor, photo } from "@/lib/images";

export function ProductHero({ p, back }: { p: PricedDetail; back: { href: string; label: string } }) {
  const main = p.imageUrl ?? photo(CATEGORY_PHOTO[p.category] ?? "colosseum", 1600);
  const [a, b] = galleryFor(p.category, p.destination);
  const info = p.info.filter((i) => i.label !== "Fornecedor");
  return (
    <div className="min-w-0 space-y-10">
      <div>
        <Link href={back.href} className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-2">
          ← {back.label}
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
        <h1 className="display mt-3 text-[clamp(2.5rem,5vw,4.75rem)] text-ink">{p.title}</h1>
        {p.subtitle && <p className="mt-4 max-w-2xl text-[17px] text-muted">{p.subtitle}</p>}
      </div>

      <div className="grid h-[300px] grid-cols-3 grid-rows-2 gap-3 sm:h-[460px]">
        {[main, a, b].map((src, i) => (
          <div key={i} className={i === 0 ? "col-span-2 row-span-2 overflow-hidden rounded-[2rem]" : "overflow-hidden rounded-[1.5rem]"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src.replace("w=900", i === 0 ? "w=1600" : "w=900")} alt={i === 0 ? p.title : ""} className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
          </div>
        ))}
      </div>

      <div className="grid gap-10 border-t border-line pt-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-[19px] leading-relaxed text-ink">{p.description}</p>
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
                <li key={h} className="flex items-start gap-3 text-[15px] text-ink">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
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
                <div key={i.label} className="rounded-2xl bg-surface p-4">
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
export function BookingPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-black/[0.07] shadow-[0_40px_100px_-50px_rgba(10,10,11,0.45)] sm:p-7">
        <h2 className="mb-5 text-2xl font-semibold tracking-[-0.035em] text-ink">{title}</h2>
        {children}
      </div>
    </aside>
  );
}
