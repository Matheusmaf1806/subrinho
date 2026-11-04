import { notFound } from "next/navigation";
import { BadgeCheck, Info } from "lucide-react";
import { db } from "@/server/db";
import { getProductDetail } from "@/server/catalog";
import { Badge } from "@/components/ui";
import { brl, date, paxSummary } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../../../_lib/store";
import { lodgingQuery, parseSearch, supplierParams } from "../../../_components/search-params";
import { ProductHero } from "../../../_components/product-hero";
import { LodgingSearch } from "../../../_components/search-forms";
import { MobileSearchToggle } from "../../../_components/search-toggle";
import { AddToCartForm } from "../../../_components/add-to-cart";
import { PriceTag } from "../../../_components/price-tag";
import { addToCartAction } from "../../../actions";

// Consulta disponibilidade + conteúdo do hotel no fornecedor; "Reservar" cota de novo (preço final).
export const maxDuration = 60;

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
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "lodging")).catch((e) => {
    console.error(`[hotel] ${supplier}/${productId}:`, e);
    return null;
  });
  if (!p || p.category !== "LODGING") notFound();
  const nights = daysBetween(d.checkin, d.checkout);
  const add = addToCartAction.bind(null, slug);
  const base = `/loja/${slug}/hospedagem`;
  const pax = paxSummary({ rooms: d.quartos, adults: d.adultos, children: d.criancas });
  const ages = d.criancas ? d.idades.slice(0, d.criancas) : [];
  const cheapest = p.options
    .filter((o) => o.available && o.price)
    .reduce<(typeof p.options)[number] | null>((min, o) => (!min || o.price!.pix.lt(min.price!.pix) ? o : min), null);

  return (
    <main className="mx-auto max-w-[1440px] space-y-14 px-4 py-8 sm:px-8">
      <ProductHero
        p={p}
        back={{ href: `${base}?${lodgingQuery(d)}`, label: "Voltar para hotéis" }}
        cta={
          p.options.length
            ? {
                href: "#quartos",
                label: `Ver ${p.options.length} opç${p.options.length > 1 ? "ões" : "ão"} de quarto`,
                note: cheapest?.price ? `a partir de ${brl(cheapest.price.pix)} no Pix · ${nights} noite${nights > 1 ? "s" : ""}` : undefined,
              }
            : undefined
        }
      />
      <section id="quartos" className="scroll-mt-28">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.045em]">Quartos disponíveis</h2>
            <p className="mt-3 text-[15px] text-muted">
              {date(d.checkin)} a {date(d.checkout)} · {nights} noite{nights > 1 ? "s" : ""} · {pax}
              {ages.length ? ` (${ages.map((a) => (a === 0 ? "< 1 ano" : `${a} ano${a > 1 ? "s" : ""}`)).join(", ")})` : ""}
            </p>
          </div>
        </div>
        <div className="mb-6">
          <MobileSearchToggle summary="Alterar datas ou hóspedes" detail={`${date(d.checkin)} a ${date(d.checkout)} · ${pax}`}>
            <LodgingSearch action={`${base}/${supplier}/${productId}`} d={{ ...d, destino: d.destino || p.destination }} destinations={[p.destination]} minDate={minDate} />
          </MobileSearchToggle>
        </div>
        {p.options.length === 0 ? (
          <div className="rounded-[2rem] bg-surface p-8 text-center">
            <p className="text-xl font-semibold tracking-[-0.03em] text-ink">Sem quartos disponíveis para estas datas e hóspedes.</p>
            <p className="mt-2 text-[15px] text-muted">Altere as datas ou a quantidade de hóspedes acima.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {p.options.map((o) => {
              const free = o.attributes?.find((a) => a.label === "Cancelamento");
              return (
                <li key={`${o.supplierCode}-${o.optionId}`} className="grid gap-5 rounded-[2rem] bg-surface p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
                  <div className="min-w-0">
                    <p className="text-xl font-semibold tracking-[-0.03em] text-ink">{o.title}</p>
                    {o.description && <p className="mt-1 text-[15px] text-muted">{o.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {free && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${o.freeCancellationUntil ? "bg-emerald-100 text-emerald-800" : "bg-white text-ink"}`}>
                          {o.freeCancellationUntil && <BadgeCheck className="h-3.5 w-3.5" />}
                          {free.value}
                        </span>
                      )}
                      {o.attributes
                        ?.filter((a) => a.label !== "Cancelamento" && a.label !== "Regime")
                        .map((a) => (
                          <span key={a.label} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink">
                            {a.label}: {a.value}
                          </span>
                        ))}
                      {!o.available && <Badge tone="danger">Não comporta esta ocupação</Badge>}
                    </div>
                    {o.notes && o.notes.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {o.notes.map((n) => (
                          <li key={n} className="flex items-start gap-1.5 text-[13px] text-ink/75">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /> {n}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col items-stretch gap-3 sm:items-end">
                    {o.price && (
                      <PriceTag
                        pix={o.price.pix}
                        plan={o.price.plan}
                        size="sm"
                        note={`total da estadia · ${nights} noite${nights > 1 ? "s" : ""}${nights > 1 ? ` · ≈ ${brl(Number(o.price.pix.div(nights).toFixed(0)))}/noite` : ""}`}
                        className="sm:text-right"
                      />
                    )}
                    {o.available && o.price && (
                      <AddToCartForm
                        action={add}
                        label="Reservar"
                        buttonClassName="w-full sm:w-auto"
                        hidden={{
                          supplier: o.supplierCode,
                          productId: o.productId,
                          optionId: o.optionId,
                          checkIn: d.checkin,
                          checkOut: d.checkout,
                          rooms: d.quartos,
                          adults: Math.max(1, d.adultos),
                          children: d.criancas,
                          childrenAges: ages.join(","),
                        }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-[13px] text-muted">Preços para a estadia completa. Ao reservar, consultamos o fornecedor de novo para garantir o valor final.</p>
      </section>
    </main>
  );
}
