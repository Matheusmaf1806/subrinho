/**
 * "Complete sua viagem": depois de adicionar algo, sugere o que combina no mesmo destino e período.
 *
 *  - hotel ou casa no carrinho → 3 experiências na cidade, para os dias da estadia;
 *  - só ingresso → 3 hotéis na cidade, chegando um dia antes da visita (casas, se não houver hotel);
 *  - ingresso com estadia na mesma cidade → mais experiências.
 *
 * O destino vem do item mais recente. Nada que já está no carrinho volta como sugestão. Preços e
 * comissão seguem as mesmas regras da vitrine (reveal); as buscas usam o cache dos fornecedores.
 */
import "server-only";
import { db } from "@/server/db";
import { searchCatalog, type PricedSummary } from "@/server/catalog";
import type { Category } from "@/server/db/schema";
import { productRef } from "@/server/suppliers/refs";
import { date as fmtDate } from "@/lib/format";
import { addDays } from "@/lib/tz";
import { getStorePricing, type Store } from "./store";
import { storeInsight } from "./insight";
import { storeCategories } from "./categories";
import { openCartItems, quickDefaults, type OpenCartItem, type QuickDefaults } from "./quick-defaults";
import { lodgingQuery, parseSearch, supplierParams, toQuery } from "../_components/search-params";

type SellCategory = "TICKETS" | "LODGING" | "HOUSES";

export type CrossSellItem = {
  ref: string;
  category: SellCategory;
  title: string;
  imageUrl: string | null;
  place: string | null;
  stars: number | null;
  pix: string;
  installment: string;
  /** Ingresso: por adulto; hotel/casa: total da estadia. */
  per: "adult" | "stay";
  href: string;
  /** Só para quem pode ver (ver insight.ts). */
  commission?: string;
  supplier?: string;
};

export type CrossSell = {
  category: SellCategory;
  /** Cidade como aparece para o cliente (ex.: "Paris"). */
  destination: string;
  heading: string;
  lead: string;
  items: CrossSellItem[];
  more: { href: string; label: string };
  /** Datas e pessoas já preenchidas no "Adicionar". */
  defaults: QuickDefaults;
  minDate: string;
  /** Outras categorias que fecham a viagem (seguro, chip) e ainda não estão no carrinho. */
  extras: { label: string; href: string }[];
};

export const CROSS_SELL_COUNT = 3;

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(",")[0]
    .trim();
const isStay = (c: Category) => c === "LODGING" || c === "HOUSES";
const sellable = (c: Category): c is SellCategory => c === "TICKETS" || isStay(c);

/** O que sugerir, dado o carrinho: a categoria que falta para a viagem do item mais recente. */
export function crossSellTarget(items: Pick<OpenCartItem, "category" | "destination">[], live: Set<Category>): { anchor: number; order: SellCategory[] } | null {
  const anchor = items.findIndex((i) => !!i.destination && sellable(i.category));
  if (anchor < 0) return null;
  const a = items[anchor];
  const here = fold(a.destination!);
  const stayHere = items.some((i) => isStay(i.category) && !!i.destination && fold(i.destination) === here);
  const order: SellCategory[] = a.category === "TICKETS" && !stayHere ? ["LODGING", "HOUSES"] : ["TICKETS"];
  const ok = order.filter((c) => live.has(c));
  return ok.length ? { anchor, order: ok } : null;
}

/** Os melhores para sugerir: avaliação primeiro; hotéis de 3 estrelas ou mais pelo melhor preço. */
export function rankCrossSell(list: PricedSummary[], category: SellCategory, count = CROSS_SELL_COUNT): PricedSummary[] {
  const price = (p: PricedSummary) => Number(p.price.pix.toString());
  if (category === "LODGING") {
    const good = list.filter((p) => (p.stars ?? 0) >= 3);
    const pool = good.length >= count ? good : list;
    return [...pool].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || price(a) - price(b)).slice(0, count);
  }
  // ingressos e casas: a ordem do fornecedor (mais procurados) desempata a avaliação
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.rating ?? 0) - (a.p.rating ?? 0) || a.i - b.i)
    .slice(0, count)
    .map((x) => x.p);
}

export async function crossSellFor(store: Store): Promise<CrossSell | null> {
  const items = await openCartItems(store);
  if (!items.length) return null;
  const cats = await storeCategories();
  const live = new Set(cats.live.map((c) => c.category));
  const target = crossSellTarget(items, live);
  if (!target) return null;
  const anchor = items[target.anchor];
  const destination = anchor.destination!.split(",")[0].trim();

  const { d: base, minDate } = parseSearch({});
  const defaults = await quickDefaults(store, base, minDate, { items, stayFromTicket: true });
  const { d } = parseSearch({
    destino: destination,
    data: defaults.date,
    checkin: defaults.checkin,
    checkout: defaults.checkout,
    adultos: String(defaults.adults),
    criancas: String(defaults.children),
    idades: defaults.ages.join(","),
    quartos: String(defaults.rooms),
  });
  const [ctx, reveal] = await Promise.all([getStorePricing(store.id), storeInsight(store.id)]);
  const inCart = new Set(items.map((i) => `${i.supplierCode}:${i.productId}`));

  let category: SellCategory | null = null;
  let picked: PricedSummary[] = [];
  for (const c of target.order) {
    const kind = c === "TICKETS" ? "tickets" : c === "LODGING" ? "lodging" : "houses";
    const found = await searchCatalog(db, ctx, c, supplierParams(d, kind), { reveal }).catch(() => [] as PricedSummary[]);
    picked = rankCrossSell(
      found.filter((p) => !inCart.has(`${p.supplierCode}:${p.productId}`)),
      c,
    );
    if (picked.length) {
      category = c;
      break;
    }
  }

  const b = `/loja/${store.slug}`;
  const inCartCats = new Set(items.map((i) => i.category));
  const extras = cats.live
    .filter((c) => (c.category === "INSURANCE" || c.category === "CHIP") && !inCartCats.has(c.category))
    .map((c) => ({ label: c.category === "INSURANCE" ? "Seguro viagem" : "Chip de internet", href: `${b}/${c.slug}` }));
  if (!category) return null;

  const ticketQuery = toQuery({ destino: destination, data: d.data, adultos: d.adultos, criancas: d.criancas });
  const stayQuery = category === "LODGING" ? lodgingQuery({ ...d, dest: "" }) : toQuery({ destino: destination, checkin: d.checkin, checkout: d.checkout, adultos: d.adultos, criancas: d.criancas });
  const path = category === "TICKETS" ? "ingressos" : category === "LODGING" ? "hospedagem" : "casas";
  const query = category === "TICKETS" ? ticketQuery : stayQuery;
  const period = `${fmtDate(d.checkin)} a ${fmtDate(d.checkout)}`;
  const stayInCart = items.some((i) => isStay(i.category));

  return {
    category,
    destination,
    heading: category === "TICKETS" ? `Experiências em ${destination}` : category === "LODGING" ? `Onde ficar em ${destination}` : `Casas em ${destination}`,
    lead:
      category === "TICKETS"
        ? stayInCart
          ? anchor.category === "TICKETS"
            ? "Mais para fazer na viagem"
            : "Para aproveitar a estadia"
          : "Para aproveitar a viagem"
        : stayInCart
          ? `${period}, as mesmas datas da sua estadia`
          : addDays(defaults.date, -1) === d.checkin
            ? `${period}, chegando na véspera da visita`
            : `${period}, nos dias da sua visita`,
    items: picked.map((p) => ({
      ref: productRef(p.supplierCode, p.productId),
      category: category!,
      title: p.title,
      imageUrl: p.imageUrl ?? null,
      place: p.area ?? p.location ?? null,
      stars: p.stars ?? null,
      pix: p.price.pix.toString(),
      installment: p.price.installment.toString(),
      per: category === "TICKETS" ? "adult" : "stay",
      href: `${b}/${path}/${productRef(p.supplierCode, p.productId)}?${query}`,
      ...(p.price.commission ? { commission: p.price.commission.amount.toString() } : {}),
      ...(p.revealSupplier ? { supplier: p.revealSupplier } : {}),
    })),
    more: { href: `${b}/${path}?${query}`, label: category === "TICKETS" ? `Ver todas as experiências em ${destination}` : category === "LODGING" ? `Ver todos os hotéis em ${destination}` : `Ver todas as casas em ${destination}` },
    defaults,
    minDate,
    extras,
  };
}
