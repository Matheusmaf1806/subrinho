import { ShieldCheck } from "lucide-react";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { INSURANCE_REGIONS } from "@/server/suppliers/mock/single-page";
import { Badge, Card } from "@/components/ui";
import { date } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../_lib/store";
import { InsuranceSearch } from "../_components/search-forms";
import { parseSearch, supplierParams } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { AddToCartForm } from "../_components/add-to-cart";
import { PriceTag } from "../_components/price-tag";
import { addToCartAction } from "../actions";

export const metadata = { title: "Seguro Viagem" };

/** Página única: lista e detalha os planos na mesma página. */
export default async function InsurancePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const { d, minDate } = parseSearch(await searchParams);
  const travelers = d.adultos + d.seniores || 1;
  const params2 = supplierParams({ ...d, adultos: d.adultos + d.seniores === 0 ? 1 : d.adultos }, "insurance");
  const results = await searchCatalog(db, ctx, "INSURANCE", params2);
  const days = daysBetween(d.ida, d.volta) + 1;
  const add = addToCartAction.bind(null, slug);
  return (
    <main>
      <ListingHeader title="Seguro Viagem" subtitle="Compare os planos e contrate em minutos. Obrigatório para a Europa.">
        <InsuranceSearch action={`/loja/${slug}/seguro-viagem`} d={d} regions={INSURANCE_REGIONS} minDate={minDate} />
      </ListingHeader>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="mb-4 text-sm text-muted">
          {d.destino || "Europa"} · {date(d.ida)} a {date(d.volta)} · {days} dias · {travelers} viajante(s)
        </p>
        {results.length === 0 ? (
          <NoResults what="plano" />
        ) : (
          <div className="space-y-4">
            {results.map((p) => (
              <Card key={`${p.supplierCode}-${p.productId}`} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cream text-accent">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-lg font-black text-ink">{p.title}</p>
                    <p className="text-sm text-muted">{p.subtitle}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                      <Badge tone="info">Assistência 24h em português</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <PriceTag pix={p.price.pix} plan={p.price.plan} size="sm" note={`total para ${travelers} viajante(s) · ${days} dias`} className="sm:text-right" />
                  <AddToCartForm
                    action={add}
                    label="Contratar"
                    buttonClassName="w-full sm:w-auto"
                    hidden={{ supplier: p.supplierCode, productId: p.productId, optionId: d.destino || "Europa", startDate: d.ida, endDate: d.volta, adults: params2.pax?.adults ?? 1, children: 0, seniors: d.seniores }}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
