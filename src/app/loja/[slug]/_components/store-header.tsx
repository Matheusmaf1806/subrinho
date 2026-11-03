import Link from "next/link";
import { LogOut, ShieldCheck, ShoppingCart, User } from "lucide-react";
import type { StoreViewer } from "@/server/auth/session";
import { SubrinhoSymbol } from "@/components/brand";
import { cn } from "@/components/ui";
import type { Store } from "../_lib/store";
import { logoutAction, toggleAdminModeAction } from "../actions";
import { STORE_CATEGORIES } from "./category";

export function StoreHeader({ store, viewer, cartCount, cartHref }: { store: Store; viewer: StoreViewer | null; cartCount: number; cartHref: string }) {
  const base = `/loja/${store.slug}`;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      {viewer?.kind === "AFFILIATE" && (
        <div className={cn("text-white", viewer.adminMode ? "bg-plum" : "bg-muted")}>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs font-bold sm:px-6">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              {viewer.adminMode ? "MODO ADMIN — você pode alterar a margem dos itens no checkout (somente neste carrinho)" : `Logado como agência (${viewer.user.name})`}
            </span>
            {viewer.canAdmin && (
              <form action={toggleAdminModeAction.bind(null, store.slug)}>
                <button className="rounded-full bg-white/15 px-3 py-0.5 hover:bg-white/25">{viewer.adminMode ? "Desligar modo ADMIN" : "Ligar modo ADMIN"}</button>
              </form>
            )}
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={base} className="flex min-w-0 items-center gap-2.5">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={store.name} className="h-9 w-auto max-w-[160px] object-contain" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-white">
              <SubrinhoSymbol className="h-5 w-auto" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-lg font-black leading-tight text-ink">{store.name}</span>
            <span className="block text-[11px] font-semibold leading-tight text-muted">tecnologia Subrinho</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {STORE_CATEGORIES.map((c) => (
            <Link key={c.slug} href={`${base}/${c.slug}`} className="rounded-xl px-3 py-2 text-sm font-bold text-ink/80 hover:bg-cream hover:text-accent">
              {c.short}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          {viewer ? (
            <div className="flex items-center gap-1">
              <Link href={viewer.kind === "CUSTOMER" ? `${base}/minha-conta` : "/afiliado"} className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink hover:bg-cream sm:inline-flex">
                <User className="h-4 w-4" />
                {(viewer.kind === "CUSTOMER" ? viewer.customer.name : viewer.user.name).split(" ")[0]}
              </Link>
              <form action={logoutAction.bind(null, store.slug)}>
                <button className="rounded-xl p-2 text-muted hover:bg-cream hover:text-ink" aria-label="Sair" title="Sair">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <Link href={`${base}/entrar`} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink hover:bg-cream">
              <User className="h-4 w-4" /> <span className="hidden sm:inline">Entrar</span>
            </Link>
          )}
          <Link href={cartHref} className="relative inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-white hover:brightness-95">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Carrinho</span>
            {cartCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs font-black text-accent">{cartCount}</span>}
          </Link>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden">
        {STORE_CATEGORIES.map((c) => (
          <Link key={c.slug} href={`${base}/${c.slug}`} className="shrink-0 rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-ink">
            {c.short}
          </Link>
        ))}
      </nav>
    </header>
  );
}
