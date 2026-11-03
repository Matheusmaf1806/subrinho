import { Smartphone, Wifi } from "lucide-react";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { Badge, Card } from "@/components/ui";
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
      <ListingHeader title="Chip internacional (eSIM)" subtitle="Chegue conectado: QR Code por e-mail, ativação em minutos.">
        <ChipSearch action={`/loja/${slug}/chip`} d={d} destinations={destinations} />
      </ListingHeader>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {results.length === 0 ? (
          <NoResults what="plano" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <Card key={p.productId} className="flex flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cream text-accent">
                    <Smartphone className="h-5 w-5" />
                  </span>
                  <Badge tone="brand">
                    <Wifi className="h-3 w-3" /> {p.destination}
                  </Badge>
                </div>
                <p className="mt-3 text-lg font-black text-ink">{p.title}</p>
                <p className="text-sm text-muted">{p.subtitle}</p>
                <div className="mt-3">
                  <PriceTag pix={p.price.pix} plan={p.price.plan} size="sm" note="por chip" />
                </div>
                <AddToCartForm action={add} hidden={{ supplier: p.supplierCode, productId: p.productId, optionId: p.productId }} className="mt-auto pt-3">
                  <div className="rounded-xl border border-line px-3 py-1">
                    <PaxStepper name="units" label="Quantidade" min={1} max={20} defaultValue={d.qtd} />
                  </div>
                </AddToCartForm>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
