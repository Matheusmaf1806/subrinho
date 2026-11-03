import type { Metadata } from "next";
import Link from "next/link";
import {
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Percent,
  Receipt,
  ShoppingCart,
  Store,
  TicketPercent,
  Users,
  Wallet,
} from "lucide-react";
import { SubrinhoLogo } from "@/components/brand";
import { PanelShell, type NavItem } from "@/components/panel-shell";
import { requireAffiliateUser } from "@/server/auth/session";
import { ROLE_LABEL, storePath } from "../_lib/helpers";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: { default: "Painel do Afiliado", template: "%s · Painel do Afiliado · Subrinho" } };

export default async function PainelAfiliadoLayout({ children }: { children: React.ReactNode }) {
  const { user, affiliate } = await requireAffiliateUser();
  const isAdmin = user.role === "ADMIN";

  const nav: NavItem[] = [
    { href: "/afiliado", label: "Início", icon: <LayoutDashboard />, exact: true },
    { href: "/afiliado/pedidos", label: "Pedidos", icon: <Receipt /> },
    { href: "/afiliado/carrinhos", label: "Carrinhos", icon: <ShoppingCart /> },
    { href: "/afiliado/financeiro", label: "Financeiro", icon: <Wallet /> },
    { href: "/afiliado/margens", label: "Margens", icon: <Percent /> },
    { href: "/afiliado/cupons", label: "Cupons", icon: <TicketPercent /> },
    { href: "/afiliado/loja", label: "Minha loja", icon: <Store /> },
    ...(isAdmin ? [{ href: "/afiliado/usuarios", label: "Usuários", icon: <Users /> }] : []),
  ];

  return (
    <PanelShell
      brand={
        <Link href="/afiliado" aria-label="Painel do Afiliado — início">
          <SubrinhoLogo tone="brand" size="sm" />
        </Link>
      }
      badge={
        <div className="mt-2">
          <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white">
            Painel do Afiliado
          </span>
          <p className="mt-1.5 truncate text-sm font-semibold text-white/90" title={affiliate.name}>
            {affiliate.name}
          </p>
        </div>
      }
      nav={nav}
      user={
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white" title={user.name}>
                {user.name}
              </p>
              <p className="truncate text-xs text-white/75" title={user.email}>
                {user.email}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-brand">{user.role}</span>
          </div>
          <p className="mt-1 text-xs text-white/75">
            {ROLE_LABEL[user.role]} · {affiliate.name}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={storePath(affiliate.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Minha loja
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden /> Sair
              </button>
            </form>
          </div>
        </div>
      }
    >
      {children}
    </PanelShell>
  );
}
