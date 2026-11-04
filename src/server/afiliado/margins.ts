/**
 * Visão de margens para o Painel do Afiliado.
 *
 * - Junta as regras do afiliado com o catálogo de ingressos (produtos e tipos de ingresso)
 *   e calcula a margem efetiva de cada alvo ("a regra mais específica vence").
 * - NUNCA devolve fornecedor (nome ou código) para a página: cada produto/opção é identificado
 *   por uma chave opaca (`key`) que só o servidor sabe resolver (`resolveTicketTarget`).
 */
import { createHash } from "node:crypto";
import type { Tx } from "@/server/db";
import type { Category, MarginScope } from "@/server/db/schema";
import { listMarginRules } from "@/server/admin/margins";
import { activeSupplierCodes } from "@/server/catalog";
import { MarginBook, type MarginRuleLite } from "@/server/pricing/margins";
import { getSettings } from "@/server/settings";
import { adaptersFor } from "@/server/suppliers/registry";
import { ACTIVE_CATEGORIES } from "@/server/suppliers/types";

export type MarginSource = MarginScope | "FALLBACK";

export type EffectiveMargin = { pct: string; source: MarginSource };

type TicketCatalogEntry = {
  key: string;
  supplierCode: string;
  productId: string;
  title: string;
  subtitle: string | null;
  location: string;
  destination: string;
  options: { key: string; optionId: string; title: string; description: string | null }[];
};

function targetKey(supplierCode: string, productId: string, optionId?: string | null) {
  return createHash("sha256").update(`ticket|${supplierCode}|${productId}|${optionId ?? ""}`).digest("hex").slice(0, 20);
}

/** Catálogo de ingressos dos fornecedores ativos (uso interno do servidor). */
async function loadTicketCatalog(tx: Tx): Promise<TicketCatalogEntry[]> {
  const active = await activeSupplierCodes(tx);
  const perAdapter = await Promise.all(
    adaptersFor("TICKETS", active).map(async (a) => {
      try {
        const list = await a.search({});
        const details = await Promise.all(list.map((s) => a.getProduct(s.productId, {}).catch(() => null)));
        return list.map<TicketCatalogEntry>((s, i) => {
          const det = details[i];
          return {
            key: targetKey(a.code, s.productId),
            supplierCode: a.code,
            productId: s.productId,
            title: s.title,
            subtitle: s.subtitle ?? null,
            location: s.location,
            destination: s.destination,
            options: (det?.options ?? []).map((o) => ({
              key: targetKey(a.code, s.productId, o.optionId),
              optionId: o.optionId,
              title: o.title,
              description: o.description ?? null,
            })),
          };
        });
      } catch {
        return [];
      }
    }),
  );
  return perAdapter.flat().sort((x, y) => x.destination.localeCompare(y.destination, "pt-BR") || x.title.localeCompare(y.title, "pt-BR"));
}

/** Resolve a chave opaca de um ingresso/tipo de ingresso para o alvo da regra de margem. */
export async function resolveTicketTarget(tx: Tx, key: string) {
  const catalog = await loadTicketCatalog(tx);
  for (const p of catalog) {
    if (p.key === key) {
      return { scope: "PRODUCT" as const, supplierCode: p.supplierCode, productId: p.productId, optionId: null, label: p.title };
    }
    const o = p.options.find((x) => x.key === key);
    if (o) {
      return { scope: "PRODUCT_OPTION" as const, supplierCode: p.supplierCode, productId: p.productId, optionId: o.optionId, label: `${p.title} · ${o.title}` };
    }
  }
  return null;
}

export type RuleRef = { id: string; pct: string };

export type TicketOptionView = { key: string; title: string; description: string | null; rule: RuleRef | null; effective: EffectiveMargin };
export type TicketProductView = {
  key: string;
  title: string;
  subtitle: string | null;
  location: string;
  destination: string;
  rule: RuleRef | null;
  effective: EffectiveMargin;
  options: TicketOptionView[];
};

export type SpecificRuleView = {
  id: string;
  scope: MarginScope;
  title: string;
  optionTitle: string | null;
  pct: string;
  updatedAt: Date;
  /** Produto ainda existe no catálogo? */
  inCatalog: boolean;
};

export type CategoryMarginView = { category: Category; rule: RuleRef | null; effective: EffectiveMargin; inherited: EffectiveMargin };

export type AffiliateMarginOverview = {
  maxPct: string;
  fallbackPct: string;
  defaultRule: RuleRef | null;
  defaultEffective: EffectiveMargin;
  categories: CategoryMarginView[];
  tickets: TicketProductView[];
  specificRules: SpecificRuleView[];
};

/** Tudo que a página de margens precisa, sem nenhum dado de fornecedor. */
export async function affiliateMarginOverview(tx: Tx, affiliateId: string): Promise<AffiliateMarginOverview> {
  const [rules, s, catalog] = await Promise.all([listMarginRules(tx, "AFFILIATE", affiliateId), getSettings(tx), loadTicketCatalog(tx)]);
  const lite: MarginRuleLite[] = rules.map((r) => ({
    id: r.id,
    owner: r.owner,
    affiliateId: r.affiliateId,
    scope: r.scope,
    category: r.category,
    supplierCode: r.supplierCode,
    productId: r.productId,
    optionId: r.optionId,
    marginPct: r.marginPct,
    label: r.label,
  }));
  const book = new MarginBook(lite, { subrinho: s.fallbackSubrinhoMarginPct, affiliate: s.fallbackAffiliateMarginPct });

  const defaultRow = rules.find((r) => r.scope === "DEFAULT");
  const defaultEffective: EffectiveMargin = defaultRow
    ? { pct: defaultRow.marginPct, source: "DEFAULT" }
    : { pct: s.fallbackAffiliateMarginPct, source: "FALLBACK" };

  const categories = ACTIVE_CATEGORIES.map<CategoryMarginView>((category) => {
    const row = rules.find((r) => r.scope === "CATEGORY" && r.category === category);
    return {
      category,
      rule: row ? { id: row.id, pct: row.marginPct } : null,
      effective: row ? { pct: row.marginPct, source: "CATEGORY" } : defaultEffective,
      inherited: defaultEffective,
    };
  });

  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const ref = (id: string | null, scope: MarginScope): RuleRef | null => {
    if (!id) return null;
    const r = ruleById.get(id);
    return r && r.scope === scope ? { id: r.id, pct: r.marginPct } : null;
  };

  const tickets = catalog.map<TicketProductView>((p) => {
    const target = { category: "TICKETS" as const, supplierCode: p.supplierCode, productId: p.productId, optionId: null };
    const res = book.resolve("AFFILIATE", target, affiliateId);
    return {
      key: p.key,
      title: p.title,
      subtitle: p.subtitle,
      location: p.location,
      destination: p.destination,
      rule: res.scope === "PRODUCT" ? ref(res.ruleId, "PRODUCT") : null,
      effective: { pct: res.pct.toFixed(4), source: res.scope },
      options: p.options.map<TicketOptionView>((o) => {
        const r = book.resolve("AFFILIATE", { ...target, optionId: o.optionId }, affiliateId);
        return {
          key: o.key,
          title: o.title,
          description: o.description,
          rule: r.scope === "PRODUCT_OPTION" ? ref(r.ruleId, "PRODUCT_OPTION") : null,
          effective: { pct: r.pct.toFixed(4), source: r.scope },
        };
      }),
    };
  });

  const specificRules = rules
    .filter((r) => r.scope === "PRODUCT" || r.scope === "PRODUCT_OPTION" || r.scope === "SUPPLIER")
    .map<SpecificRuleView>((r) => {
      if (r.scope === "SUPPLIER") {
        return { id: r.id, scope: r.scope, title: "Regra especial (definida pela Subrinho)", optionTitle: null, pct: r.marginPct, updatedAt: r.updatedAt, inCatalog: true };
      }
      const p = catalog.find((c) => c.supplierCode === r.supplierCode && c.productId === r.productId);
      const o = r.scope === "PRODUCT_OPTION" ? p?.options.find((x) => x.optionId === r.optionId) : undefined;
      return {
        id: r.id,
        scope: r.scope,
        title: p?.title ?? r.label ?? "Ingresso",
        optionTitle: r.scope === "PRODUCT_OPTION" ? o?.title ?? r.label ?? "Tipo de ingresso" : null,
        pct: r.marginPct,
        updatedAt: r.updatedAt,
        inCatalog: !!p && (r.scope === "PRODUCT" || !!o),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR") || (a.optionTitle ?? "").localeCompare(b.optionTitle ?? "", "pt-BR"));

  return {
    maxPct: s.maxAffiliateMarginPct,
    fallbackPct: s.fallbackAffiliateMarginPct,
    defaultRule: defaultRow ? { id: defaultRow.id, pct: defaultRow.marginPct } : null,
    defaultEffective,
    categories,
    tickets,
    specificRules,
  };
}
