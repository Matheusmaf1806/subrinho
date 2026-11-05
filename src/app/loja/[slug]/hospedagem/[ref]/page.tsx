import { TrackEvent } from "../../_components/tracking";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, BedDouble, Coffee, Info, MapPin, Users } from "lucide-react";
import { db } from "@/server/db";
import { parseProductRef, productRef } from "@/server/suppliers/refs";
import { getProductDetail } from "@/server/catalog";
import type { HotelContent } from "@/server/suppliers/types";
import { EMPTY_HOTEL_CONTENT } from "@/server/suppliers/hotels/content";
import { Badge, cn } from "@/components/ui";
import { brl, date, paxSummary } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { getStore, getStorePricing, storeBase } from "../../_lib/store";
import { storeInsight } from "../../_lib/insight";
import { SupplierTag } from "../../_components/reveal";
import { RelatedProducts } from "../../_components/related";
import { CompleteTrip } from "../../_components/complete-trip";
import { explicitFrom, quickContext } from "../../_lib/quick";
import { lodgingQuery, parseSearch, supplierParams } from "../../_components/search-params";
import { LodgingSearch } from "../../_components/search-forms";
import { MobileSearchToggle } from "../../_components/search-toggle";
import { AddToCartForm } from "../../_components/add-to-cart";
import { PriceTag } from "../../_components/price-tag";
import { HotelGallery } from "../../_components/hotel/hotel-gallery";
import { RoomFilters } from "../../_components/hotel/room-filters";
import { RoomPhoto } from "../../_components/hotel/room-photo";
import { BookingSummary, HotelAmenities, HotelIssues, HotelLocation, HotelOverview, HotelPolicies, MobileBookingBar, SectionHeading } from "../../_components/hotel/hotel-sections";
import { addToCartAction } from "../../actions";

// Consulta disponibilidade + conteúdo do hotel no fornecedor; "Reservar" cota de novo (preço final).
export const maxDuration = 60;

/** Regime que inclui café da manhã (café, meia pensão, pensão completa, tudo incluído). */
const WITH_BREAKFAST = /caf[eé] da manh|meia pens|pens[aã]o completa|tudo inclu|all inclusive|breakfast|half board|full board/i;

export default async function HotelDetail({
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
  const sb = await storeBase(store);
  const ctx = await getStorePricing(store.id);
  const reveal = await storeInsight(store.id);
  const raw = await searchParams;
  const { d, minDate } = parseSearch(raw);
  const p = await getProductDetail(db, ctx, supplier, productId, supplierParams(d, "lodging"), { reveal }).catch((e) => {
    console.error(`[hotel] ${supplier}/${productId}:`, e);
    return null;
  });
  if (!p || p.category !== "LODGING") notFound();
  const quick = await quickContext(store, d, minDate, explicitFrom(raw));
  const nights = daysBetween(d.checkin, d.checkout);
  const add = addToCartAction.bind(null, slug);
  const base = `${sb}/hospedagem`;
  const pax = paxSummary({ rooms: d.quartos, adults: d.adultos, children: d.criancas });
  const ages = d.criancas ? d.idades.slice(0, d.criancas) : [];
  const available = p.options.filter((o) => o.available && o.price);
  const cheapest = available.reduce<(typeof p.options)[number] | null>((min, o) => (!min || o.price!.pix.lt(min.price!.pix) ? o : min), null);

  // conteúdo organizado do fornecedor; sem ele (fornecedor antigo), monta o básico com a descrição
  const h: HotelContent = p.hotel ?? {
    ...EMPTY_HOTEL_CONTENT,
    photos: (p.gallery ?? (p.imageUrl ? [p.imageUrl] : [])).map((url) => ({ url, tag: null })),
    about: p.description.split(/\n{2,}/).map((t) => ({ title: null, text: t.trim() })).filter((a) => a.text),
    amenities: p.highlights.length ? [{ group: "Serviços", items: p.highlights }] : [],
  };
  const allAmenities = [...h.amenities.flatMap((g) => g.items), ...h.roomAmenities];
  // fotos de quartos do hotel: usadas no cartão quando o fornecedor não liga foto ao tipo de quarto
  const hotelRoomPhotos = h.photos.filter((x) => x.tag === "Quartos").map((x) => x.url);

  // quartos: avisos repetidos em todas as opções aparecem uma vez só, acima da lista
  const board = (o: (typeof p.options)[number]) => o.attributes?.find((a) => a.label === "Regime")?.value ?? o.description ?? "";
  // avisos que se repetem em várias opções: uma vez só acima da lista; no cartão, só uma etiqueta curta
  const noteCount = new Map<string, number>();
  for (const o of p.options) for (const n of new Set(o.notes ?? [])) noteCount.set(n, (noteCount.get(n) ?? 0) + 1);
  const common = p.options.length > 1 ? [...noteCount.entries()].filter(([, c]) => c > 1).map(([n]) => n) : [];
  const noteChip = (n: string) => (/^pago direto no hotel/i.test(n) ? "Taxas pagas no hotel" : "Aviso importante");
  const withBreakfast = p.options.filter((o) => WITH_BREAKFAST.test(board(o))).length;
  const withFree = p.options.filter((o) => o.freeCancellationUntil).length;

  const nav = [
    { href: "#visao-geral", label: "Visão geral" },
    { href: "#quartos", label: `Quartos${p.options.length ? ` (${p.options.length})` : ""}` },
    ...(allAmenities.length ? [{ href: "#comodidades", label: "Comodidades" }] : []),
    ...(h.coordinates || h.nearby.length ? [{ href: "#localizacao", label: "Localização" }] : []),
    ...(h.policies.length || h.times.checkInFrom ? [{ href: "#politicas", label: "Políticas" }] : []),
  ];
  const fromPrice = cheapest?.price ?? null;
  // nome longo: título menor (não ocupa meia tela)
  const titleSize = p.title.length > 32 ? "text-[clamp(2rem,3.4vw,3.25rem)]" : "text-[clamp(2.3rem,4.6vw,4.25rem)]";

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-8 sm:px-8 lg:pb-16">
      <TrackEvent name="view_item" params={{ name: p.title, category: "Hospedagem", value: p.price ? Number(p.price.pix) : undefined }} />
      {/* ───────── Cabeçalho ───────── */}
      <Link href={`${base}?${lodgingQuery(d)}`} className="group inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] transition hover:ring-ink/20">
        <span className="transition group-hover:-translate-x-0.5">←</span> Voltar para hotéis
      </Link>
      <div className="mt-6 max-w-[1100px]">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
          {p.stars ? (
            <span className="font-semibold text-amber-500" aria-label={`${p.stars} estrelas`}>
              {"★".repeat(Math.floor(p.stars))}
              {p.stars % 1 ? "½" : ""}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" aria-hidden /> {p.location}
          </span>
          {(h.coordinates || h.nearby.length > 0) && (
            <a href="#localizacao" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
              Ver no mapa
            </a>
          )}
        </p>
        <h1 data-enter className={cn("display mt-3 text-balance text-ink", titleSize)}>
          {p.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {withBreakfast > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink">
              <Coffee className="h-4 w-4" aria-hidden /> Café da manhã em {withBreakfast === p.options.length ? "todas as opções" : `${withBreakfast} opç${withBreakfast > 1 ? "ões" : "ão"}`}
            </span>
          )}
          {withFree > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-800">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Cancelamento grátis disponível
            </span>
          )}
          {h.times.checkInFrom && (
            <span className="rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink">
              Check-in {h.times.checkInFrom}
              {h.times.checkOutUntil ? ` · Check-out ${h.times.checkOutUntil}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* ───────── Fotos ───────── */}
      <div className="mt-8">
        {h.photos.length ? (
          <HotelGallery photos={h.photos} title={p.title} />
        ) : (
          <div className="grid h-[220px] place-items-center rounded-[2rem] bg-surface text-[14px] font-semibold text-muted">O hotel ainda não enviou fotos.</div>
        )}
      </div>

      {/* ───────── Menu das seções ───────── */}
      <nav className="no-scrollbar sticky top-[var(--store-top,72px)] z-30 -mx-4 mt-8 flex gap-1 overflow-x-auto border-b border-line bg-white/90 px-4 backdrop-blur-xl sm:-mx-8 sm:px-8" aria-label="Seções do hotel">
        {nav.map((n) => (
          <a key={n.href} href={n.href} className="shrink-0 border-b-2 border-transparent px-3 py-4 text-[14px] font-semibold text-muted transition hover:border-ink/30 hover:text-ink">
            {n.label}
          </a>
        ))}
      </nav>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_370px] xl:gap-14">
        <div className="min-w-0 space-y-16">
        {/* ───────── Visão geral ───────── */}
        <section id="visao-geral" className="scroll-mt-[calc(var(--store-top,72px)+72px)]">
          <HotelOverview h={h} allAmenities={allAmenities} />
        </section>

        <HotelIssues h={h} />

        {/* ───────── Quartos ───────── */}
        <section id="quartos" className="scroll-mt-[calc(var(--store-top,72px)+72px)]">
          <SectionHeading eyebrow="Quartos" title="Escolha o seu quarto" />
          <p className="-mt-3 mb-5 text-[15px] text-muted">
            {date(d.checkin)} a {date(d.checkout)} · {nights} noite{nights > 1 ? "s" : ""} · {pax}
            {ages.length ? ` (${ages.map((a) => (a === 0 ? "< 1 ano" : `${a} ano${a > 1 ? "s" : ""}`)).join(", ")})` : ""}
          </p>
          <div id="alterar-busca" className="mb-6 scroll-mt-[calc(var(--store-top,72px)+72px)]">
            <MobileSearchToggle summary="Alterar datas ou hóspedes" detail={`${date(d.checkin)} a ${date(d.checkout)} · ${pax}`}>
              <LodgingSearch action={`${base}/${ref}`} d={{ ...d, destino: d.destino || p.destination }} destinations={[p.destination]} minDate={minDate} />
            </MobileSearchToggle>
          </div>
          {common.length > 0 && (
            <div id="avisos-quartos" className="mb-5 scroll-mt-[calc(var(--store-top,72px)+72px)] rounded-[1.25rem] bg-amber-50/70 p-4 ring-1 ring-inset ring-amber-200/70 sm:px-5">
              <p className="text-[13px] font-semibold text-ink">Avisos das opções</p>
              <ul className="mt-1.5 space-y-1">
                {common.map((n) => (
                  <li key={n} className="flex items-start gap-1.5 text-[13px] text-ink/75">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    <span>
                      {n}
                      <span className="ml-1 text-muted">({noteCount.get(n) === p.options.length ? "todas as opções" : `${noteCount.get(n)} de ${p.options.length} opções`})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.options.length === 0 ? (
            <div className="rounded-[2rem] bg-surface p-8 text-center">
              <p className="text-xl font-semibold tracking-[-0.03em] text-ink">Sem quartos disponíveis para estas datas e hóspedes.</p>
              <p className="mt-2 text-[15px] text-muted">Altere as datas ou a quantidade de hóspedes acima.</p>
            </div>
          ) : (
            <RoomFilters rooms={p.options.map((o) => ({ cafe: WITH_BREAKFAST.test(board(o)), gratis: !!o.freeCancellationUntil }))}>
              <ul className="space-y-3">
                {p.options.map((o) => {
                  const cancel = o.attributes?.find((a) => a.label === "Cancelamento");
                  const notes = (o.notes ?? []).filter((n) => !common.includes(n));
                  const shared = [...new Set((o.notes ?? []).filter((n) => common.includes(n)).map(noteChip))];
                  const own = o.room?.photos ?? [];
                  const photo = own[0] ?? (hotelRoomPhotos.length ? hotelRoomPhotos[p.options.indexOf(o) % hotelRoomPhotos.length] : undefined);
                  const breakfast = WITH_BREAKFAST.test(board(o));
                  return (
                    <li
                      key={`${o.productId}-${o.optionId}`}
                      data-room
                      data-cafe={breakfast ? "" : undefined}
                      data-gratis={o.freeCancellationUntil ? "" : undefined}
                      className={cn("grid overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-inset ring-black/[0.07]", photo ? "sm:grid-cols-[200px_minmax(0,1fr)_minmax(210px,auto)]" : "sm:grid-cols-[minmax(0,1fr)_minmax(210px,auto)]")}
                    >
                      {photo && <RoomPhoto src={photo} own={own.length > 0} count={own.length} urls={own} />}
                      <div className="min-w-0 p-5 sm:p-6">
                        <SupplierTag name={o.revealSupplier} className="mb-2" />
                        <p className="text-xl font-semibold tracking-[-0.03em] text-ink">{o.title}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink/75">
                          <span className="inline-flex items-center gap-1.5">
                            {breakfast ? <Coffee className="h-4 w-4 text-accent-ink" aria-hidden /> : <BedDouble className="h-4 w-4 text-muted" aria-hidden />} {board(o)}
                          </span>
                          {o.room?.maxPax ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="h-4 w-4 text-muted" aria-hidden /> até {o.room.maxPax} pessoa{o.room.maxPax > 1 ? "s" : ""} por quarto
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {cancel && (
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold", o.freeCancellationUntil ? "bg-emerald-100 text-emerald-800" : "bg-surface text-ink")}>
                              {o.freeCancellationUntil && <BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
                              {cancel.value}
                            </span>
                          )}
                          {o.attributes
                            ?.filter((a) => a.label !== "Cancelamento" && a.label !== "Regime")
                            .map((a) => (
                              <span key={a.label} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
                                {a.label}: {a.value}
                              </span>
                            ))}
                          {shared.map((c) => (
                            <a key={c} href="#avisos-quartos" className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                              <Info className="h-3.5 w-3.5" aria-hidden /> {c}
                            </a>
                          ))}
                          {!o.available && <Badge tone="danger">Não comporta esta ocupação</Badge>}
                        </div>
                        {o.room && o.room.amenities.length > 0 && (
                          <p className="mt-3 text-[13px] leading-relaxed text-muted">{o.room.amenities.slice(0, 8).join(" · ")}</p>
                        )}
                        {notes.length > 0 && (
                          <ul className="mt-3 space-y-1">
                            {notes.map((n) => (
                              <li key={n} className="flex items-start gap-1.5 text-[13px] text-ink/75">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> {n}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-col items-stretch justify-center gap-3 border-t border-line p-5 sm:items-end sm:border-l sm:border-t-0 sm:p-6">
                        {o.price && (
                          <PriceTag
                            pix={o.price.pix}
                            plan={o.price.plan}
                            size="sm"
                            commission={o.price.commission}
                            note={`total da estadia · ${nights} noite${nights > 1 ? "s" : ""}${nights > 1 ? ` · ≈ ${brl(Number(o.price.pix.div(nights).toFixed(0)))}/noite` : ""}`}
                            align="right"
                          />
                        )}
                        {o.available && o.price && (
                          <AddToCartForm
                            action={add}
                            label="Reservar"
                            buttonClassName="w-full sm:w-auto"
                            hidden={{
                              ref: productRef(o.supplierCode, o.productId),
                              optionId: o.optionId,
                              checkIn: d.checkin,
                              checkOut: d.checkout,
                              rooms: d.quartos,
                              adults: Math.max(1, d.adultos),
                              children: d.criancas,
                              childrenAges: ages.join(","),
                              destino: p.destination || d.destino,
                            }}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </RoomFilters>
          )}
          <p className="mt-6 text-[13px] text-muted">Preços para a estadia completa. Ao reservar, consultamos o fornecedor de novo para garantir o valor final.</p>
        </section>

        <HotelAmenities h={h} />
        <HotelLocation h={h} address={p.location} title={p.title} />
        <HotelPolicies h={h} />
        </div>

        {/* painel de reserva: acompanha a rolagem no computador */}
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--store-top,72px)+68px)]">
            <BookingSummary
              h={h}
              price={fromPrice}
              options={p.options.length}
              checkIn={d.checkin}
              checkOut={d.checkout}
              nights={nights}
              pax={pax}
              breakfast={withBreakfast}
              freeCancel={withFree}
            />
          </div>
        </aside>
      </div>

      <div className="mt-16">
        <CompleteTrip base={sb} from="stay" destination={p.destination || d.destino} d={d} minDate={minDate} ctx={ctx} reveal={reveal} quick={quick} />
      </div>
      <div className="mt-16">
        <RelatedProducts
          quick={quick}
          ctx={ctx}
          reveal={reveal}
          category="LODGING"
          params={supplierParams({ ...d, destino: d.destino || p.destination, dest: d.destino ? d.dest : "" }, "lodging")}
          current={{ supplierCode: supplier, productId, groupKey: p.groupKey, pix: fromPrice ? Number(fromPrice.pix.toString()) : null, stars: p.stars ?? null }}
          hrefBase={base}
          query={lodgingQuery({ ...d, destino: d.destino || p.destination })}
          title={`Outros hotéis em ${p.destination || "destino"}`}
          note={`${nights} noite${nights > 1 ? "s" : ""}`}
          nights={nights}
        />
      </div>
      <MobileBookingBar price={fromPrice} nights={nights} />
    </main>
  );
}
