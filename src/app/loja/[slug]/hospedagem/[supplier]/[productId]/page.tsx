import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getProductDetail } from "@/server/catalog";
import { Badge, Card, CardHeader } from "@/components/ui";
import { date, paxSummary } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../../../_lib/store";
import { parseSearch, supplierParams, toQuery } from "../../../_components/search-params";
import { ProductHero } from "../../../_components/product-hero";
import { LodgingSearch } from "../../../_components/search-forms";
import { AddToCartForm } from "../../../_components/add-to-cart";
import { PriceTag } from "../../../_components/price-tag";
import { addToCartAction } from "../../../actions";

export default async function HotelDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; supplier: string; productId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug, supplier, productId } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const { d, minDate } = parseSearch(await searchParams);
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "lodging")).catch(() => null);
  if (!p || p.category !== "LODGING") notFound();
  const nights = daysBetween(d.checkin, d.checkout);
  const add = addToCartAction.bind(null, slug);
  const base = `/loja/${slug}/hospedagem`;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <ProductHero p={p} back={{ href: `${base}?${toQuery({ destino: p.destination, checkin: d.checkin, checkout: d.checkout, quartos: d.quartos, adultos: d.adultos, criancas: d.criancas })}`, label: "Voltar para hotéis" }} />
      <Card>
        <CardHeader
          title="Quartos disponíveis"
          subtitle={`${date(d.checkin)} a ${date(d.checkout)} · ${nights} noite${nights > 1 ? "s" : ""} · ${paxSummary({ rooms: d.quartos, adults: d.adultos, children: d.criancas })}`}
        />
        <div className="border-b border-line bg-cream/50 p-3">
          <LodgingSearch action={`${base}/${supplier}/${productId}`} d={{ ...d, destino: p.destination }} destinations={[p.destination]} minDate={minDate} className="bg-transparent p-0" />
        </div>
        <ul className="divide-y divide-line">
          {p.options.map((o) => (
            <li key={`${o.supplierCode}-${o.optionId}`} className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-extrabold text-ink">{o.title}</p>
                {o.description && <p className="text-sm text-muted">{o.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.attributes?.map((a) => (
                    <Badge key={a.label} tone={a.value.startsWith("Grátis") ? "success" : "neutral"}>
                      {a.label}: {a.value}
                    </Badge>
                  ))}
                  {!o.available && <Badge tone="danger">Não comporta esta ocupação</Badge>}
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                {o.price && <PriceTag pix={o.price.pix} plan={o.price.plan} size="sm" note="total da estadia, taxas inclusas" className="sm:text-right" />}
                {o.available && o.price && (
                  <AddToCartForm
                    action={add}
                    label="Reservar"
                    buttonClassName="w-full sm:w-auto"
                    hidden={{ supplier: o.supplierCode, productId: o.productId, optionId: o.optionId, checkIn: d.checkin, checkOut: d.checkout, rooms: d.quartos, adults: Math.max(1, d.adultos), children: d.criancas }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
