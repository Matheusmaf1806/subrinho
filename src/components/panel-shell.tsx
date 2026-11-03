"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "./ui";

export type NavItem = { href: string; label: string; icon?: ReactNode; exact?: boolean };

/** Estrutura dos painéis (Subrinho e Afiliado): menu lateral + conteúdo. */
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

  const navList = (
    <nav className="flex flex-col gap-0.5">
      {nav.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition",
            isActive(i) ? "bg-white text-brand shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white",
          )}
        >
          <span className="grid h-5 w-5 place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Menu lateral (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-brand px-4 py-5 text-white lg:flex">
        <div className="mb-1 px-2">{brand}</div>
        {badge && <div className="mb-6 px-2">{badge}</div>}
        <div className="flex-1 overflow-y-auto">{navList}</div>
        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm">{user}</div>
        {footer}
      </aside>

      {/* Topo (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-brand px-4 py-3 text-white lg:hidden">
        <div>{brand}</div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold" aria-expanded={open}>
          {open ? "Fechar" : "Menu"}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[56px] z-30 max-h-[calc(100vh-56px)] overflow-y-auto bg-brand px-4 pb-5 text-white lg:hidden">
          {badge && <div className="mb-3">{badge}</div>}
          {navList}
          <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm">{user}</div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
