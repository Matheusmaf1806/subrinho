import { Check, MapPin, Star } from "lucide-react";
import type { PricedDetail } from "@/server/catalog";
import { Card } from "@/components/ui";
import { Cover } from "./cover";

export function ProductHero({ p, back }: { p: PricedDetail; back: { href: string; label: string } }) {
  return (
    <div className="space-y-5">
      <a href={back.href} className="text-sm font-bold text-muted hover:text-accent">
        ← {back.label}
      </a>
      <Cover title={p.title} location={p.destination} category={p.category} className="h-56 rounded-3xl sm:h-72" big />
      <div>
        <h1 className="text-3xl font-black tracking-tight text-ink">{p.title}</h1>
        {p.subtitle && <p className="mt-1 text-muted">{p.subtitle}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" /> {p.location}
          </span>
          {p.rating ? (
            <span className="inline-flex items-center gap-1 font-bold text-ink">
              <Star className="h-4 w-4 fill-current text-amber-500" /> {p.rating.toFixed(1)}
            </span>
          ) : null}
          {p.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-ink">
              {t}
            </span>
          ))}
        </div>
      </div>
      <Card className="p-5">
        <p className="text-ink">{p.description}</p>
        {p.highlights.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {h}
              </li>
            ))}
          </ul>
        )}
        {p.info.filter((i) => i.label !== "Fornecedor").length > 0 && (
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            {p.info
              .filter((i) => i.label !== "Fornecedor")
              .map((i) => (
                <div key={i.label}>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted">{i.label}</dt>
                  <dd className="font-bold text-ink">{i.value}</dd>
                </div>
              ))}
          </dl>
        )}
      </Card>
    </div>
  );
}
