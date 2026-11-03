import type { loadCartView } from "@/server/cart/service";
import type { PaxConfig } from "@/server/db/schema";
import type { PaxRule } from "@/server/suppliers/types";
import { money } from "@/server/pricing/money";

type View = NonNullable<Awaited<ReturnType<typeof loadCartView>>>;

/** Modelo serializável dos itens do carrinho (sem custo/câmbio/margem Subrinho). */
export function toItemVMs(view: View, opts: { adminMode: boolean }) {
  const byId = new Map(view.priced.items.map((p) => [p.id, p]));
  return view.items.map((i) => {
    const p = byId.get(i.id)!;
    const f = p.final;
    return {
      id: i.id,
      category: i.category,
      title: i.title,
      subtitle: i.subtitle,
      location: i.location,
      imageUrl: i.imageUrl,
      serviceDate: i.serviceDate,
      serviceEndDate: i.serviceEndDate,
      pax: i.pax as PaxConfig,
      paxRules: ((i.details as { paxRules?: PaxRule[] }).paxRules ?? []) as PaxRule[],
      lines: i.lines.map((l) => ({ label: l.label, quantity: l.quantity })),
      listPix: money(f.netAffiliate),
      pix: money(f.finalPix),
      installment: money(f.finalInstallment),
      discount: money(f.subrinhoDiscount.plus(f.affiliateDiscount)),
      // Somente para o ADMIN da agência (modo ADMIN):
      admin: opts.adminMode
        ? {
            marginPct: p.affiliateMargin.pct.toString(),
            source: p.affiliateMargin.source,
            defaultPct: p.affiliateDefaultMargin.pct.toString(),
            base: money(f.netSubrinho),
            commission: money(f.affiliateCommission),
            installmentFeePct: f.installmentFeePct.toString(),
          }
        : null,
    };
  });
}

export type ItemVM = ReturnType<typeof toItemVMs>[number];

export function totalsVM(view: View) {
  const t = view.priced.totals;
  return {
    listPix: money(t.netAffiliate),
    discount: money(t.discount),
    pix: money(t.pix),
    installment: money(t.installment),
    plan: { count: t.installmentPlan.count, installment: money(t.installmentPlan.installment), first: money(t.installmentPlan.first) },
    coupons: (["SUBRINHO", "AFFILIATE"] as const)
      .map((layer) => view.priced.coupons[layer])
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ layer: c.coupon.issuer, code: c.coupon.code, description: c.coupon.description ?? null, total: money(c.total), limited: c.limitedByMargin, notApplied: c.notApplied ?? null })),
    notices: view.couponNotices,
  };
}

export type TotalsVM = ReturnType<typeof totalsVM>;
