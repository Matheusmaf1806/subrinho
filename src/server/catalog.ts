/** Busca e detalhe de produtos agregando fornecedores, já com o preço da loja do afiliado. */
import { eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { suppliers, type Category } from "@/server/db/schema";
import { quoteDisplayPrice, type PricingContext } from "@/server/pricing/cart-pricing";
import { mediaUrl, mediaUrls } from "@/server/media";
import { stripSupplierMentions, stripSupplierMentionsList } from "@/lib/supplier-names";
import { noEmDash } from "@/lib/text";
import { adaptersFor, getAdapter } from "@/server/suppliers/registry";
import { SupplierError, type HotelContent, type OfferOption, type ProductDetail, type ProductSummary, type SearchParams } from "@/server/suppliers/types";
import type { Decimal } from "@/server/pricing/money";
import type { InstallmentPlan } from "@/server/pricing/engine";

export type DisplayPrice = { pix: Decimal; installment: Decimal; plan: InstallmentPlan; commission?: { amount: Decimal; pct: Decimal } };

/**
 * O que a loja mostra a mais para quem está logado com permissão (decidido no servidor, ver
 * storeInsight): fornecedor de cada oferta (equipe Subrinho) e comissão da agência (ADMIN dela).
 * Sem permissão, os campos nem entram nos dados da página.
 */
export type Reveal = { supplier: boolean; commission: boolean };
const NO_REVEAL: Reveal = { supplier: false, commission: false };
/** revealSupplier: nome do fornecedor, só quando Reveal.supplier (equipe Subrinho). */
export type PricedSummary = ProductSummary & { price: DisplayPrice; offers: number; revealSupplier?: string };
export type PricedOption = OfferOption & { supplierCode: string; productId: string; price: DisplayPrice | null; revealSupplier?: string };
/** price = null quando o produto existe mas não há disponibilidade para os parâmetros (ex.: hotel lotado). */
export type PricedDetail = Omit<ProductDetail, "options"> & { price: DisplayPrice | null; options: PricedOption[] };

export async function activeSupplierCodes(tx: Tx): Promise<Set<string>> {
  const rows = await tx.select({ code: suppliers.code }).from(suppliers).where(eq(suppliers.active, true));
  return new Set(rows.map((r) => r.code));
}

function priceOf(ctx: PricingContext, s: { category: Category; supplierCode: string; productId: string }, optionId: string | null, o: Pick<OfferOption, "currency" | "lines" | "minSellPrice">, reveal: Reveal = NO_REVEAL) {
  try {
    return quoteDisplayPrice(ctx, { ...s, optionId }, o.currency, o.lines, o.minSellPrice, { commission: reveal.commission });
  } catch {
    return null;
  }
}

export async function searchCatalog(
  tx: Tx,
  ctx: PricingContext,
  category: Category,
  params: SearchParams,
  opts: { onError?: (supplierCode: string, error: unknown) => void; reveal?: Reveal } = {},
): Promise<PricedSummary[]> {
  const reveal = opts.reveal ?? NO_REVEAL;
  const active = await activeSupplierCodes(tx);
  const results = await Promise.all(
    adaptersFor(category, active).map((a) =>
      a.search(params).catch((e) => {
        if (!(e instanceof SupplierError)) console.error(`[busca] ${a.code}:`, e);
        else if (e.message && !/^Informe|^Escolha|^Cada quarto|^O check|^Estadias/.test(e.message)) console.warn(`[busca] ${a.code}: ${e.message}`);
        opts.onError?.(a.code, e);
        return [] as ProductSummary[];
      }),
    ),
  );
  const priced: PricedSummary[] = [];
  for (const s of results.flat()) {
    const price = priceOf(ctx, s, null, s, reveal);
    // sem tarifa (preço zero) não dá para vender: fica fora da vitrine e da busca
    if (price && price.pix.gt(0)) priced.push({ ...s, price, offers: 1, ...(reveal.supplier ? { revealSupplier: s.supplierName } : {}) });
  }
  // Mesmo hotel em vários fornecedores → mostra o menor preço.
  const grouped = new Map<string, PricedSummary>();
  for (const p of priced) {
    const key = p.groupKey ?? `${p.supplierCode}:${p.productId}`;
    const cur = grouped.get(key);
    if (!cur) grouped.set(key, p);
    else {
      const best = p.price.pix.lt(cur.price.pix) ? p : cur;
      grouped.set(key, { ...best, offers: cur.offers + 1 });
    }
  }
  // fotos pelo domínio da loja (o endereço original revela o fornecedor)
  return [...grouped.values()].sort((a, b) => a.price.pix.comparedTo(b.price.pix)).map((p) => ({ ...p, title: noEmDash(p.title), subtitle: noEmDash(p.subtitle), location: noEmDash(p.location), imageUrl: mediaUrl(p.imageUrl) }));
}

export async function getProductDetail(
  tx: Tx,
  ctx: PricingContext,
  supplierCode: string,
  productId: string,
  params: SearchParams,
  opts: { reveal?: Reveal } = {},
): Promise<PricedDetail | null> {
  const reveal = opts.reveal ?? NO_REVEAL;
  const supplierLabel = (code: string) => (reveal.supplier ? { revealSupplier: getAdapter(code).name } : {});
  const active = await activeSupplierCodes(tx);
  if (!active.has(supplierCode)) return null;
  const adapter = getAdapter(supplierCode);
  const detail = await adapter.getProduct(productId, params);
  if (!detail) return null;

  let options: PricedOption[] = detail.options.map((o) => ({
    ...o,
    supplierCode,
    productId: detail.productId,
    price: priceOf(ctx, detail, o.optionId, o, reveal),
    ...supplierLabel(supplierCode),
  }));

  // Hotel vendido por outros fornecedores: junta as opções e mantém a mais barata por quarto/regime.
  if (detail.groupKey) {
    for (const other of adaptersFor(detail.category, active)) {
      if (other.code === supplierCode) continue;
      const list = await other.search({ ...params, destination: detail.destination }).catch(() => []);
      const twin = list.find((x) => x.groupKey === detail.groupKey);
      if (!twin) continue;
      const od = await other.getProduct(twin.productId, params).catch(() => null);
      if (!od) continue;
      options.push(
        ...od.options.map((o) => ({ ...o, supplierCode: other.code, productId: od.productId, price: priceOf(ctx, od, o.optionId, o, reveal), ...supplierLabel(other.code) })),
      );
    }
    const byTitle = new Map<string, PricedOption>();
    for (const o of options) {
      const cur = byTitle.get(o.title);
      if (!cur || (o.price && (!cur.price || o.price.pix.lt(cur.price.pix)))) byTitle.set(o.title, o);
    }
    options = [...byTitle.values()];
  }
  options.sort((a, b) => (a.price && b.price ? a.price.pix.comparedTo(b.price.pix) : a.price ? -1 : 1));
  const price = detail.lines.length ? priceOf(ctx, detail, null, detail, reveal) : null;
  // hospedagem/casa sem disponibilidade nas datas: a página aparece com o motivo (sem preço)
  const unavailable = options.length === 0 || options.every((o) => !o.available);
  if (!price && !((detail.category === "LODGING" || detail.category === "HOUSES" || detail.category === "TICKETS") && unavailable)) return null;
  return {
    ...detail,
    title: noEmDash(detail.title),
    subtitle: noEmDash(detail.subtitle),
    location: noEmDash(detail.location),
    description: stripSupplierMentions(detail.description),
    highlights: detail.highlights.map((h) => noEmDash(h)),
    info: detail.info.map((i) => ({ ...i, value: noEmDash(i.value) })),
    imageUrl: mediaUrl(detail.imageUrl),
    gallery: detail.gallery ? mediaUrls(detail.gallery) : undefined,
    price,
    options: options.map((o) => ({
      ...o,
      title: noEmDash(o.title),
      description: noEmDash(o.description),
      attributes: o.attributes?.map((a) => ({ ...a, value: noEmDash(a.value) })),
      notes: o.notes ? stripSupplierMentionsList(o.notes) : o.notes,
      room: o.room ? { ...o.room, photos: mediaUrls(o.room.photos), amenities: stripSupplierMentionsList(o.room.amenities) } : o.room,
    })),
    hotel: detail.hotel ? hotelForStore(detail.hotel) : detail.hotel,
  };
}

/** Conteúdo do hotel pelo domínio da loja: fotos cifradas e textos sem o nome do fornecedor. */
function hotelForStore(h: HotelContent): HotelContent {
  return {
    ...h,
    photos: h.photos.flatMap((p) => {
      const url = mediaUrl(p.url);
      return url ? [{ url, tag: p.tag }] : [];
    }),
    about: h.about.map((a) => ({ ...a, text: stripSupplierMentions(a.text) })).filter((a) => a.text),
    amenities: h.amenities.map((g) => ({ ...g, items: stripSupplierMentionsList(g.items) })).filter((g) => g.items.length),
    roomAmenities: stripSupplierMentionsList(h.roomAmenities),
    nearby: h.nearby.filter((n) => stripSupplierMentions(n.name)).map((n) => ({ ...n, name: noEmDash(n.name) })),
    policies: h.policies.map((p) => ({ ...p, items: stripSupplierMentionsList(p.items) })).filter((p) => p.items.length),
    issues: h.issues.map((i) => ({ ...i, text: stripSupplierMentions(i.text) })).filter((i) => i.text),
  };
}
