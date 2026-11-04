import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { PricedSummary } from "@/server/catalog";
import { brl } from "@/lib/format";
import { Cover } from "./cover";

function bathroomsLabel(n: number) {
  const whole = Math.floor(n);
  const txt = n - whole >= 0.5 ? `${whole}½` : String(whole);
  return `${txt} banheiro${n > 1 ? "s" : ""}`;
}

export function ProductCard({ p, href, note, nights }: { p: PricedSummary; href: string; note?: string; nights?: number }) {
  const perNight = nights && nights > 1 ? Number(p.price.pix.div(nights).toFixed(0)) : null;
  const stars = p.stars ? `${"★".repeat(Math.floor(p.stars))}${p.stars % 1 ? "½" : ""}` : null;
  return (
    <Link href={href} className="group flex flex-col transition duration-300 ease-out hover:-translate-y-1.5">
      <Cover
        title={p.title}
        location={p.destination}
        category={p.category}
        imageUrl={p.imageUrl}
        className="aspect-[4/3] shadow-[0_20px_40px_-32px_rgba(0,0,0,0.55)] transition-shadow duration-300 group-hover:shadow-[0_34px_60px_-30px_rgba(0,0,0,0.55)]"
        overlay={
          p.rating ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <Star className="h-3 w-3 fill-current" /> {p.rating.toFixed(1)}
            </span>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col px-1 pt-4">
        <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.02em] text-ink">{p.title}</h3>
        {(stars || p.perks) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold">
            {stars && (
              <span className="text-amber-500" aria-label={`${p.stars} estrelas`}>
                {stars}
              </span>
            )}
            {p.perks?.breakfast && <span className="rounded-full bg-surface px-2 py-0.5 text-ink/80">Café da manhã</span>}
            {p.perks?.refundable && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Reembolsável</span>}
          </p>
        )}
        {p.house && (
          <p className="mt-1 text-[13px] font-medium text-ink/80">
            {p.house.bedrooms} quarto{p.house.bedrooms === 1 ? "" : "s"} · {bathroomsLabel(p.house.bathrooms)} · até {p.house.maxGuests} hóspedes
          </p>
        )}
        {p.house && p.tags.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1 text-[12px] font-semibold">
            {p.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-surface px-2 py-0.5 text-ink/80">
                {t}
              </span>
            ))}
          </p>
        )}
        <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{p.area ?? p.location}</span>
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="leading-tight">
            <p className="text-xs text-muted">{p.house ? "total da estadia" : "a partir de"}</p>
            <p className="text-xl font-semibold tracking-[-0.03em] tabular">
              {brl(p.price.pix)} <span className="text-[13px] font-semibold tracking-normal text-accent-ink">Pix</span>
            </p>
            <p className="text-xs text-muted tabular">
              ou {p.price.plan.count}x {brl(p.price.plan.installment)}
              {note ? ` · ${note}` : ""}
            </p>
            {perNight !== null && <p className="text-xs text-muted tabular">≈ {brl(perNight)} por noite</p>}
          </div>
          <span className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-ink transition duration-300 group-hover:-rotate-45 group-hover:bg-accent group-hover:text-accent-fg" aria-hidden>
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
