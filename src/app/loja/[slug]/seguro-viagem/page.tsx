import { ShieldCheck } from "lucide-react";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { INSURANCE_REGIONS } from "@/server/suppliers/mock/single-page";
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
      <ListingHeader eyebrow="Seguro viagem" image="planeTakeoff" title="Viaje protegido." subtitle="Compare os planos e contrate em minutos. Obrigatório para a Europa.">
        <InsuranceSearch action={`/loja/${slug}/seguro-viagem`} d={d} regions={INSURANCE_REGIONS} minDate={minDate} />
      </ListingHeader>
      <div className="mx-auto max-w-[1100px] px-4 pb-8 pt-12 sm:px-8">
        <p className="mb-8 text-[15px] text-muted">
          {d.destino || "Europa"} · {date(d.ida)} a {date(d.volta)} · {days} dias · {travelers} viajante(s)
        </p>
        {results.length === 0 ? (
          <NoResults what="plano" />
        ) : (
          <div className="space-y-3">
            {results.map((p, i) => (
              <div key={`${p.supplierCode}-${p.productId}`} className={`grid gap-6 rounded-[2rem] p-6 sm:grid-cols-[1.3fr_1fr_auto] sm:items-center sm:p-8 ${i === 1 ? "bg-ink text-white" : "bg-surface"}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`h-5 w-5 ${i === 1 ? "text-accent" : "text-accent-ink"}`} />
                    {i === 1 && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg">Mais escolhido</span>}
                  </div>
                  <p className="mt-3 text-[1.75rem] font-semibold leading-none tracking-[-0.04em]">{p.title}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.tags.map((t) => (
                      <span key={t} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${i === 1 ? "bg-white/10" : "bg-white"}`}>
                        {t}
                      </span>
                    ))}
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${i === 1 ? "bg-white/10" : "bg-white"}`}>Assistência 24h em português</span>
                  </div>
                </div>
                <p className={`text-[15px] leading-relaxed ${i === 1 ? "text-white/70" : "text-muted"}`}>{p.subtitle}</p>
                <div className="flex flex-col gap-3 sm:items-end">
                  <PriceTag pix={p.price.pix} plan={p.price.plan} size="sm" note={`${travelers} viajante(s) · ${days} dias`} className="sm:text-right" invert={i === 1} />
                  <AddToCartForm
                    action={add}
                    label="Contratar"
                    buttonClassName={i === 1 ? "w-full sm:w-auto" : "w-full sm:w-auto"}
                    hidden={{ supplier: p.supplierCode, productId: p.productId, optionId: d.destino || "Europa", startDate: d.ida, endDate: d.volta, adults: params2.pax?.adults ?? 1, children: 0, seniors: d.seniores }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
