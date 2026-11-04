import { notFound } from "next/navigation";
import { BadgeCheck, CalendarX2, Info } from "lucide-react";
import { db } from "@/server/db";
import { parseProductRef, productRef } from "@/server/suppliers/refs";
import { getProductDetail } from "@/server/catalog";
import { Input } from "@/components/ui";
import { brl, date } from "@/lib/format";
import { addDays, daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../../_lib/store";
import { parseSearch, supplierParams, toQuery } from "../../_components/search-params";
import { BookingPanel, ProductHero } from "../../_components/product-hero";
import { AddToCartForm } from "../../_components/add-to-cart";
import { PaxStepper } from "../../_components/pax-stepper";
import { PriceTag } from "../../_components/price-tag";
import { addToCartAction } from "../../actions";

// Consulta o conteúdo da casa e a cotação das datas na administradora; "Reservar" cota de novo.
export const maxDuration = 60;

export default async function HouseDetail({
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
  const sp = await searchParams;
  const parsed = parseSearch(sp);
  const d = { ...parsed.d, checkout: sp.checkout ? parsed.d.checkout : addDays(parsed.d.checkin, 7) };
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "houses")).catch((e) => {
    console.error(`[casa] ${supplier}/${productId}:`, e);
    return null;
  });
  if (!p || p.category !== "HOUSES") notFound();
  const o = p.options[0];
  const nights = daysBetween(d.checkin, d.checkout);
  const adultRule = p.paxRules.find((r) => r.type === "ADULT");
  const childRule = p.paxRules.find((r) => r.type === "CHILD");
  const self = `/loja/${slug}/casas/${ref}`;
  const cancel = o?.attributes?.find((a) => a.label === "Cancelamento");
  const capacity = adultRule?.max ?? 0;
  const guests = d.adultos + d.criancas;
  const tooMany = capacity > 0 && guests > capacity;
  const available = !!o?.available && !!o.price;
  const reason = !o?.available && !tooMany ? (o?.notes?.[0] ?? "A casa não está disponível para estas datas.") : null;

  return (
    <main className="mx-auto grid max-w-[1440px] gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_440px] xl:gap-16">
      <ProductHero
        p={p}
        back={{ href: `/loja/${slug}/casas?${toQuery({ destino: d.destino, checkin: d.checkin, checkout: d.checkout, adultos: d.adultos, criancas: d.criancas })}`, label: "Voltar para casas" }}
        cta={{
          href: "#reservar",
          mobileOnly: true, // no computador o painel de reserva já fica ao lado
          label: available ? "Ver preço e reservar" : "Ver disponibilidade",
          note: available && o.price ? `${brl(o.price.pix)} no Pix · ${nights} noite${nights > 1 ? "s" : ""} · taxas inclusas` : undefined,
        }}
      />
      <BookingPanel title="Reserve a casa" id="reservar">
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
            {d.destino && <input type="hidden" name="destino" value={d.destino} />}
            <button className="col-span-2 h-10 rounded-full bg-surface text-[13px] font-semibold text-ink hover:bg-surface-2">Atualizar datas</button>
          </form>

          {available && o.price ? (
            <PriceTag
              pix={o.price.pix}
              plan={o.price.plan}
              note={`${date(d.checkin)} a ${date(d.checkout)} · ${nights} noite${nights > 1 ? "s" : ""}${nights > 1 ? ` · ≈ ${brl(Number(o.price.pix.div(nights).toFixed(0)))}/noite` : ""} · taxas e impostos inclusos`}
            />
          ) : tooMany ? (
            <div className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 text-sm text-amber-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Esta casa acomoda até <strong>{capacity} hóspedes</strong> e a busca tem {guests}. Ajuste os hóspedes abaixo ou escolha uma casa maior.
              </p>
            </div>
          ) : (
            <div className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 text-sm text-amber-950">
              <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{reason}</p>
            </div>
          )}

          {available && (
            <div className="space-y-2">
              {cancel && (
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${o.freeCancellationUntil ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                  {o.freeCancellationUntil && <BadgeCheck className="h-3.5 w-3.5" />}
                  {cancel.value}
                </span>
              )}
              {o.notes && o.notes.length > 0 && (
                <ul className="space-y-1">
                  {o.notes.map((n) => (
                    <li key={n} className="flex items-start gap-1.5 text-[13px] text-ink/75">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /> {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {o && (available || tooMany) && (
            <AddToCartForm action={addToCartAction.bind(null, slug)} label="Reservar casa" hidden={{ ref: productRef(supplier, productId), optionId: o.optionId, checkIn: d.checkin, checkOut: d.checkout }}>
              <div className="rounded-2xl bg-surface px-4 py-1 [&_button]:bg-white">
                <PaxStepper name="adults" label="Adultos" min={1} max={adultRule?.max ?? 12} defaultValue={Math.min(Math.max(1, d.adultos), adultRule?.max ?? 12)} />
                <PaxStepper name="children" label="Crianças" hint={childRule?.hint} min={0} max={childRule?.max ?? 10} defaultValue={Math.min(d.criancas, childRule?.max ?? 10)} />
              </div>
              {capacity > 0 && <p className="mt-2 text-[12px] text-muted">Capacidade máxima: {capacity} hóspedes, contando adultos e crianças.</p>}
            </AddToCartForm>
          )}
          <p className="text-[12px] text-muted">Ao reservar, consultamos a administradora de novo para garantir disponibilidade e o valor final.</p>
        </div>
      </BookingPanel>
    </main>
  );
}
