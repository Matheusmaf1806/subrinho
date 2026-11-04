/** Conta completa de um item do pedido, na mesma ordem da regra de preço da Subrinho. */
import type { ReactNode } from "react";
import { Badge, Card, CardBody, cn } from "@/components/ui";
import type { marginRules, orderItems } from "@/server/db/schema";
import { applyDiscounts, priceItem } from "@/server/pricing/engine";
import { d } from "@/server/pricing/money";
import { CATEGORY_LABEL } from "@/server/suppliers/types";
import { brl, date, fxRate, money, paxSummary, pct } from "@/lib/format";
import { JsonDetails } from "../../../_components/bits";
import { MARGIN_SOURCE_LABEL } from "../../../_lib/labels";
import { ruleSummary, supplierName } from "../../../_lib/rules";
import { SupplierBookingPanel } from "./booking-panel";

type Item = typeof orderItems.$inferSelect;
type Rule = typeof marginRules.$inferSelect;

type Row = { step: ReactNode; formula?: ReactNode; value: ReactNode; kind?: "strong" | "minus" | "muted" | "brand" | "result" };

function ruleInfo(id: string | null, rules: Map<string, Rule>) {
  if (!id) return <span className="text-muted">sem regra cadastrada</span>;
  const r = rules.get(id);
  return (
    <span>
      {r ? ruleSummary(r) : "regra removida"} <code className="ml-1 rounded bg-surface px-1 text-[10px] text-muted">{id.slice(0, 8)}</code>
    </span>
  );
}

/** Recalcula com o motor de preço a partir dos dados congelados, para conferir a conta gravada. */
function verify(i: Item): { ok: boolean; detail?: string } {
  try {
    const base = priceItem({
      costCurrency: i.costCurrency,
      lines: i.lines.map((l) => ({ unitCost: l.unitCost, quantity: l.quantity })),
      fxRate: i.fxRate,
      subrinhoMarginPct: i.subrinhoMarginPct,
      affiliateMarginPct: i.affiliateMarginPct,
      installmentFeePct: i.installmentFeePct,
    });
    const f = applyDiscounts(base, { subrinho: i.subrinhoDiscount, affiliate: i.affiliateDiscount });
    const checks: [string, string, string][] = [
      ["Custo R$", f.costBrl.toFixed(2), d(i.costBrl).toFixed(2)],
      ["NET Subrinho", f.netSubrinho.toFixed(2), d(i.netSubrinho).toFixed(2)],
      ["NET Afiliado", f.netAffiliate.toFixed(2), d(i.netAffiliate).toFixed(2)],
      ["PIX", f.finalPix.toFixed(2), d(i.finalPix).toFixed(2)],
      ["Parcelado", f.finalInstallment.toFixed(2), d(i.finalInstallment).toFixed(2)],
    ];
    const bad = checks.find(([, a, b]) => a !== b);
    return bad ? { ok: false, detail: `${bad[0]}: recalculado ${brl(bad[1])} × gravado ${brl(bad[2])}` } : { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "não foi possível recalcular" };
  }
}

export function ItemBreakdown({
  item: i,
  index,
  rules,
  paymentMethod,
  booking,
}: {
  item: Item;
  index: number;
  rules: Map<string, Rule>;
  paymentMethod: string;
  booking?: { live: boolean; orderPaid: boolean; canAct: boolean; canSimulateCancel?: boolean; simulatedPayment?: boolean };
}) {
  const cur = i.costCurrency;
  const check = verify(i);
  const floor = (i.details as { priceFloor?: { minPixBrl: string; ruleSubrinhoPct: string | null; applied: boolean } } | null)?.priceFloor;
  const rows: Row[] = [
    ...i.lines.map<Row>((l) => ({
      step: <span className="font-semibold">{l.label}</span>,
      formula: (
        <span>
          {l.quantity} × {money(l.unitCost, cur)}
          {l.ages?.length ? <span className="text-muted"> (idades {l.ages.join(", ")})</span> : null}
        </span>
      ),
      value: money(d(l.unitCost).times(l.quantity).toFixed(4), cur),
      kind: "muted",
    })),
    { step: "Custo na moeda", formula: "Σ preço unitário × quantidade", value: money(i.costForeign, cur), kind: "strong" },
    {
      step: "Câmbio",
      formula: cur === "BRL" ? "Tarifa em reais, sem conversão" : `${cur} → BRL (cotação congelada no pedido)`,
      value: cur === "BRL" ? "-" : `× ${fxRate(i.fxRate)}`,
    },
    { step: "Custo R$", formula: cur === "BRL" ? "custo na moeda" : `${money(i.costForeign, cur)} × ${fxRate(i.fxRate)}`, value: brl(i.costBrl), kind: "strong" },
    {
      step: (
        <span>
          Margem Subrinho <strong>{pct(i.subrinhoMarginPct)}</strong>
        </span>
      ),
      formula: ruleInfo(i.subrinhoMarginRuleId, rules),
      value: `+ ${brl(i.subrinhoMarginAmount)}`,
    },
    ...(floor?.applied
      ? [
          {
            step: <span className="text-amber-800">Preço mínimo do fornecedor</span>,
            formula: `PIX não pode ficar abaixo de ${brl(floor.minPixBrl)}, margem Subrinho subiu de ${pct(floor.ruleSubrinhoPct ?? "0")} (regra) para ${pct(i.subrinhoMarginPct)}`,
            value: `≥ ${brl(floor.minPixBrl)}`,
          } as Row,
        ]
      : []),
    { step: "NET Subrinho", formula: `${brl(i.costBrl)} ÷ (1 − ${pct(i.subrinhoMarginPct)})`, value: brl(i.netSubrinho), kind: "strong" },
    {
      step: (
        <span>
          Margem afiliado <strong>{pct(i.affiliateMarginPct)}</strong>
        </span>
      ),
      formula: (
        <span>
          <Badge tone={i.affiliateMarginSource === "OVERRIDE" ? "warning" : i.affiliateMarginSource === "FALLBACK" ? "neutral" : "info"} className="mr-1">
            {i.affiliateMarginSource}
          </Badge>
          {MARGIN_SOURCE_LABEL[i.affiliateMarginSource] ?? i.affiliateMarginSource}
          {i.affiliateMarginRuleId && <> · {ruleInfo(i.affiliateMarginRuleId, rules)}</>}
        </span>
      ),
      value: `+ ${brl(i.affiliateMarginAmount)}`,
    },
    { step: "NET Afiliado (PIX sem desconto)", formula: `${brl(i.netSubrinho)} ÷ (1 − ${pct(i.affiliateMarginPct)})`, value: brl(i.netAffiliate), kind: "strong" },
    { step: "Desconto Subrinho", formula: "cupom Subrinho, sai da margem Subrinho", value: `− ${brl(i.subrinhoDiscount)}`, kind: "minus" },
    { step: "Desconto afiliado", formula: "cupom do afiliado, sai da margem do afiliado", value: `− ${brl(i.affiliateDiscount)}`, kind: "minus" },
    { step: "Preço PIX", formula: "NET Afiliado − descontos", value: brl(i.finalPix), kind: "result" },
    { step: "Taxa do parcelado", formula: "embutida no preço parcelado", value: pct(i.installmentFeePct) },
    { step: "PARCELADO (sem juros)", formula: `${brl(i.finalPix)} ÷ (1 − ${pct(i.installmentFeePct)})`, value: brl(i.finalInstallment), kind: "result" },
    { step: "Valor cobrado", formula: paymentMethod === "PIX" ? "pagamento via Pix" : "pagamento no cartão (parcelado)", value: brl(i.chargedAmount), kind: "brand" },
    { step: "Receita Subrinho", formula: `margem ${brl(i.subrinhoMarginAmount)} − desconto ${brl(i.subrinhoDiscount)}`, value: brl(i.subrinhoRevenue), kind: "strong" },
    { step: "Comissão do afiliado", formula: `margem ${brl(i.affiliateMarginAmount)} − desconto ${brl(i.affiliateDiscount)}`, value: brl(i.affiliateCommission), kind: "strong" },
    {
      step: "Margens efetivas",
      formula: "lucro ÷ preço de venda da camada, após descontos",
      value: (
        <span className="whitespace-nowrap">
          Subrinho {pct(i.effectiveSubrinhoMarginPct)} · Afiliado {pct(i.effectiveAffiliateMarginPct)}
        </span>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface/50 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Item {index + 1} · {CATEGORY_LABEL[i.category]} · {supplierName(i.supplierCode)}
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-ink">{i.title}</h3>
          {i.subtitle && <p className="text-sm text-muted">{i.subtitle}</p>}
          <p className="mt-1 text-xs text-muted">
            {[
              i.location,
              i.serviceDate ? (i.serviceEndDate ? `${date(i.serviceDate)} a ${date(i.serviceEndDate)}` : date(i.serviceDate)) : null,
              paxSummary(i.pax),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted">Valor cobrado</p>
          <p className="text-xl font-semibold tabular text-brand-ink">{brl(i.chargedAmount)}</p>
          {check.ok ? (
            <Badge tone="success" className="mt-1">
              Conta conferida
            </Badge>
          ) : (
            <Badge tone="danger" className="mt-1">
              Divergência
            </Badge>
          )}
        </div>
      </div>
      {!check.ok && check.detail && <p className="border-b border-line bg-red-50 px-5 py-2 text-xs font-semibold text-red-800">Recalculo do item: {check.detail}</p>}

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Cálculo do preço do item {i.title}</caption>
          <thead className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-5 py-2.5">
                Etapa
              </th>
              <th scope="col" className="px-5 py-2.5">
                Cálculo / origem
              </th>
              <th scope="col" className="px-5 py-2.5 text-right">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={idx}
                className={cn(
                  "border-b border-line/60 last:border-0",
                  r.kind === "result" && "bg-surface/50",
                  r.kind === "brand" && "bg-brand-50/70",
                )}
              >
                <th scope="row" className={cn("px-5 py-2 text-left font-semibold", r.kind === "muted" ? "pl-8 text-muted" : "text-ink")}>
                  {r.step}
                </th>
                <td className="px-5 py-2 text-xs text-muted">{r.formula}</td>
                <td
                  className={cn(
                    "whitespace-nowrap px-5 py-2 text-right tabular",
                    r.kind === "strong" && "font-semibold text-ink",
                    r.kind === "result" && "font-semibold text-ink",
                    r.kind === "brand" && "font-semibold text-brand-700",
                    r.kind === "minus" && "font-semibold text-red-700",
                    r.kind === "muted" && "text-muted",
                    !r.kind && "font-semibold text-ink",
                  )}
                >
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CardBody className="space-y-3 border-t border-line">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Fornecedor</dt>
            <dd className="font-semibold">
              {supplierName(i.supplierCode)} <span className="text-xs text-muted">({i.supplierCode})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Produto / opção</dt>
            <dd className="break-all font-mono text-xs">
              {i.productId}
              {i.optionId ? ` / ${i.optionId}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Cotação (quoteRef)</dt>
            <dd className="break-all font-mono text-xs">{i.supplierQuoteRef ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Reserva (bookingRef)</dt>
            <dd className="break-all font-mono text-xs">
              {i.supplierBookingRef ?? "-"}{" "}
              {i.supplierStatus && (
                <Badge tone={i.supplierStatus === "CONFIRMED" ? "success" : ["BOOKING_FAILED", "REJECTED", "CANCELLED"].includes(i.supplierStatus) ? "danger" : "warning"} className="ml-1">
                  {i.supplierStatus}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {booking && (
          <SupplierBookingPanel item={i} live={booking.live} orderPaid={booking.orderPaid} canAct={booking.canAct} canSimulateCancel={booking.canSimulateCancel} simulatedPayment={booking.simulatedPayment} />
        )}
        <div className="grid gap-2 md:grid-cols-2">
          <JsonDetails label="Resposta do fornecedor (payload)" value={i.supplierPayload} />
          <JsonDetails label="Detalhes do item" value={i.details} />
        </div>
      </CardBody>
    </Card>
  );
}
