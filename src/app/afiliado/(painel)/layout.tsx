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
  Wallet, History, ShieldCheck } from "lucide-react";
import { SubrinhoLogo } from "@/components/brand";
import { monogram, themeStyle } from "@/lib/theme";
import { PanelShell, type NavItem } from "@/components/panel-shell";
import { requireAffiliateUser } from "@/server/auth/session";
import { dailyBackdrop } from "@/lib/images";
import { ROLE_LABEL, storeHref } from "../_lib/helpers";
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
    { href: "/afiliado/historico", label: "Histórico", icon: <History /> },
    { href: "/afiliado/seguranca", label: "Segurança", icon: <ShieldCheck /> },
  ];

  // White-label: o painel do afiliado usa a identidade da agência (cores, fonte e logo).
  return (
    <div style={themeStyle(affiliate)} className="font-sans">
    <PanelShell
      backdrop={dailyBackdrop()}
      brand={
        <Link href="/afiliado" aria-label={`${affiliate.name}, início`} className="flex min-w-0 items-center gap-3">
          {affiliate.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={affiliate.logoUrl} alt={affiliate.name} className="h-9 w-auto max-w-[170px] object-contain" />
          ) : (
            <>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[30%] bg-brand text-[14px] font-semibold tracking-[-0.04em] text-brand-fg shadow-[0_6px_14px_-6px_var(--color-brand)]">
                {monogram(affiliate.name)}
              </span>
              <span className="truncate text-[17px] font-semibold tracking-[-0.03em] text-ink">{affiliate.name}</span>
            </>
          )}
        </Link>
      }
      badge={
        <div className="mt-3 flex flex-col items-start gap-2 text-[11px] font-medium text-ink/45">
          <span className="whitespace-nowrap rounded-full bg-white/60 px-2.5 py-1 font-semibold uppercase tracking-[0.12em] text-ink/60 ring-1 ring-white/70">Painel do Afiliado</span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            por <SubrinhoLogo tone="brand" size="sm" className="origin-left scale-[0.6] opacity-70" />
          </span>
        </div>
      }
      nav={nav}
      user={
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink" title={user.name}>
                {user.name}
              </p>
              <p className="truncate text-xs text-ink/55" title={user.email}>
                {user.email}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-fg">{user.role}</span>
          </div>
          <p className="mt-1 text-xs text-ink/55">
            {ROLE_LABEL[user.role]} · {affiliate.name}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={storeHref(affiliate)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ink-2"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Minha loja
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-black/[0.06] transition hover:bg-white"
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
    </div>
  );
}
