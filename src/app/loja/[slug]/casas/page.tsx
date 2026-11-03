import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { date } from "@/lib/format";
import { addDays, daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../_lib/store";
import { LodgingSearch } from "../_components/search-forms";
import { parseSearch, supplierParams, toQuery } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";

export const metadata = { title: "Casas" };

export default async function HousesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  const ctx = await getStorePricing(store.id);
  const sp = await searchParams;
  const parsed = parseSearch(sp);
  // Casas: estadia padrão de 7 noites
  const d = { ...parsed.d, checkout: sp.checkout ? parsed.d.checkout : addDays(parsed.d.checkin, 7) };
  const results = await searchCatalog(db, ctx, "HOUSES", supplierParams(d, "houses"));
  const base = `/loja/${store.slug}/casas`;
  const nights = daysBetween(d.checkin, d.checkout);
  const q = toQuery({ checkin: d.checkin, checkout: d.checkout, adultos: d.adultos, criancas: d.criancas });
  const destinations = [...new Set(adaptersFor("HOUSES").flatMap((a) => a.destinations().map((x) => x.name)))];
  return (
    <main>
      <ListingHeader eyebrow="Casas" image="villaPool" title="Casa com piscina perto dos parques." subtitle="Ideal para famílias e grupos: espaço, cozinha e piscina privativa.">
        <LodgingSearch action={base} d={d} destinations={destinations} minDate={parsed.minDate} houses />
      </ListingHeader>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 sm:px-8">
        <p className="mb-8 text-[15px] text-muted">
          {results.length} casa(s) · {date(d.checkin)} a {date(d.checkout)} · {nights} noites · {d.adultos + d.criancas} hóspedes
        </p>
        {results.length === 0 ? (
          <NoResults what="casa" />
        ) : (
          <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/${p.supplierCode}/${p.productId}?${q}`} note={`total de ${nights} noites com taxa de limpeza`} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
