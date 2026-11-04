/**
 * Carrinho.
 * - Um carrinho NUNCA expira. Itens cuja data já passou são removidos (status EXPIRED) e o
 *   usuário é avisado; os demais itens permanecem.
 * - Todo carrinho pode ser compartilhado pelo link /loja/<slug>/carrinho/<token>.
 *   Se o usuário estiver logado ao criar, o carrinho fica vinculado a ele (quem gerou).
 * - Cada acesso é registrado (cart_views) e contado (carts.view_count).
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { cartCoupons, cartItems, carts, cartViews, coupons, type CouponIssuer, type PaxConfig, type UserType } from "@/server/db/schema";
import { checkCouponValidity, computeCoupon, type CouponDef } from "@/server/coupons/engine";
import { minSellPriceOf, priceCart, type PricedCart } from "@/server/pricing/cart-pricing";
import { loadPricingContext } from "@/server/pricing/context";
import { d } from "@/server/pricing/money";
import { getSettings } from "@/server/settings";
import { getAdapter } from "@/server/suppliers/registry";
import { SupplierError, SupplierIntegrationError, type Quote } from "@/server/suppliers/types";
import { shortCode, sha256 } from "@/lib/random";

export class CartError extends Error {}

export type CartActor =
  | { type: "CUSTOMER"; id: string }
  | { type: "AFFILIATE"; id: string; adminMode?: boolean }
  | { type: "ANONYMOUS" };

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;

export async function createCart(tx: Tx, affiliateId: string, actor: CartActor): Promise<Cart> {
  const [cart] = await tx
    .insert(carts)
    .values({
      token: shortCode(12),
      affiliateId,
      createdByType: actor.type === "ANONYMOUS" ? null : (actor.type as UserType),
      createdByCustomerId: actor.type === "CUSTOMER" ? actor.id : null,
      createdByAffiliateUserId: actor.type === "AFFILIATE" ? actor.id : null,
    })
    .returning();
  return cart;
}

export async function getCartByToken(tx: Tx, token: string, affiliateId?: string): Promise<Cart | null> {
  const [cart] = await tx
    .select()
    .from(carts)
    .where(affiliateId ? and(eq(carts.token, token), eq(carts.affiliateId, affiliateId)) : eq(carts.token, token));
  return cart ?? null;
}

/** Carrinho atual do visitante (pelo token no cookie) ou um novo, se não existir/já foi pago. */
export async function getOrCreateOpenCart(tx: Tx, affiliateId: string, token: string | null, actor: CartActor) {
  if (token) {
    const cart = await getCartByToken(tx, token, affiliateId);
    if (cart && cart.status === "OPEN") {
      // Carrinho criado deslogado e o usuário logou depois: registra quem gerou.
      if (!cart.createdByType && actor.type !== "ANONYMOUS") {
        await tx
          .update(carts)
          .set({
            createdByType: actor.type,
            createdByCustomerId: actor.type === "CUSTOMER" ? actor.id : null,
            createdByAffiliateUserId: actor.type === "AFFILIATE" ? actor.id : null,
          })
          .where(eq(carts.id, cart.id));
      }
      return cart;
    }
  }
  return createCart(tx, affiliateId, actor);
}

function assertOpen(cart: Cart) {
  if (cart.status !== "OPEN") throw new CartError("Este carrinho já foi pago e não pode mais ser alterado");
}

export async function addQuoteToCart(tx: Tx, cart: Cart, q: Quote): Promise<CartItem> {
  assertOpen(cart);
  if (q.expiresAt && q.expiresAt <= new Date()) throw new CartError("A data deste serviço já passou");
  // tarifa zerada no fornecedor (produto sem preço para a data): não entra no carrinho
  if (!q.lines.length || q.lines.reduce((sum, l) => sum + Number(l.unitCost) * l.quantity, 0) <= 0)
    throw new CartError("Este produto está sem preço para a data escolhida. Escolha outra data ou outra opção.");
  const [item] = await tx
    .insert(cartItems)
    .values({
      cartId: cart.id,
      category: q.category,
      supplierCode: q.supplierCode,
      productId: q.productId,
      optionId: q.optionId,
      title: q.title,
      subtitle: q.subtitle,
      imageUrl: q.imageUrl,
      location: q.location,
      serviceDate: q.serviceDate,
      serviceEndDate: q.serviceEndDate,
      expiresAt: q.expiresAt,
      pax: q.pax,
      lines: q.lines,
      costCurrency: q.currency,
      details: { ...q.details, paxRules: q.paxRules },
      supplierQuoteRef: q.quoteRef,
    })
    .returning();
  await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
  return item;
}

/** Remove (status EXPIRED) os itens cuja data já passou, mantendo os demais. */
export async function sweepExpiredItems(tx: Tx, cartId: string, now = new Date()): Promise<CartItem[]> {
  return tx
    .update(cartItems)
    .set({ status: "EXPIRED", statusReason: "A data do serviço já passou", statusChangedAt: now, noticeAcknowledged: false })
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.status, "ACTIVE"), lte(cartItems.expiresAt, now)))
    .returning();
}

export async function acknowledgeNotices(tx: Tx, cartId: string) {
  await tx
    .update(cartItems)
    .set({ noticeAcknowledged: true })
    .where(and(eq(cartItems.cartId, cartId), inArray(cartItems.status, ["EXPIRED", "UNAVAILABLE"])));
}

export async function removeItem(tx: Tx, cart: Cart, itemId: string) {
  assertOpen(cart);
  await tx
    .update(cartItems)
    .set({ status: "REMOVED", statusChangedAt: new Date(), noticeAcknowledged: true })
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
}

async function getItem(tx: Tx, cart: Cart, itemId: string): Promise<CartItem> {
  const [item] = await tx.select().from(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  if (!item || item.status !== "ACTIVE") throw new CartError("Item não encontrado no carrinho");
  return item;
}

/** Altera quantidades (ex.: +1 adulto/criança na Disney) buscando o preço correto na API do fornecedor. */
export async function changeItemPax(tx: Tx, cart: Cart, itemId: string, pax: PaxConfig): Promise<CartItem> {
  assertOpen(cart);
  const item = await getItem(tx, cart, itemId);
  const adapter = getAdapter(item.supplierCode);
  let q: Quote;
  try {
    q = await adapter.quote({
      productId: item.productId,
      optionId: item.optionId,
      date: item.category === "TICKETS" ? item.serviceDate ?? undefined : undefined,
      checkIn: item.serviceDate ?? undefined,
      checkOut: item.serviceEndDate ?? undefined,
      startDate: item.serviceDate ?? undefined,
      endDate: item.serviceEndDate ?? undefined,
      pax,
    });
  } catch (e) {
    if (e instanceof SupplierIntegrationError) {
      console.error("[carrinho] fornecedor:", e.message, e.detail ?? "");
      throw new CartError("Não conseguimos consultar o fornecedor agora. Tente novamente em instantes.");
    }
    if (e instanceof SupplierError) throw new CartError(e.message);
    throw e;
  }
  const [updated] = await tx
    .update(cartItems)
    .set({
      pax: q.pax,
      lines: q.lines,
      costCurrency: q.currency,
      subtitle: q.subtitle,
      details: { ...q.details, paxRules: q.paxRules },
      supplierQuoteRef: q.quoteRef,
      quotedAt: new Date(),
    })
    .where(eq(cartItems.id, item.id))
    .returning();
  await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
  return updated;
}

/** Margem do afiliado alterada somente neste carrinho (usuário ADMIN da agência, no checkout). */
export async function setAffiliateMarginOverride(
  tx: Tx,
  cart: Cart,
  itemId: string,
  pct: string | null,
  affiliateUser: { id: string; affiliateId: string; role: string },
) {
  assertOpen(cart);
  if (affiliateUser.affiliateId !== cart.affiliateId || affiliateUser.role !== "ADMIN")
    throw new CartError("Somente o ADMIN da agência pode alterar a margem");
  await getItem(tx, cart, itemId);
  if (pct !== null) {
    const v = d(pct);
    const s = await getSettings(tx);
    if (v.isNaN() || v.lt(0)) throw new CartError("A margem não pode ser menor que 0%");
    if (v.gt(d(s.maxAffiliateMarginPct))) throw new CartError(`A margem máxima permitida é ${s.maxAffiliateMarginPct}%`);
  }
  await tx
    .update(cartItems)
    .set({
      affiliateMarginOverridePct: pct === null ? null : d(pct).toFixed(4),
      overrideByAffiliateUserId: pct === null ? null : affiliateUser.id,
      overrideAt: pct === null ? null : new Date(),
    })
    .where(eq(cartItems.id, itemId));
}

// ───────────── Cupons ─────────────

export function toCouponDef(c: typeof coupons.$inferSelect): CouponDef {
  return {
    id: c.id,
    code: c.code,
    issuer: c.issuer,
    affiliateId: c.affiliateId,
    discountType: c.discountType,
    percentOff: c.percentOff,
    amountOff: c.amountOff,
    stepAmount: c.stepAmount,
    maxDiscount: c.maxDiscount,
    minSubtotal: c.minSubtotal,
    categories: c.categories,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    maxRedemptions: c.maxRedemptions,
    redemptions: c.redemptions,
    active: c.active,
    description: c.description,
  };
}

export async function findCouponForStore(tx: Tx, affiliateId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const rows = await tx
    .select()
    .from(coupons)
    .where(and(eq(coupons.code, code), inArray(coupons.scopeKey, [affiliateId, "SUBRINHO"])));
  // Cupom do próprio afiliado tem prioridade sobre um homônimo da Subrinho.
  return rows.find((r) => r.scopeKey === affiliateId) ?? rows.find((r) => r.scopeKey === "SUBRINHO") ?? null;
}

export async function applyCouponToCart(tx: Tx, cart: Cart, rawCode: string) {
  assertOpen(cart);
  const coupon = await findCouponForStore(tx, cart.affiliateId, rawCode);
  if (!coupon) throw new CartError("Cupom não encontrado");
  const def = toCouponDef(coupon);
  const valid = checkCouponValidity(def, { affiliateId: cart.affiliateId, now: new Date() });
  if (!valid.ok) throw new CartError(valid.reason);

  const priced = await priceCartById(tx, cart, { [coupon.issuer]: def });
  const res = priced.cart.coupons[coupon.issuer];
  if (!res || res.total.lte(0)) throw new CartError(res?.notApplied ?? "Cupom não se aplica a este carrinho");

  await tx.delete(cartCoupons).where(and(eq(cartCoupons.cartId, cart.id), eq(cartCoupons.layer, coupon.issuer)));
  await tx.insert(cartCoupons).values({ cartId: cart.id, couponId: coupon.id, layer: coupon.issuer });
  return res;
}

export async function removeCouponFromCart(tx: Tx, cart: Cart, layer: CouponIssuer) {
  await tx.delete(cartCoupons).where(and(eq(cartCoupons.cartId, cart.id), eq(cartCoupons.layer, layer)));
}

// ───────────── Leitura com preço ─────────────

export type CouponNotice = { layer: CouponIssuer; code: string; message: string };

export async function loadCartCoupons(tx: Tx, cart: Cart) {
  const rows = await tx
    .select({ layer: cartCoupons.layer, coupon: coupons })
    .from(cartCoupons)
    .innerJoin(coupons, eq(coupons.id, cartCoupons.couponId))
    .where(eq(cartCoupons.cartId, cart.id));
  const active: { SUBRINHO?: CouponDef; AFFILIATE?: CouponDef } = {};
  const notices: CouponNotice[] = [];
  for (const r of rows) {
    const def = toCouponDef(r.coupon);
    const v = checkCouponValidity(def, { affiliateId: cart.affiliateId, now: new Date() });
    if (v.ok) active[r.layer] = def;
    else notices.push({ layer: r.layer, code: def.code, message: v.reason });
  }
  return { active, notices };
}

export async function listItems(tx: Tx, cartId: string) {
  return tx.select().from(cartItems).where(eq(cartItems.cartId, cartId)).orderBy(asc(cartItems.createdAt));
}

export async function priceCartById(
  tx: Tx,
  cart: Cart,
  couponOverride?: { SUBRINHO?: CouponDef; AFFILIATE?: CouponDef },
): Promise<{ cart: PricedCart; items: CartItem[]; coupons: { SUBRINHO?: CouponDef; AFFILIATE?: CouponDef }; couponNotices: CouponNotice[] }> {
  const items = (await listItems(tx, cart.id)).filter((i) => i.status === "ACTIVE");
  const ctx = await loadPricingContext(tx, cart.affiliateId);
  const loaded = await loadCartCoupons(tx, cart);
  const activeCoupons = { ...loaded.active, ...couponOverride };
  const priced = priceCart(
    ctx,
    items.map((i) => ({
      id: i.id,
      category: i.category,
      supplierCode: i.supplierCode,
      productId: i.productId,
      optionId: i.optionId,
      costCurrency: i.costCurrency,
      lines: i.lines,
      affiliateMarginOverridePct: i.affiliateMarginOverridePct,
      minSellPrice: minSellPriceOf(i.details),
    })),
    activeCoupons,
  );
  for (const layer of ["SUBRINHO", "AFFILIATE"] as const) {
    const r = priced.coupons[layer];
    if (r?.notApplied) loaded.notices.push({ layer, code: r.coupon.code, message: r.notApplied });
  }
  return { cart: priced, items, coupons: activeCoupons, couponNotices: loaded.notices };
}

/** Carrega o carrinho completo para exibição: varre itens vencidos e calcula preços. */
export async function loadCartView(tx: Tx, token: string, affiliateId: string) {
  const cart = await getCartByToken(tx, token, affiliateId);
  if (!cart) return null;
  if (cart.status === "OPEN") await sweepExpiredItems(tx, cart.id);
  const all = await listItems(tx, cart.id);
  const removedNotices = all.filter((i) => (i.status === "EXPIRED" || i.status === "UNAVAILABLE") && !i.noticeAcknowledged);
  const p = await priceCartById(tx, cart);
  return { cart, priced: p.cart, items: p.items, coupons: p.coupons, couponNotices: p.couponNotices, removedNotices, allItems: all };
}

// ───────────── Acessos ─────────────

export async function recordCartView(
  tx: Tx,
  cart: Cart,
  v: { page: string; viewerType?: UserType | null; viewerId?: string | null; visitorId?: string | null; ip?: string | null; userAgent?: string | null },
) {
  await tx.insert(cartViews).values({
    cartId: cart.id,
    page: v.page,
    viewerType: v.viewerType ?? null,
    viewerId: v.viewerId ?? null,
    visitorId: v.visitorId ?? null,
    ipHash: v.ip ? sha256(`${v.ip}|subrinho`).slice(0, 32) : null,
    userAgent: v.userAgent?.slice(0, 300) ?? null,
  });
  await tx
    .update(carts)
    .set({ viewCount: sql`${carts.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(carts.id, cart.id));
}
