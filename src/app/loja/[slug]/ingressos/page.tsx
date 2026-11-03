import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { getStore, getStorePricing } from "../_lib/store";
import { TicketsSearch } from "../_components/search-forms";
import { parseSearch, supplierParams, toQuery } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";
import { date } from "@/lib/format";

export const metadata = { title: "Ingressos e Experiências" };

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  const ctx = await getStorePricing(store.id);
  const { d, minDate } = parseSearch(await searchParams);
  const results = await searchCatalog(db, ctx, "TICKETS", supplierParams(d, "tickets"));
  const base = `/loja/${store.slug}/ingressos`;
  const q = toQuery({ data: d.data, adultos: d.adultos, criancas: d.criancas });
  const destinations = [...new Set(adaptersFor("TICKETS").flatMap((a) => a.destinations().map((x) => x.name)))];
  return (
    <main>
      <ListingHeader eyebrow="Ingressos e experiências" image="colosseumArches" title="Ingressos sem fila." subtitle="Parques, museus e passeios com data marcada — no Pix ou em 10x sem juros.">
        <TicketsSearch action={base} d={d} destinations={destinations} minDate={minDate} />
      </ListingHeader>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 sm:px-8">
        <p className="mb-8 text-[15px] text-muted">
          {results.length} resultado(s){d.destino ? ` para “${d.destino}”` : ""} · visita em {date(d.data)} · preços por adulto
        </p>
        {results.length === 0 ? (
          <NoResults what="ingresso" />
        ) : (
          <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/${p.supplierCode}/${p.productId}?${q}`} note="por adulto" />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
