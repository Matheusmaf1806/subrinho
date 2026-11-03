import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getProductDetail } from "@/server/catalog";
import { Alert, Input } from "@/components/ui";
import { date } from "@/lib/format";
import { addDays, daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../../../_lib/store";
import { parseSearch, supplierParams, toQuery } from "../../../_components/search-params";
import { BookingPanel, ProductHero } from "../../../_components/product-hero";
import { AddToCartForm } from "../../../_components/add-to-cart";
import { PaxStepper } from "../../../_components/pax-stepper";
import { PriceTag } from "../../../_components/price-tag";
import { addToCartAction } from "../../../actions";

export default async function HouseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; supplier: string; productId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug, supplier, productId } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const sp = await searchParams;
  const parsed = parseSearch(sp);
  const d = { ...parsed.d, checkout: sp.checkout ? parsed.d.checkout : addDays(parsed.d.checkin, 7) };
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "houses")).catch(() => null);
  if (!p || p.category !== "HOUSES") notFound();
  const o = p.options[0];
  const nights = daysBetween(d.checkin, d.checkout);
  const adultRule = p.paxRules.find((r) => r.type === "ADULT");
  const childRule = p.paxRules.find((r) => r.type === "CHILD");
  const self = `/loja/${slug}/casas/${supplier}/${productId}`;

  return (
    <main className="mx-auto grid max-w-[1440px] gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_440px] xl:gap-16">
      <ProductHero p={p} back={{ href: `/loja/${slug}/casas?${toQuery({ checkin: d.checkin, checkout: d.checkout, adultos: d.adultos, criancas: d.criancas })}`, label: "Voltar para casas" }} />
      <BookingPanel title="Reserve a casa">
        <div className="space-y-5">
          <form action={self} className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Check-in
              <Input type="date" name="checkin" defaultValue={d.checkin} min={parsed.minDate} className="mt-1" />
            </label>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Check-out
              <Input type="date" name="checkout" defaultValue={d.checkout} min={parsed.minDate} className="mt-1" />
            </label>
            <input type="hidden" name="adultos" value={d.adultos} />
            <input type="hidden" name="criancas" value={d.criancas} />
            <button className="col-span-2 h-10 rounded-full bg-surface text-[13px] font-semibold text-ink hover:bg-surface-2">Atualizar datas</button>
          </form>
          {o.price && <PriceTag pix={o.price.pix} plan={o.price.plan} note={`${date(d.checkin)} a ${date(d.checkout)} · ${nights} noites · taxa de limpeza inclusa`} />}
          {!o.available && <Alert tone="warning">{o.attributes?.find((a) => a.label === "Estadia mínima")?.value ? `Estadia mínima de ${o.attributes.find((a) => a.label === "Estadia mínima")!.value}.` : "Indisponível para esta busca."}</Alert>}
          <AddToCartForm action={addToCartAction.bind(null, slug)} label="Reservar casa" hidden={{ supplier, productId, optionId: o.optionId, checkIn: d.checkin, checkOut: d.checkout }}>
            <div className="rounded-2xl bg-surface px-4 py-1 [&_button]:bg-white">
              <PaxStepper name="adults" label="Adultos" min={1} max={adultRule?.max ?? 12} defaultValue={Math.max(1, d.adultos)} />
              <PaxStepper name="children" label="Crianças" min={0} max={childRule?.max ?? 10} defaultValue={d.criancas} />
            </div>
          </AddToCartForm>
        </div>
      </BookingPanel>
    </main>
  );
}
