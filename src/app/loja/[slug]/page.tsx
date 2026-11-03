import Link from "next/link";
import { BadgePercent, CreditCard, Headphones, QrCode } from "lucide-react";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { INSURANCE_REGIONS } from "@/server/suppliers/mock/single-page";
import { FlightPath } from "@/components/brand";
import { getStore, getStorePricing } from "./_lib/store";
import { COMING_SOON, STORE_CATEGORIES } from "./_components/category";
import { ChipSearch, InsuranceSearch, LodgingSearch, TicketsSearch } from "./_components/search-forms";
import { SearchTabs } from "./_components/search-tabs";
import { parseSearch, supplierParams } from "./_components/search-params";
import { ProductCard } from "./_components/product-card";

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const ctx = await getStorePricing(store.id);
  const base = `/loja/${store.slug}`;
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
      <section className="relative overflow-hidden bg-accent text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-black/10" />
        <FlightPath className="pointer-events-none absolute right-6 top-10 hidden h-28 w-52 text-white/50 md:block" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
          <h1 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Viaje mais.
            <br />
            <span className="text-white/80">Pague em 10x.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
            Ingressos, hospedagem, casas, seguro viagem e chip em um só carrinho — com o atendimento da {store.name}.
          </p>
          <div className="mt-8 rounded-3xl bg-white/10 p-3 backdrop-blur sm:p-4">
            <SearchTabs tabs={tabs} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STORE_CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.slug} href={`${base}/${c.slug}`} className="group rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-cream text-accent group-hover:bg-accent group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3 font-extrabold text-ink">{c.short}</p>
                <p className="text-xs text-muted">Ver opções →</p>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-muted">Em breve:</span>
          {COMING_SOON.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 font-semibold text-muted">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-black text-ink">Ingressos e experiências</h2>
          <Link href={`${base}/ingressos`} className="text-sm font-bold text-accent">
            Ver todos →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tickets.slice(0, 4).map((p) => (
            <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/ingressos/${p.supplierCode}/${p.productId}`} note="por adulto" />
          ))}
        </div>

        <div className="mb-4 mt-12 flex items-end justify-between">
          <h2 className="text-2xl font-black text-ink">Hotéis em destaque</h2>
          <Link href={`${base}/hospedagem`} className="text-sm font-bold text-accent">
            Ver todos →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {hotels.slice(0, 4).map((p) => (
            <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/hospedagem/${p.supplierCode}/${p.productId}`} note="5 noites · 2 adultos" />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 rounded-3xl bg-plum p-6 text-white sm:grid-cols-4 sm:p-8">
          {[
            { icon: CreditCard, t: "10x sem juros", d: "Em todos os produtos, no cartão." },
            { icon: QrCode, t: "Melhor preço no Pix", d: "Pagamento à vista com aprovação imediata." },
            { icon: BadgePercent, t: "Cupons de desconto", d: "Aplique seu cupom no carrinho." },
            { icon: Headphones, t: `Atendimento ${store.name}`, d: "Gente de verdade cuidando da sua viagem." },
          ].map((x) => (
            <div key={x.t}>
              <x.icon className="h-6 w-6 text-brand-200" />
              <p className="mt-2 font-extrabold">{x.t}</p>
              <p className="text-sm text-white/70">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
