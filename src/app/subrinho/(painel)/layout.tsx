import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  FileChartColumn,
  LayoutDashboard,
  LogOut,
  Percent,
  Plug,
  Settings,
  ShoppingBag,
  Store,
  TicketPercent,
} from "lucide-react";
import { SubrinhoLogo } from "@/components/brand";
import { PanelShell, type NavItem } from "@/components/panel-shell";
import { requireSubrinhoUser } from "@/server/auth/session";
import { ROLE_LABEL } from "../_lib/labels";
import { logoutSubrinho } from "./actions";

export const metadata: Metadata = {
  title: { default: "Painel Subrinho", template: "%s · Painel Subrinho" },
  robots: { index: false, follow: false },
};

const NAV: NavItem[] = [
  { href: "/subrinho", label: "Visão geral", icon: <LayoutDashboard />, exact: true },
  { href: "/subrinho/pedidos", label: "Pedidos", icon: <ShoppingBag /> },
  { href: "/subrinho/afiliados", label: "Afiliados", icon: <Store /> },
  { href: "/subrinho/margens", label: "Margens", icon: <Percent /> },
  { href: "/subrinho/cupons", label: "Cupons", icon: <TicketPercent /> },
  { href: "/subrinho/cambio", label: "Câmbio", icon: <ArrowLeftRight /> },
  { href: "/subrinho/repasses", label: "Repasses", icon: <Banknote /> },
  { href: "/subrinho/relatorios", label: "Relatórios", icon: <FileChartColumn /> },
  { href: "/subrinho/fornecedores", label: "Fornecedores", icon: <Plug /> },
  { href: "/subrinho/configuracoes", label: "Configurações", icon: <Settings /> },
];

export default async function SubrinhoPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSubrinhoUser();
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <PanelShell
      brand={
        <Link href="/subrinho" aria-label="Painel Subrinho — início">
          <SubrinhoLogo tone="light" size="sm" />
        </Link>
      }
      badge={
        <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-cream">
          Painel Subrinho
        </span>
      }
      nav={NAV}
      user={
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream text-sm font-black text-brand" aria-hidden>
            {initials || "S"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold text-white">{user.name}</p>
            <p className="truncate text-xs text-white/75">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action={logoutSubrinho}>
            <button
              type="submit"
              className="grid h-9 w-9 place-items-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white"
              title="Sair"
              aria-label="Sair do painel"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      }
    >
      {children}
    </PanelShell>
  );
}
