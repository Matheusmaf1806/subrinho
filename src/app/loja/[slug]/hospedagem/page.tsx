import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { date, paxSummary } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../_lib/store";
import { LodgingSearch } from "../_components/search-forms";
import { parseSearch, supplierParams, toQuery } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";

export const metadata = { title: "Hospedagem" };

export default async function LodgingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  const ctx = await getStorePricing(store.id);
  const { d, minDate } = parseSearch(await searchParams);
  const results = await searchCatalog(db, ctx, "LODGING", supplierParams(d, "lodging"));
  const base = `/loja/${store.slug}/hospedagem`;
  const nights = daysBetween(d.checkin, d.checkout);
  const q = toQuery({ checkin: d.checkin, checkout: d.checkout, quartos: d.quartos, adultos: d.adultos, criancas: d.criancas });
  const destinations = [...new Set(adaptersFor("LODGING").flatMap((a) => a.destinations().map((x) => x.name)))];
  const note = `${nights} noite${nights > 1 ? "s" : ""} · ${paxSummary({ rooms: d.quartos, adults: d.adultos, children: d.criancas })}`;
  return (
    <main>
      <ListingHeader eyebrow="Hospedagem" image="palmPool" title="Hotéis no mundo todo." subtitle="Comparamos vários fornecedores e mostramos o melhor preço para a sua estadia.">
        <LodgingSearch action={base} d={d} destinations={destinations} minDate={minDate} />
      </ListingHeader>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 sm:px-8">
        <p className="mb-8 text-[15px] text-muted">
          {results.length} hotel(is){d.destino ? ` em “${d.destino}”` : ""} · {date(d.checkin)} a {date(d.checkout)} · {note}
        </p>
        {results.length === 0 ? (
          <NoResults what="hotel" />
        ) : (
          <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/${p.supplierCode}/${p.productId}?${q}`} note={`total da estadia · ${note}`} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
