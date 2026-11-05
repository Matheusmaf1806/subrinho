import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowLeftRight,
  Banknote,
  FileChartColumn,
  History,
  LayoutDashboard,
  LogOut,
  Percent,
  Plug,
  Receipt,
  Settings,
  ShieldCheck,
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
  { href: "/subrinho/notas", label: "Notas fiscais", icon: <Receipt /> },
  { href: "/subrinho/relatorios", label: "Relatórios", icon: <FileChartColumn /> },
  { href: "/subrinho/fornecedores", label: "Fornecedores", icon: <Plug /> },
  { href: "/subrinho/monitoramento", label: "Monitoramento", icon: <Activity /> },
  { href: "/subrinho/historico", label: "Histórico", icon: <History /> },
  { href: "/subrinho/configuracoes", label: "Configurações", icon: <Settings /> },
  { href: "/subrinho/seguranca", label: "Segurança", icon: <ShieldCheck /> },
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
        <Link href="/subrinho" aria-label="Painel Subrinho, início">
          <SubrinhoLogo tone="brand" size="sm" />
        </Link>
      }
      badge={
        <span className="inline-flex rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/60 ring-1 ring-white/70">
          Painel Subrinho
        </span>
      }
      nav={NAV}
      user={
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-fg shadow-[0_6px_14px_-6px_var(--color-brand)]" aria-hidden>
            {initials || "S"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink/55">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action={logoutSubrinho}>
            <button
              type="submit"
              className="grid h-9 w-9 place-items-center rounded-xl text-ink/60 transition hover:bg-white hover:text-ink"
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
