/**
 * "Você também pode gostar": produtos parecidos do mesmo destino (preço e estrelas mais próximos do
 * atual). Carrega em paralelo (Suspense): a página do produto aparece antes, sem esperar a busca.
 * Respeita o que o visitante pode ver (fornecedor / comissão) via `reveal`.
 */
import { Suspense } from "react";
import { db } from "@/server/db";
import { searchCatalog, type Reveal } from "@/server/catalog";
import type { PricingContext } from "@/server/pricing/cart-pricing";
import type { Category } from "@/server/db/schema";
import type { SearchParams } from "@/server/suppliers/types";
import { productRef } from "@/server/suppliers/refs";
import { ProductCard } from "./product-card";

type Props = {
  ctx: PricingContext;
  reveal: Reveal;
  category: Category;
  params: SearchParams;
  /** Produto atual (fica de fora, com os gêmeos dele em outros fornecedores). */
  current: { supplierCode: string; productId: string; groupKey?: string; pix?: number | null; stars?: number | null };
  hrefBase: string;
  query: string;
  title: string;
  note?: string;
  nights?: number;
};

export function RelatedProducts(props: Props) {
  return (
    <Suspense fallback={<RelatedSkeleton title={props.title} />}>
      <RelatedList {...props} />
    </Suspense>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-12">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">Você também pode gostar</p>
      <h2 className="mb-6 text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tracking-[-0.045em] text-ink">{title}</h2>
      {children}
    </section>
  );
}

function RelatedSkeleton({ title }: { title: string }) {
  return (
    <Shell title={title}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i > 1 ? "hidden lg:block" : ""}>
            <div className="aspect-[4/3] animate-pulse rounded-[1.75rem] bg-surface" />
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-surface" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-surface" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

async function RelatedList({ ctx, reveal, category, params, current, hrefBase, query, title, note, nights }: Props) {
  if (!params.destination) return null;
  const list = await searchCatalog(db, ctx, category, params, { reveal }).catch(() => []);
  const others = list.filter((x) => !(x.supplierCode === current.supplierCode && x.productId === current.productId) && !(current.groupKey && x.groupKey === current.groupKey));
  if (!others.length) return null;
  // mais parecido primeiro: diferença de preço (escala log) e de estrelas
  const score = (x: (typeof others)[number]) =>
    (current.pix ? Math.abs(Math.log(Number(x.price.pix.toString()) / current.pix)) : 0) + (current.stars && x.stars ? Math.abs(x.stars - current.stars) * 0.35 : 0);
  const top = [...others].sort((a, b) => score(a) - score(b)).slice(0, 4);
  return (
    <Shell title={title}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {top.map((p) => (
          <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${hrefBase}/${productRef(p.supplierCode, p.productId)}${query ? `?${query}` : ""}`} note={note} nights={nights} />
        ))}
      </div>
    </Shell>
  );
}
