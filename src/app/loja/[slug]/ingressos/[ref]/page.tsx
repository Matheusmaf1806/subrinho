import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { parseProductRef, productRef } from "@/server/suppliers/refs";
import { getProductDetail } from "@/server/catalog";
import { quoteDisplayPrice } from "@/server/pricing/cart-pricing";
import { getAdapter } from "@/server/suppliers/registry";
import { getStore, getStorePricing } from "../../_lib/store";
import { storeInsight } from "../../_lib/insight";
import { parseSearch, supplierParams, toQuery } from "../../_components/search-params";
import { BookingPanel, ProductHero } from "../../_components/product-hero";
import { TicketBooking } from "../../_components/ticket-booking";
import { RelatedProducts } from "../../_components/related";
import { addToCartAction } from "../../actions";

// Consulta o produto e os horários da data no fornecedor.
export const maxDuration = 60;

export default async function TicketDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; ref: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug, ref } = await params;
  const target = parseProductRef(ref);
  if (!target) notFound();
  const { supplierCode: supplier, productId } = target;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const reveal = await storeInsight(store.id);
  const { d, minDate } = parseSearch(await searchParams);
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "tickets"), { reveal }).catch(() => null);
  if (!p || p.category !== "TICKETS") notFound();

  const adapter = getAdapter(supplier);
  const childRule = p.paxRules.find((r) => r.type === "CHILD");
  const options = await Promise.all(
    p.options.map(async (o) => {
      let childPix: number | null = null;
      let childCommission: number | null = null;
      try {
        // o fornecedor já informa o custo infantil da opção; senão, cota 1 criança
        const lines = o.childLines !== undefined ? o.childLines : (await adapter.quote({ productId, optionId: o.optionId, date: d.data, pax: { adults: 0, children: 1 } })).lines;
        const child = lines?.length ? quoteDisplayPrice(ctx, { ...p, optionId: o.optionId }, o.currency, lines, null, { commission: reveal.commission }) : null;
        childPix = child ? Number(child.pix.toString()) : null;
        childCommission = child?.commission ? Number(child.commission.amount.toString()) : null;
      } catch {
        childPix = null;
      }
      return {
        optionId: o.optionId,
        title: o.title,
        description: o.description,
        adultPix: o.price ? Number(o.price.pix.toString()) : 0,
        childPix,
        available: o.available && !!o.price,
        // só para quem pode ver (o componente roda no navegador: sem permissão, nem vai na página)
        ...(o.revealSupplier ? { supplier: o.revealSupplier } : {}),
        ...(o.price?.commission ? { adultCommission: Number(o.price.commission.amount.toString()), childCommission, commissionPct: Number(o.price.commission.pct.toString()) } : {}),
      };
    }),
  );

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_440px] xl:gap-16">
      <ProductHero p={p} back={{ href: `/loja/${slug}/ingressos?${toQuery({ destino: d.destino, data: d.data, adultos: d.adultos, criancas: d.criancas })}`, label: "Voltar para ingressos" }} />
      <BookingPanel title="Escolha seus ingressos">
          <TicketBooking
            action={addToCartAction.bind(null, slug)}
            productRef={productRef(supplier, productId)}
            options={options}
            childLabel={childRule?.label ?? "Criança"}
            defaultDate={d.data}
            minDate={minDate}
            defaultAdults={d.adultos}
            defaultChildren={d.criancas}
          />
      </BookingPanel>
      </div>
      <div className="mt-16">
        <RelatedProducts
          ctx={ctx}
          reveal={reveal}
          category="TICKETS"
          params={supplierParams({ ...d, destino: d.destino || p.destination }, "tickets")}
          current={{ supplierCode: supplier, productId, groupKey: p.groupKey, pix: p.price ? Number(p.price.pix.toString()) : null }}
          hrefBase={`/loja/${slug}/ingressos`}
          query={toQuery({ destino: d.destino || p.destination, data: d.data, adultos: d.adultos, criancas: d.criancas })}
          title={`Mais experiências em ${p.destination || "destino"}`}
          note="adulto"
        />
      </div>
    </main>
  );
}
