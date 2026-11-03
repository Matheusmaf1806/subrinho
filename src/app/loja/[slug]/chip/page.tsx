import { Smartphone, Wifi } from "lucide-react";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { getStore, getStorePricing } from "../_lib/store";
import { ChipSearch } from "../_components/search-forms";
import { parseSearch, supplierParams } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { AddToCartForm } from "../_components/add-to-cart";
import { PaxStepper } from "../_components/pax-stepper";
import { PriceTag } from "../_components/price-tag";
import { addToCartAction } from "../actions";

export const metadata = { title: "Chip internacional" };

/** Página única: lista e detalha os planos de eSIM na mesma página. */
export default async function ChipPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const { d } = parseSearch(await searchParams);
  const results = await searchCatalog(db, ctx, "CHIP", supplierParams(d, "chip"));
  const destinations = [...new Set(adaptersFor("CHIP").flatMap((a) => a.destinations().map((x) => x.name)))];
  const add = addToCartAction.bind(null, slug);
  return (
    <main>
      <ListingHeader eyebrow="Chip internacional" image="phones" title="Chegue conectado." subtitle="eSIM com QR Code por e-mail e ativação em minutos.">
        <ChipSearch action={`/loja/${slug}/chip`} d={d} destinations={destinations} />
      </ListingHeader>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 sm:px-8">
        {results.length === 0 ? (
          <NoResults what="plano" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <div key={p.productId} className="flex flex-col rounded-[2rem] bg-surface p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">
                    <Wifi className="h-3.5 w-3.5 text-accent" /> {p.destination}
                  </span>
                  <Smartphone className="h-5 w-5 text-muted" />
                </div>
                <p className="mt-8 text-[3.25rem] font-semibold leading-none tracking-[-0.06em]">{p.title.split("— ")[1] ?? p.title}</p>
                <p className="mt-2 text-[15px] text-muted">{p.subtitle}</p>
                <div className="mt-6">
                  <PriceTag pix={p.price.pix} plan={p.price.plan} size="sm" note="por chip" />
                </div>
                <AddToCartForm action={add} hidden={{ supplier: p.supplierCode, productId: p.productId, optionId: p.productId }} className="mt-auto pt-5">
                  <div className="rounded-2xl bg-white px-4 py-1">
                    <PaxStepper name="units" label="Quantidade" min={1} max={20} defaultValue={d.qtd} />
                  </div>
                </AddToCartForm>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
