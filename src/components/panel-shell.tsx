"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "./ui";
import { MeshBackground } from "./mesh-background";

export type NavItem = { href: string; label: string; icon?: ReactNode; exact?: boolean };

/**
 * Estrutura dos painéis (Subrinho e Afiliado) em vidro ("liquid glass"): fundo com gradiente vivo
 * nas cores da marca, menu lateral flutuante translúcido e conteúdo em cartões de vidro (os
 * componentes do kit viram vidro dentro de `.glass-ui` — ver globals.css).
 */
export function PanelShell({
  brand,
  badge,
  nav,
  user,
  children,
  footer,
}: {
  brand: ReactNode;
  badge?: ReactNode;
  nav: NavItem[];
  user: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));
  useEffect(() => setOpen(false), [pathname]);

  const navList = (
    <nav className="flex flex-col gap-1">
      {nav.map((i) => {
        const on = isActive(i);
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setOpen(false)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "group relative flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[14px] font-medium transition-all duration-200",
              on
                ? "bg-white/90 font-semibold text-ink shadow-[0_8px_24px_-12px_rgba(20,20,40,0.35),inset_0_1px_0_rgba(255,255,255,1)]"
                : "text-ink/60 hover:bg-white/45 hover:text-ink",
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-xl transition [&>svg]:h-[17px] [&>svg]:w-[17px]",
                on ? "bg-brand text-brand-fg shadow-[0_6px_14px_-6px_var(--color-brand)]" : "bg-white/40 text-ink/60 group-hover:bg-white/70 group-hover:text-ink",
              )}
            >
              {i.icon}
            </span>
            {i.label}
            {on && <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="glass-ui relative min-h-screen text-ink lg:grid lg:grid-cols-[288px_1fr]">
      <MeshBackground />

      {/* Menu lateral (desktop): vidro flutuante */}
      <aside className="glass glass-edge sticky top-3 z-20 m-3 hidden h-[calc(100vh-1.5rem)] flex-col rounded-[30px] px-3 py-5 lg:flex">
        <div className="mb-2 px-3">{brand}</div>
        {badge && <div className="mb-6 px-3">{badge}</div>}
        <div className="no-scrollbar -mx-1 flex-1 overflow-y-auto px-1">{navList}</div>
        <div className="mt-4 rounded-[22px] bg-white/55 p-3.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/60">{user}</div>
        {footer}
      </aside>

      {/* Topo (mobile): vidro */}
      <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between px-4 lg:hidden">
        <div className="min-w-0">{brand}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)]"
          aria-expanded={open}
        >
          {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          {open ? "Fechar" : "Menu"}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-3 top-[4.5rem] z-30 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-[28px] p-3 lg:hidden">
          <div className="glass glass-edge rounded-[28px] p-3">
            {badge && <div className="mb-4 px-3 pt-2">{badge}</div>}
            {navList}
            <div className="mt-4 rounded-[22px] bg-white/55 p-3.5 text-sm ring-1 ring-white/60">{user}</div>
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}
