import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { productRef } from "@/server/suppliers/refs";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { INSURANCE_REGIONS } from "@/server/suppliers/mock/single-page";
import { ArrowChip, cn } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";
import { getStore, getStorePricing, storeBrand } from "./_lib/store";
import { COMING_SOON } from "./_components/category";
import { storeCategories } from "./_lib/categories";
import { ChipSearch, InsuranceSearch, LodgingSearch, TicketsSearch } from "./_components/search-forms";
import { StoreHero } from "./_components/store-hero";
import type { Category } from "@/server/db/schema";
import { paymentProvider } from "@/server/payments/provider";
import { getSettings } from "@/server/settings";
import { CreditCard, MessageCircle, Plane, Search, ShoppingBag, Ticket } from "lucide-react";
import { RubberStamp, SectionTitle } from "./_components/journal";
import { parseSearch, supplierParams, toQuery } from "./_components/search-params";
import { ProductCard } from "./_components/product-card";

const CATEGORY_TILE: Record<string, { image: PhotoKey; line: string }> = {
  ingressos: { image: "colosseumAerial", line: "Parques, museus e passeios com data marcada" },
  hospedagem: { image: "tropicalResort", line: "O melhor preço entre vários fornecedores" },
  casas: { image: "villaPool", line: "Casas com piscina perto dos parques" },
  "seguro-viagem": { image: "planeWing", line: "Planos para o mundo todo" },
  chip: { image: "phone", line: "eSIM com ativação imediata" },
};

const DESTINATIONS: { name: string; image: PhotoKey; country: string }[] = [
  { name: "Roma", image: "colosseum", country: "Itália" },
  { name: "Orlando", image: "castle2", country: "Estados Unidos" },
  { name: "Paris", image: "eiffel", country: "França" },
  { name: "Lisboa", image: "lisbon", country: "Portugal" },
  { name: "Nova York", image: "nycSkyline", country: "Estados Unidos" },
  { name: "Florença", image: "florence", country: "Itália" },
];

const OFFER: Partial<Record<Category, string>> = { TICKETS: "ingressos", LODGING: "hotéis", HOUSES: "casas de temporada", INSURANCE: "seguro viagem", CHIP: "chip internacional" };

/** "Ingressos, hotéis e casas de temporada no mesmo carrinho…" — só o que a loja vende (descrição da página). */
function defaultSubtitle(name: string, live: Category[]) {
  const items = live.map((c) => OFFER[c]).filter((x): x is string => !!x);
  const list = items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}` : (items[0] ?? "Sua viagem");
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} no mesmo carrinho, com preço confirmado na hora e o atendimento da ${name}.`;
}

/** Como a compra funciona (o que de fato acontece). */
function STEPS(max: number, pix: boolean) {
  return [
    { icon: Search, title: "Busque", text: "Ingressos, hotéis e casas em um só lugar, com preço em reais." },
    { icon: ShoppingBag, title: "Monte o carrinho", text: "Junte tudo da viagem. O preço é confirmado com cada fornecedor na hora." },
    { icon: CreditCard, title: "Pague do seu jeito", text: `Em até ${max}x sem juros no cartão${pix ? " ou com desconto no Pix" : ""}.` },
    { icon: Ticket, title: "Receba o voucher", text: "Reserva emitida e voucher na sua conta, prontos para a viagem." },
  ];
}

/** Descrição da página inicial (Google e link compartilhado): o subtítulo da agência ou um resumo do que a loja vende. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await getStore((await params).slug);
  const cats = await storeCategories();
  const description = store.heroSubtitle?.trim() || defaultSubtitle(store.name, cats.live.map((c) => c.category));
  // o openGraph da página substitui o do layout inteiro: repete título e foto
  return { description, openGraph: { title: store.name, description, images: [storeBrand(store).heroImage] } };
}

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const base = `/loja/${store.slug}`;
  const brand = storeBrand(store);
  const { d, minDate } = parseSearch({});
  const dest = (cat: Parameters<typeof adaptersFor>[0]) => [...new Set(adaptersFor(cat).flatMap((a) => a.destinations().map((x) => x.name)))];

  const cats = await storeCategories();
  const live = new Set(cats.live.map((c) => c.category));
  const [tickets, hotels] = await Promise.all([
    live.has("TICKETS") ? searchCatalog(db, ctx, "TICKETS", supplierParams(d, "tickets")) : Promise.resolve([]),
    live.has("LODGING") ? searchCatalog(db, ctx, "LODGING", supplierParams(d, "lodging")) : Promise.resolve([]),
  ]);

  const pixAvailable = paymentProvider().pixAvailable;
  const settings = await getSettings(db);

  // destinos (polaroides): levam à busca de ingressos (ou de hotéis, se a loja não vende ingressos)
  const destSlug = live.has("TICKETS") ? "ingressos" : live.has("LODGING") ? "hospedagem" : null;

  const tabs = cats.live.map((c) => {
    const Icon = c.icon;
    const action = `${base}/${c.slug}`;
    const content =
      c.category === "TICKETS" ? (
        <TicketsSearch action={action} d={d} destinations={dest("TICKETS")} minDate={minDate} />
      ) : c.category === "LODGING" ? (
        <LodgingSearch action={action} d={d} destinations={dest("LODGING")} minDate={minDate} />
      ) : c.category === "HOUSES" ? (
        <LodgingSearch action={action} d={d} destinations={dest("HOUSES")} minDate={minDate} houses />
      ) : c.category === "INSURANCE" ? (
        <InsuranceSearch action={action} d={d} regions={INSURANCE_REGIONS} minDate={minDate} />
      ) : (
        <ChipSearch action={action} d={d} destinations={dest("CHIP")} />
      );
    return { key: c.slug, label: c.short, icon: <Icon className="h-4 w-4" />, content };
  });

  return (
    <main>
      {/* ───────── Topo: banner de fotos + busca ───────── */}
      <StoreHero name={store.name} lines={brand.heroLines} tabs={tabs} pixAvailable={pixAvailable} maxInstallments={settings.maxInstallments} />

      {/* ───────── Categorias (bento) ───────── */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 sm:px-8">
        <SectionTitle eyebrow="Monte a viagem" title="Tudo para a viagem, em um só carrinho." mark="um só carrinho." />
        <div className={cn("grid auto-rows-[220px] grid-cols-2 gap-3 lg:auto-rows-[260px]", cats.live.length >= 3 ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
          {cats.live.map((c, i) => {
            const t = CATEGORY_TILE[c.slug];
            const Icon = c.icon;
            const big = i === 0 || cats.live.length < 3;
            // poucas categorias: blocos largos; 3+: o primeiro grande (bento)
            const span = cats.live.length === 1 ? "col-span-2 lg:col-span-2" : cats.live.length === 2 ? "col-span-2 sm:col-span-1" : i === 0 ? "col-span-2 row-span-2" : "";
            return (
              <Link
                key={c.slug}
                href={`${base}/${c.slug}`}
                data-reveal
                style={{ "--i": i } as React.CSSProperties}
                className={cn("group relative isolate overflow-hidden rounded-[2rem] bg-ink text-white shadow-[0_30px_60px_-40px_rgba(0,0,0,0.6)]", span)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo(t.image, big ? 1400 : 800)} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover transition duration-[1.2s] ease-out group-hover:scale-110" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/15 to-transparent transition group-hover:from-black/85" />
                <div className="grain absolute inset-0 -z-10 opacity-30 mix-blend-overlay" aria-hidden />
                {big && (
                  <span className="absolute left-4 top-4 inline-flex -rotate-2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-ink shadow-md transition group-hover:rotate-0">
                    <Icon className="h-3.5 w-3.5 text-accent-ink" aria-hidden /> {i === 0 ? "Mais procurado" : c.short}
                  </span>
                )}
                <ArrowChip tone="light" className="absolute right-4 top-4 transition duration-300 group-hover:-rotate-45 group-hover:bg-accent group-hover:text-accent-fg" />
                <div className="absolute inset-x-0 bottom-0 p-5 transition duration-300 group-hover:-translate-y-1 sm:p-7">
                  <p className={cn("font-semibold leading-none tracking-[-0.04em]", big ? "text-[clamp(2.25rem,4vw,3.75rem)]" : "text-2xl sm:text-[1.75rem]")}>{c.short}</p>
                  <p className={cn("mt-2 text-white/80", big ? "text-base" : "hidden text-sm sm:block")}>{t.line}</p>
                  <span className={cn("mt-4 inline-flex translate-y-2 items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-semibold opacity-0 backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100", !big && "hidden sm:inline-flex")}>
                    Explorar <span aria-hidden>→</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2" data-reveal>
          <span className="mr-1 text-[13px] font-semibold text-muted">Em breve</span>
          {[...cats.soon.map((c) => ({ label: c.short, icon: c.icon })), ...COMING_SOON].map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-3.5 py-2 text-[13px] font-medium text-ink/60">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </span>
          ))}
        </div>
      </section>

      {/* ───────── Ingressos ───────── */}
      {tickets.length > 0 && (
        <section className="mx-auto mt-28 max-w-[1440px] px-4 sm:px-8">
          <SectionTitle eyebrow="Mais procurados" title="Ingressos e experiências" mark="experiências" href={`${base}/ingressos`} />
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {tickets.slice(0, 4).map((p, i) => (
              <div key={productRef(p.supplierCode, p.productId)} data-reveal style={{ "--i": i } as React.CSSProperties}>
                <ProductCard p={p} href={`${base}/ingressos/${productRef(p.supplierCode, p.productId)}`} note="adulto" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ───────── Como funciona ───────── */}
      <section className="relative mt-28 overflow-x-clip py-14">
        <div aria-hidden className="grid-paper grid-paper-ink pointer-events-none absolute inset-0 -z-10 [--fade-at:50%_45%]" />
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
          <SectionTitle eyebrow="Simples assim" title="Sua viagem em 4 passos." mark="4 passos." />
          <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS(settings.maxInstallments, pixAvailable).map((st, i) => (
              <li
                key={st.title}
                data-reveal
                style={{ "--i": i } as React.CSSProperties}
                className="relative rounded-[1.25rem] bg-white p-6 ring-1 ring-ink/10 transition duration-300 [--hs:var(--color-brand-200)] [--hx:8px] [--hy:8px] hard-shadow hover:-translate-x-0.5 hover:-translate-y-0.5 hover:[--hs:var(--color-accent)] sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="relative z-10 grid h-14 w-14 place-items-center rounded-xl bg-brand-50 text-accent-ink ring-1 ring-inset ring-brand-100">
                    <st.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="text-[3.5rem] font-semibold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1.5px_var(--color-line)]">0{i + 1}</span>
                </div>
                <p className="mt-6 text-xl font-semibold tracking-[-0.03em] text-ink">{st.title}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{st.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── Promo: cartão de embarque, polaroide e carimbo ───────── */}
      <section className="mx-auto mt-28 grid max-w-[1440px] gap-4 px-4 sm:px-8 lg:grid-cols-3">
        {/* cartão de embarque */}
        <div data-reveal className="ticket relative flex min-h-[400px] flex-col overflow-hidden rounded-[2rem] bg-ink text-white">
          <div className="grain pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay" aria-hidden />
          <div className="flex flex-1 flex-col justify-between p-8 sm:p-10">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
              <span>Cartão de embarque</span>
              <Plane className="h-4 w-4 text-accent" aria-hidden />
            </div>
            <p className="text-[clamp(6rem,11vw,9.5rem)] font-semibold leading-[0.8] tracking-[-0.07em]">
              {settings.maxInstallments}x<span className="text-accent">.</span>
            </p>
            <p className="text-2xl font-semibold leading-tight tracking-[-0.03em]">sem juros no cartão, em todos os produtos</p>
          </div>
          <div className="relative flex h-[92px] items-center border-t-2 border-dashed border-white/20 px-8 sm:px-10">
            <div className="flex w-full items-end justify-between gap-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                <p>Passageiro</p>
                <p className="mt-1 text-[15px] font-semibold normal-case tracking-normal text-white">Você e quem for junto</p>
              </div>
              <div className="h-10 w-28 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.85)_0_2px,transparent_2px_5px,rgba(255,255,255,0.85)_5px_6px,transparent_6px_9px)] opacity-80" aria-hidden />
            </div>
          </div>
        </div>

        {/* polaroide */}
        <div data-reveal style={{ "--i": 1 } as React.CSSProperties} className="relative flex min-h-[400px] items-center justify-center overflow-hidden rounded-[2rem] bg-brand-50 p-8">
          <div className="grid-paper pointer-events-none absolute inset-0" aria-hidden />
          <figure className="relative w-full max-w-[320px] -rotate-3 bg-white p-3.5 pb-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.5)] transition duration-500 hover:rotate-0">
            <span className="absolute -top-3 left-1/2 h-7 w-28 -translate-x-1/2 rotate-2 bg-brand-200/80 mix-blend-multiply" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo("airportBoard", 700, 560)} alt="" className="aspect-[5/4] w-full object-cover" loading="lazy" />
            <figcaption className="mt-4 px-1">
              <p className="text-[1.35rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">Gente de verdade cuidando da sua viagem.</p>
              <p className="mt-2 text-[13px] text-muted">— atendimento {store.name}</p>
            </figcaption>
          </figure>
        </div>

        {/* carimbo */}
        <div data-reveal style={{ "--i": 2 } as React.CSSProperties} className="relative flex min-h-[400px] flex-col justify-between overflow-hidden rounded-[2rem] bg-surface p-8 sm:p-10">
          <div className="grid-paper grid-paper-ink pointer-events-none absolute inset-0" aria-hidden />
          <p className="relative text-[15px] text-muted">{pixAvailable ? "No Pix" : "Antes de você pagar"}</p>
          <RubberStamp
            top={pixAvailable ? "Melhor preço" : "Antes de pagar"}
            main={pixAvailable ? "Pix" : "Conferido"}
            bottom={pixAvailable ? "na hora" : "com o fornecedor"}
            className="relative -rotate-6 self-center text-accent-ink opacity-90 mix-blend-multiply transition duration-500 hover:rotate-0"
          />
          <div className="relative">
            <p className="text-2xl font-semibold leading-tight tracking-[-0.03em]">{pixAvailable ? "O melhor preço da loja." : "Preço e disponibilidade confirmados."}</p>
            <p className="mt-2 text-[15px] text-muted">
              {pixAvailable ? "E ainda dá para usar cupom de desconto no carrinho." : "Conferimos tudo com cada fornecedor — e dá para usar cupom de desconto no carrinho."}
            </p>
          </div>
        </div>
      </section>

      {/* ───────── Hotéis (com API real, a vitrine precisa de destino: a seção some) ───────── */}
      {hotels.length > 0 && (
        <section className="mx-auto mt-28 max-w-[1440px] px-4 sm:px-8">
          <SectionTitle eyebrow="Onde ficar" title="Hotéis em destaque" mark="destaque" href={`${base}/hospedagem`} />
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {hotels.slice(0, 4).map((p, i) => (
              <div key={productRef(p.supplierCode, p.productId)} data-reveal style={{ "--i": i } as React.CSSProperties}>
                <ProductCard p={p} href={`${base}/hospedagem/${productRef(p.supplierCode, p.productId)}`} note="5 noites" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ───────── Destinos em polaroides ───────── */}
      {destSlug && (
        <section className="mx-auto mt-28 max-w-[1440px] px-4 sm:px-8">
          <SectionTitle eyebrow="Inspiração" title="Para onde vamos?" mark="vamos?" />
          <div className="no-scrollbar -mx-4 flex snap-x gap-6 overflow-x-auto px-4 py-6 sm:-mx-8 sm:px-8">
            {DESTINATIONS.map((x, i) => (
              <Link
                key={x.name}
                href={`${base}/${destSlug}?${toQuery({ destino: x.name })}`}
                data-reveal
                style={{ "--i": i } as React.CSSProperties}
                className={cn(
                  "group w-[236px] shrink-0 snap-start bg-white p-3 pb-4 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.04] transition duration-500 hover:-translate-y-2 hover:rotate-0 hover:shadow-[0_40px_70px_-30px_rgba(0,0,0,0.5)]",
                  ["-rotate-2", "rotate-[1.5deg]", "-rotate-1", "rotate-2", "-rotate-[1.5deg]", "rotate-1"][i % 6],
                )}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo(x.image, 600, 750)} alt={x.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
                  <div className="grain absolute inset-0 opacity-25 mix-blend-overlay" aria-hidden />
                </div>
                <div className="mt-3 flex items-end justify-between gap-2 px-1">
                  <div>
                    <p className="text-[1.4rem] font-semibold leading-none tracking-[-0.04em] text-ink">{x.name}</p>
                    <p className="mt-1 text-[12px] text-muted">{x.country}</p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink transition group-hover:bg-accent group-hover:text-accent-fg" aria-hidden>
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ───────── Fale com a agência ───────── */}
      {store.whatsapp && (
        <section className="mx-auto mt-24 max-w-[1440px] px-4 sm:px-8">
          <div data-reveal className="relative overflow-hidden rounded-[2.5rem] bg-ink px-8 py-12 text-white sm:px-14 sm:py-16">
            <div className="grid-paper grid-paper-light pointer-events-none absolute inset-0 [--fade-at:80%_40%]" aria-hidden />
            <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-accent opacity-25 blur-[90px]" aria-hidden />
            {/* fotos quadradas sobrepostas em leque */}
            <div className="pointer-events-none absolute right-12 top-1/2 hidden h-64 w-[380px] -translate-y-1/2 lg:block xl:right-20" aria-hidden>
              {(["vernazza", "colosseum", "eiffel"] as const).map((k, i) => (
                <div
                  key={k}
                  className={cn(
                    "absolute top-1/2 h-44 w-44 -translate-y-1/2 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.8)] transition duration-500",
                    ["left-0 -rotate-[8deg]", "left-[100px] z-10 rotate-[2deg] scale-110", "left-[205px] rotate-[9deg]"][i],
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo(k, 360, 360)} alt="" className="h-full w-full rounded-xl object-cover" loading="lazy" />
                </div>
              ))}
            </div>
            <div className="relative max-w-2xl">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/50">Atendimento {store.name}</p>
              <p className="mt-4 text-[clamp(2rem,4.2vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
                Quer ajuda para montar a viagem? <span className="text-accent">A gente monta junto.</span>
              </p>
              <a
                href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="shine mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-7 text-[15px] font-semibold text-accent-fg transition hover:brightness-110"
              >
                <MessageCircle className="h-5 w-5" aria-hidden /> Falar no WhatsApp
              </a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
