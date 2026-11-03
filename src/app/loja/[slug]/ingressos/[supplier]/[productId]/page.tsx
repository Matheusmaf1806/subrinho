import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getProductDetail } from "@/server/catalog";
import { quoteDisplayPrice } from "@/server/pricing/cart-pricing";
import { getAdapter } from "@/server/suppliers/registry";
import { Card } from "@/components/ui";
import { getStore, getStorePricing } from "../../../_lib/store";
import { parseSearch, supplierParams, toQuery } from "../../../_components/search-params";
import { ProductHero } from "../../../_components/product-hero";
import { TicketBooking } from "../../../_components/ticket-booking";
import { addToCartAction } from "../../../actions";

export default async function TicketDetail({
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
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "tickets")).catch(() => null);
  if (!p || p.category !== "TICKETS") notFound();

  const adapter = getAdapter(supplier);
  const childRule = p.paxRules.find((r) => r.type === "CHILD");
  const options = await Promise.all(
    p.options.map(async (o) => {
      let childPix: number | null = null;
      try {
        const q = await adapter.quote({ productId, optionId: o.optionId, date: d.data, pax: { adults: 0, children: 1 } });
        childPix = Number(quoteDisplayPrice(ctx, { ...p, optionId: o.optionId }, q.currency, q.lines).pix.toString());
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
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px]">
      <ProductHero p={p} back={{ href: `/loja/${slug}/ingressos?${toQuery({ data: d.data, adultos: d.adultos, criancas: d.criancas })}`, label: "Voltar para ingressos" }} />
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-black text-ink">Escolha seus ingressos</h2>
          <TicketBooking
            action={addToCartAction.bind(null, slug)}
            supplier={supplier}
            productId={productId}
            options={options}
            childLabel={childRule?.label ?? "Criança"}
            defaultDate={d.data}
            minDate={minDate}
            defaultAdults={d.adultos}
            defaultChildren={d.criancas}
          />
        </Card>
      </aside>
    </main>
  );
}
