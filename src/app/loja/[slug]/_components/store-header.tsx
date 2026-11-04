import Link from "next/link";
import { LogOut, ShieldCheck, User } from "lucide-react";
import type { StoreViewer } from "@/server/auth/session";
import type { Store } from "../_lib/store";
import { logoutAction, toggleAdminModeAction } from "../actions";
import type { StoreCategory } from "../_lib/categories";
import { StoreMark } from "./store-mark";
import { CartDrawer } from "./cart-drawer";

export function StoreHeader({
  store,
  viewer,
  cartCount,
  cartHref,
  categories,
  pixAvailable,
}: {
  store: Store;
  viewer: StoreViewer | null;
  cartCount: number;
  cartHref: string;
  categories: StoreCategory[];
  pixAvailable: boolean;
}) {
  const base = `/loja/${store.slug}`;
  return (
    <header className="store-header sticky top-0 z-40 bg-white/90 backdrop-blur-xl backdrop-saturate-150">
      {viewer?.kind === "AFFILIATE" && (
        <div className="bg-ink text-white">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] sm:px-8">
            <span className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${viewer.adminMode ? "bg-brand" : "bg-white/40"}`} aria-hidden />
              <ShieldCheck className="h-4 w-4 text-white/70" />
              {viewer.adminMode ? (
                <span>
                  <strong className="font-semibold">Modo ADMIN</strong> <span className="text-white/60">· altere a margem dos itens no checkout, só neste carrinho</span>
                </span>
              ) : (
                <span>Logado como agência · {viewer.user.name}</span>
              )}
            </span>
            {viewer.canAdmin && (
              <form action={toggleAdminModeAction.bind(null, store.slug)}>
                <button className="h-7 rounded-full bg-white px-3 text-xs font-semibold text-ink hover:bg-white/90">{viewer.adminMode ? "Desligar modo ADMIN" : "Ligar modo ADMIN"}</button>
              </form>
            )}
          </div>
        </div>
      )}
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-8">
        <Link href={base} className="flex min-w-0 items-center gap-3">
          <StoreMark store={store} />
          {!store.logoUrl && (
            <span className="min-w-0 leading-none">
              <span className="block truncate text-[19px] font-semibold tracking-[-0.04em] text-ink">{store.name}</span>
              {store.showPoweredBy && <span className="mt-1 block text-[11px] font-medium text-muted">tecnologia Subrinho</span>}
            </span>
          )}
        </Link>
        <nav className="hidden items-center gap-1 rounded-full bg-surface p-1 lg:flex">
          {categories.map((c) => (
            <Link key={c.slug} href={`${base}/${c.slug}`} className="rounded-full px-4 py-2 text-[14px] font-medium text-ink/70 transition hover:bg-white hover:text-ink">
              {c.short}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {viewer ? (
            <div className="flex items-center gap-1">
              <Link
                href={viewer.kind === "CUSTOMER" ? `${base}/minha-conta` : "/afiliado"}
                className="hidden h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2 sm:inline-flex"
              >
                <User className="h-4 w-4" />
                {(viewer.kind === "CUSTOMER" ? viewer.customer.name : viewer.user.name).split(" ")[0]}
              </Link>
              <form action={logoutAction.bind(null, store.slug)}>
                <button className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label="Sair" title="Sair">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <Link href={`${base}/entrar`} className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2">
              <User className="h-4 w-4" /> <span className="hidden sm:inline">Entrar</span>
            </Link>
          )}
          <CartDrawer slug={store.slug} count={cartCount} cartHref={cartHref} pixAvailable={pixAvailable} categories={categories.map((c) => ({ slug: c.slug, short: c.short }))} />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden">
        {categories.map((c) => (
          <Link key={c.slug} href={`${base}/${c.slug}`} className="shrink-0 rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink">
            {c.short}
          </Link>
        ))}
      </nav>
    </header>
  );
}
