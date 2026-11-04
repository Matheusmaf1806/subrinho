import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { parseProductRef, productRef } from "@/server/suppliers/refs";
import { getProductDetail } from "@/server/catalog";
import { quoteDisplayPrice } from "@/server/pricing/cart-pricing";
import { getAdapter } from "@/server/suppliers/registry";
import { getStore, getStorePricing } from "../../_lib/store";
import { parseSearch, supplierParams, toQuery } from "../../_components/search-params";
import { BookingPanel, ProductHero } from "../../_components/product-hero";
import { TicketBooking } from "../../_components/ticket-booking";
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
  const { d, minDate } = parseSearch(await searchParams);
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "tickets")).catch(() => null);
  if (!p || p.category !== "TICKETS") notFound();

  const adapter = getAdapter(supplier);
  const childRule = p.paxRules.find((r) => r.type === "CHILD");
  const options = await Promise.all(
    p.options.map(async (o) => {
      let childPix: number | null = null;
      try {
        // o fornecedor já informa o custo infantil da opção; senão, cota 1 criança
        const lines = o.childLines !== undefined ? o.childLines : (await adapter.quote({ productId, optionId: o.optionId, date: d.data, pax: { adults: 0, children: 1 } })).lines;
        childPix = lines?.length ? Number(quoteDisplayPrice(ctx, { ...p, optionId: o.optionId }, o.currency, lines).pix.toString()) : null;
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
      };
    }),
  );

  return (
    <main className="mx-auto grid max-w-[1440px] gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_440px] xl:gap-16">
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
    </main>
  );
}
