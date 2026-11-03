"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "./ui";

export type NavItem = { href: string; label: string; icon?: ReactNode; exact?: boolean };

/** Estrutura dos painéis (Subrinho e Afiliado): menu lateral preto + conteúdo em superfície clara. */
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
            "group flex h-11 items-center gap-3 rounded-full px-4 text-[14px] font-medium transition",
            isActive(i) ? "bg-white text-ink" : "text-white/60 hover:bg-white/[0.07] hover:text-white",
          )}
        >
          <span className={cn("grid h-5 w-5 place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]", isActive(i) ? "text-brand-ink" : "")}>{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[272px_1fr]">
      {/* Menu lateral (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-ink px-4 py-6 text-white lg:flex">
        <div className="mb-2 px-3">{brand}</div>
        {badge && <div className="mb-8 px-3">{badge}</div>}
        <div className="no-scrollbar -mx-1 flex-1 overflow-y-auto px-1">{navList}</div>
        <div className="mt-4 rounded-3xl bg-white/[0.06] p-4 text-sm">{user}</div>
        {footer}
      </aside>

      {/* Topo (mobile) */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-ink px-4 text-white lg:hidden">
        <div>{brand}</div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="h-9 rounded-full bg-white px-4 text-[13px] font-semibold text-ink" aria-expanded={open}>
          {open ? "Fechar" : "Menu"}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-16 z-30 max-h-[calc(100vh-4rem)] overflow-y-auto bg-ink px-4 pb-6 text-white lg:hidden">
          {badge && <div className="mb-4 px-3">{badge}</div>}
          {navList}
          <div className="mt-4 rounded-3xl bg-white/[0.06] p-4 text-sm">{user}</div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}
