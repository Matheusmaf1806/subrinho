import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SubrinhoLogo } from "@/components/brand";
import { cartBadgeCount, currentCartToken, getStore, storeBrand, viewerFor } from "./_lib/store";
import { themeStyle } from "@/lib/theme";
import { StoreMark } from "./_components/store-mark";
import { StoreHeader } from "./_components/store-header";
import { ScrollState } from "./_components/scroll-state";
import { storeCategories } from "./_lib/categories";
import { paymentProvider } from "@/server/payments/provider";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await getStore((await params).slug);
  const brand = storeBrand(store);
  return {
    title: { default: store.name, template: `%s · ${store.name}` },
    description: `${store.name} — ${brand.tagline}`,
    icons: { icon: brand.favicon, apple: brand.favicon },
    openGraph: { title: store.name, description: brand.tagline, images: [brand.heroImage] },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const store = await getStore((await params).slug);
  return { themeColor: store.brandColor };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  const [viewer, count, token, cats] = await Promise.all([viewerFor(store), cartBadgeCount(store), currentCartToken(store), storeCategories()]);
  const base = `/loja/${store.slug}`;
  const brand = storeBrand(store);
  return (
    <div style={themeStyle(store)} className="flex min-h-screen flex-col bg-white font-sans text-ink">
      <StoreHeader store={store} viewer={viewer} cartCount={count} cartHref={token ? `${base}/carrinho/${token}` : `${base}/carrinho`} categories={cats.live} pixAvailable={paymentProvider().pixAvailable} />
      <div className="flex-1">{children}</div>
      <ScrollState />
      <footer className="mt-24 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-ink text-white sm:rounded-[2.5rem]">
          <div className="grid-paper grid-paper-light pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden />
          <div className="pointer-events-none absolute right-10 top-10 -z-10 hidden h-32 w-32 rotate-6 rounded-[1.25rem] bg-accent opacity-90 lg:block" aria-hidden />
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pt-14 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-12">
            <div>
              <StoreMark store={store} onDark className={store.logoOnDarkUrl ? "mb-8 h-12" : "mb-8"} />
              <p className="max-w-sm text-3xl font-semibold leading-[1.05] tracking-[-0.04em]">{brand.tagline}</p>
              {store.whatsapp && (
                <a href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`} className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg" target="_blank" rel="noreferrer">
                  Fale no WhatsApp →
                </a>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Produtos</p>
              <ul className="mt-4 space-y-2 text-[15px]">
                {cats.live.map((c) => (
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
                {brand.instagram && (
                  <li>
                    <a href={`https://instagram.com/${brand.instagram}`} target="_blank" rel="noreferrer" className="hover:text-white">
                      @{brand.instagram}
                    </a>
                  </li>
                )}
                <li>Pagamento em até 10x sem juros ou no Pix</li>
              </ul>
            </div>
          </div>
          <div className="mx-auto mt-12 flex max-w-[1440px] flex-wrap items-end justify-between gap-6 px-6 pb-8 sm:px-12">
            <p className="text-[clamp(3rem,11vw,10rem)] font-semibold leading-[0.85] tracking-[-0.06em] text-white">{store.name}</p>
            {store.showPoweredBy && (
              <div className="pb-2 text-right">
                <p className="text-[11px] font-medium text-white/40">Loja com a tecnologia</p>
                <SubrinhoLogo tone="light" size="sm" className="mt-1 opacity-80" />
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
