import type { loadCartView } from "@/server/cart/service";
import type { PaxConfig } from "@/server/db/schema";
import type { PaxRule } from "@/server/suppliers/types";
import { money } from "@/server/pricing/money";
import { mediaUrl } from "@/server/media";
import { stripSupplierMentions, stripSupplierMentionsList } from "@/lib/supplier-names";

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
      imageUrl: mediaUrl(i.imageUrl),
      serviceDate: i.serviceDate,
      serviceEndDate: i.serviceEndDate,
      pax: i.pax as PaxConfig,
      paxRules: ((i.details as { paxRules?: PaxRule[] }).paxRules ?? []) as PaxRule[],
      lines: i.lines.map((l) => ({ label: l.label, quantity: l.quantity })),
      hotel: i.category === "LODGING" || i.category === "HOUSES" || i.category === "TICKETS" ? hotelInfo(i.details as Record<string, unknown>) : null,
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
            // base sem o piso: o modal recalcula ao vivo e aplica o piso por cima
            base: money(p.floor ? p.floor.withoutFloor.netSubrinho : f.netSubrinho),
            minPix: p.floor ? money(p.floor.minPix) : null,
            commission: money(f.affiliateCommission),
            installmentFeePct: f.installmentFeePct.toString(),
          }
        : null,
    };
  });
}

export type ItemVM = ReturnType<typeof toItemVMs>[number];

/** Informações do hotel que o cliente precisa ver antes de pagar (sem dados internos do fornecedor). */
function hotelInfo(d: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const notes = stripSupplierMentionsList(Array.isArray(d.notes) ? d.notes.filter((n): n is string => typeof n === "string" && !!n.trim()) : []);
  if (!str(d.cancellation) && !str(d.board) && !notes.length) return null;
  return {
    board: str(d.board),
    cancellation: str(d.cancellation),
    freeCancellation: !!str(d.freeCancellationUntil),
    nonRefundable: d.nonRefundable === true,
    notes,
    remarks: str(stripSupplierMentions(str(d.remarks)))?.slice(0, 2500) ?? null,
  };
}

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
