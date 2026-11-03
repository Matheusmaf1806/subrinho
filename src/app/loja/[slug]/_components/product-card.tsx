import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { PricedSummary } from "@/server/catalog";
import { Cover } from "./cover";
import { PriceTag } from "./price-tag";

export function ProductCard({ p, href, note }: { p: PricedSummary; href: string; note?: string }) {
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-xl">
      <Cover title={p.title} location={p.destination} category={p.category} className="h-36" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold leading-snug text-ink group-hover:text-accent">{p.title}</h3>
          {p.rating ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-cream px-1.5 py-0.5 text-xs font-extrabold text-ink">
              <Star className="h-3 w-3 fill-current text-amber-500" /> {p.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
        {p.subtitle && <p className="text-sm text-muted">{p.subtitle}</p>}
        <p className="inline-flex items-center gap-1 text-xs text-muted">
          <MapPin className="h-3 w-3" /> {p.location}
        </p>
        <div className="mt-auto pt-2">
          <PriceTag pix={p.price.pix} plan={p.price.plan} from size="sm" note={note} />
        </div>
      </div>
    </Link>
  );
}
