import Link from "next/link";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { INSURANCE_REGIONS } from "@/server/suppliers/mock/single-page";
import { FlightPath } from "@/components/brand";
import { ArrowChip, ButtonLink, cn } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";
import { getStore, getStorePricing, storeBrand } from "./_lib/store";
import { COMING_SOON, STORE_CATEGORIES } from "./_components/category";
import { ChipSearch, InsuranceSearch, LodgingSearch, TicketsSearch } from "./_components/search-forms";
import { SearchTabs } from "./_components/search-tabs";
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

function SectionTitle({ title, href, cta = "Ver todos" }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <h2 className="max-w-3xl text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">{title}</h2>
      {href && (
        <ButtonLink href={href} variant="outline" className="shrink-0">
          {cta} →
        </ButtonLink>
      )}
    </div>
  );
}

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const base = `/loja/${store.slug}`;
  const brand = storeBrand(store);
  const { d, minDate } = parseSearch({});
  const dest = (cat: Parameters<typeof adaptersFor>[0]) => [...new Set(adaptersFor(cat).flatMap((a) => a.destinations().map((x) => x.name)))];

  const [tickets, hotels] = await Promise.all([
    searchCatalog(db, ctx, "TICKETS", supplierParams(d, "tickets")),
    searchCatalog(db, ctx, "LODGING", supplierParams(d, "lodging")),
  ]);

  const tabs = STORE_CATEGORIES.map((c) => {
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
      {/* ───────── Hero ───────── */}
      <section className="px-3 pt-3 sm:px-4">
        <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[2rem] bg-accent text-accent-fg sm:rounded-[2.5rem]">
          <FlightPath className="pointer-events-none absolute left-[38%] top-10 hidden h-28 w-56 text-accent-fg/40 lg:block" />
          <div className="grid gap-8 px-6 pb-44 pt-12 sm:px-12 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-48">
            <div className="flex flex-col justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-accent-fg/15 px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" /> {store.name}
                </span>
                <h1 className="display mt-6 text-[clamp(3.4rem,7.2vw,7.5rem)]">
                  {brand.heroLines.map((l, i) => (
                    <span key={i} className="block">
                      {l}
                    </span>
                  ))}
                </h1>
                <p className="mt-6 max-w-md text-[17px] leading-relaxed text-accent-fg/85">{brand.heroSubtitle}</p>
              </div>
            </div>
            <div className="hidden grid-cols-[1.15fr_1fr] gap-3 lg:grid">
              <div className="relative overflow-hidden rounded-[2rem]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.heroImage} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-4 left-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">10x sem juros em tudo</span>
              </div>
              <div className="grid grid-rows-[1fr_1.25fr] gap-3">
                <div className="flex flex-col justify-between rounded-[2rem] bg-ink p-6 text-white">
                  <p className="text-[13px] font-medium text-white/60">Melhor preço</p>
                  <p className="text-6xl font-semibold leading-none tracking-[-0.06em]">Pix</p>
                  <p className="text-[13px] text-white/60">aprovação na hora</p>
                </div>
                <div className="overflow-hidden rounded-[2rem]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.heroImage2} alt="" className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative mx-auto -mt-36 max-w-[1440px] px-3 sm:px-8">
          <SearchTabs tabs={tabs} />
        </div>
      </section>

      {/* ───────── Categorias (bento) ───────── */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 sm:px-8">
        <SectionTitle title="Tudo para a viagem, em um só carrinho." />
        <div className="grid auto-rows-[220px] grid-cols-2 gap-3 lg:auto-rows-[260px] lg:grid-cols-4">
          {STORE_CATEGORIES.map((c, i) => {
            const t = CATEGORY_TILE[c.slug];
            return (
              <Link
                key={c.slug}
                href={`${base}/${c.slug}`}
                className={cn("group relative overflow-hidden rounded-[2rem] bg-ink text-white", i === 0 && "col-span-2 row-span-2")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo(t.image, i === 0 ? 1400 : 800)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <ArrowChip tone="light" className="absolute right-4 top-4 transition group-hover:bg-accent group-hover:text-accent-fg" />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                  <p className={cn("font-semibold leading-none tracking-[-0.04em]", i === 0 ? "text-[clamp(2.25rem,4vw,3.75rem)]" : "text-2xl sm:text-[1.75rem]")}>{c.short}</p>
                  <p className={cn("mt-2 text-white/80", i === 0 ? "text-base" : "hidden text-sm sm:block")}>{t.line}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold text-muted">Em breve</span>
          {COMING_SOON.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium text-ink/70">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </span>
          ))}
        </div>
      </section>

      {/* ───────── Ingressos ───────── */}
      <section className="mx-auto mt-28 max-w-[1440px] px-4 sm:px-8">
        <SectionTitle title="Ingressos e experiências" href={`${base}/ingressos`} />
        <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {tickets.slice(0, 4).map((p) => (
            <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/ingressos/${p.supplierCode}/${p.productId}`} note="adulto" />
          ))}
        </div>
      </section>

      {/* ───────── Promo ───────── */}
      <section className="mx-auto mt-28 grid max-w-[1440px] gap-3 px-3 sm:px-4 lg:grid-cols-3">
        <div className="flex min-h-[380px] flex-col justify-between rounded-[2rem] bg-ink p-8 text-white sm:rounded-[2.5rem] sm:p-10">
          <p className="text-[15px] text-white/60">Em todos os produtos</p>
          <p className="text-[clamp(6rem,12vw,10rem)] font-semibold leading-[0.8] tracking-[-0.07em]">
            10x<span className="text-accent">.</span>
          </p>
          <p className="text-2xl font-semibold leading-tight tracking-[-0.03em]">sem juros no cartão</p>
        </div>
        <div className="relative min-h-[380px] overflow-hidden rounded-[2rem] sm:rounded-[2.5rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo("airportBoard", 1000)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-8 text-white sm:p-10">
            <p className="text-[clamp(2rem,3vw,2.75rem)] font-semibold leading-[0.98] tracking-[-0.045em]">Gente de verdade cuidando da sua viagem.</p>
            <p className="mt-3 text-[15px] text-white/75">Atendimento {store.name}</p>
          </div>
        </div>
        <div className="flex min-h-[380px] flex-col justify-between rounded-[2rem] bg-surface p-8 sm:rounded-[2.5rem] sm:p-10">
          <p className="text-[15px] text-muted">No Pix</p>
          <p className="text-[clamp(5rem,10vw,8.5rem)] font-semibold leading-[0.8] tracking-[-0.07em] text-accent-ink">Pix</p>
          <div>
            <p className="text-2xl font-semibold leading-tight tracking-[-0.03em]">Melhor preço e aprovação na hora.</p>
            <p className="mt-2 text-[15px] text-muted">E ainda dá para usar cupom de desconto no carrinho.</p>
          </div>
        </div>
      </section>

      {/* ───────── Hotéis (com API real, a vitrine precisa de destino: a seção some) ───────── */}
      {hotels.length > 0 && (
      <section className="mx-auto mt-28 max-w-[1440px] px-4 sm:px-8">
        <SectionTitle title="Hotéis em destaque" href={`${base}/hospedagem`} />
        <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {hotels.slice(0, 4).map((p) => (
            <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/hospedagem/${p.supplierCode}/${p.productId}`} note="5 noites" />
          ))}
        </div>
      </section>
      )}

      {/* ───────── Destinos ───────── */}
      <section className="mx-auto mt-28 max-w-[1440px] px-4 sm:px-8">
        <SectionTitle title="Para onde vamos?" />
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:-mx-8 sm:px-8">
          {DESTINATIONS.map((x) => (
            <Link
              key={x.name}
              href={`${base}/hospedagem?${toQuery({ destino: x.name })}`}
              className="group relative h-[360px] w-[260px] shrink-0 snap-start overflow-hidden rounded-[2rem] bg-ink text-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(x.image, 700, 1000)} alt={x.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="text-xs font-medium text-white/70">{x.country}</p>
                <p className="text-3xl font-semibold tracking-[-0.04em]">{x.name}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
