import type { Metadata } from "next";
import Link from "next/link";
import { SubrinhoLogo } from "@/components/brand";
import { cartBadgeCount, currentCartToken, getStore, viewerFor } from "./_lib/store";
import { StoreHeader } from "./_components/store-header";
import { STORE_CATEGORIES } from "./_components/category";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await getStore((await params).slug);
  return { title: { default: store.name, template: `%s · ${store.name}` }, description: `${store.name} — sua loja de viagens com a tecnologia Subrinho.` };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const [viewer, count, token] = await Promise.all([viewerFor(store), cartBadgeCount(store), currentCartToken(store)]);
  const base = `/loja/${store.slug}`;
  return (
    <div style={{ ["--store-accent" as string]: store.brandColor }} className="flex min-h-screen flex-col bg-white">
      <StoreHeader store={store} viewer={viewer} cartCount={count} cartHref={token ? `${base}/carrinho/${token}` : `${base}/carrinho`} />
      <div className="flex-1">{children}</div>
      <footer className="mt-24 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="overflow-hidden rounded-[2rem] bg-ink text-white sm:rounded-[2.5rem]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pt-14 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-12">
            <div>
              <p className="max-w-sm text-3xl font-semibold leading-[1.05] tracking-[-0.04em]">Viajar é com a gente. A tecnologia também.</p>
              {store.whatsapp && (
                <a href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`} className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold" target="_blank" rel="noreferrer">
                  Fale no WhatsApp →
                </a>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Produtos</p>
              <ul className="mt-4 space-y-2 text-[15px]">
                {STORE_CATEGORIES.map((c) => (
                  <li key={c.slug}>
                    <Link className="text-white/75 hover:text-white" href={`${base}/${c.slug}`}>
                      {c.short}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Contato</p>
              <ul className="mt-4 space-y-2 text-[15px] text-white/75">
                {store.email && <li>{store.email}</li>}
                {store.phone && <li>{store.phone}</li>}
                <li>Pagamento em até 10x sem juros ou no Pix</li>
              </ul>
            </div>
          </div>
          <div className="mx-auto mt-12 flex max-w-[1440px] flex-wrap items-end justify-between gap-6 px-6 pb-8 sm:px-12">
            <p className="text-[clamp(3rem,11vw,10rem)] font-semibold leading-[0.85] tracking-[-0.06em] text-white">{store.name}</p>
            <div className="pb-2 text-right">
              <p className="text-[11px] font-medium text-white/40">Loja com a tecnologia</p>
              <SubrinhoLogo tone="brand" size="sm" className="mt-1" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
