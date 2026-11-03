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
    <div style={{ ["--store-accent" as string]: store.brandColor }} className="flex min-h-screen flex-col bg-[#fffaf7]">
      <StoreHeader store={store} viewer={viewer} cartCount={count} cartHref={token ? `${base}/carrinho/${token}` : `${base}/carrinho`} />
      <div className="flex-1">{children}</div>
      <footer className="mt-16 border-t border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-lg font-black text-ink">{store.name}</p>
            {store.email && <p className="mt-1 text-sm text-muted">{store.email}</p>}
            {store.phone && <p className="text-sm text-muted">{store.phone}</p>}
            {store.whatsapp && (
              <a href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`} className="mt-2 inline-block text-sm font-bold text-accent" target="_blank" rel="noreferrer">
                Fale no WhatsApp →
              </a>
            )}
          </div>
          <div>
            <p className="text-sm font-extrabold text-ink">Produtos</p>
            <ul className="mt-2 space-y-1 text-sm">
              {STORE_CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link className="text-muted hover:text-accent" href={`${base}/${c.slug}`}>
                    {c.short}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold text-muted">Loja com a tecnologia</p>
            <SubrinhoLogo size="sm" className="mt-1" />
            <p className="mt-2 text-xs text-muted">Pagamento em até 10x sem juros ou no Pix.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
