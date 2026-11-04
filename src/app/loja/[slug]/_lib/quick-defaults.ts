/**
 * Padrões do "Adicionar ao carrinho" rápido: datas e pessoas que o cliente já usa no carrinho (o item
 * mais recente manda) e, sem carrinho, os da busca atual. Também usado pelas sugestões do carrinho.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { cartItems, carts, type Category, type PaxConfig } from "@/server/db/schema";
import { addDays } from "@/lib/tz";
import type { SearchDefaults } from "../_components/search-forms";
import { currentCartToken, type Store } from "./store";

export type QuickDefaults = { date: string; checkin: string; checkout: string; adults: number; children: number; ages: number[]; rooms: number; fromCart: boolean };

export type OpenCartItem = {
  category: Category;
  supplierCode: string;
  productId: string;
  destination: string | null;
  serviceDate: string | null;
  serviceEndDate: string | null;
  pax: PaxConfig;
};

/** Itens ativos do carrinho aberto desta loja, do mais recente para o mais antigo. */
export async function openCartItems(store: Store): Promise<OpenCartItem[]> {
  const token = await currentCartToken(store).catch(() => null);
  if (!token) return [];
  return db
    .select({
      category: cartItems.category,
      supplierCode: cartItems.supplierCode,
      productId: cartItems.productId,
      destination: cartItems.destination,
      serviceDate: cartItems.serviceDate,
      serviceEndDate: cartItems.serviceEndDate,
      pax: cartItems.pax,
    })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(and(eq(carts.token, token), eq(carts.affiliateId, store.id), eq(carts.status, "OPEN"), eq(cartItems.status, "ACTIVE")))
    .orderBy(desc(cartItems.createdAt))
    .limit(20)
    .catch(() => []);
}

/** Noites sugeridas quando só há ingresso no carrinho (hotel em volta da visita). */
const STAY_AROUND_TICKET = 3;

export async function quickDefaults(
  store: Store,
  d: Required<SearchDefaults>,
  minDate: string,
  opts: { items?: OpenCartItem[]; stayFromTicket?: boolean } = {},
): Promise<QuickDefaults> {
  const base: QuickDefaults = { date: d.data, checkin: d.checkin, checkout: d.checkout, adults: Math.max(1, d.adultos), children: d.criancas, ages: d.criancas ? d.idades : [], rooms: d.quartos, fromCart: false };
  const items = opts.items ?? (await openCartItems(store));
  if (!items.length) return base;
  const out = { ...base, fromCart: true };
  const ok = (v: string | null | undefined) => !!v && v >= minDate;
  const stay = items.find((i) => (i.category === "LODGING" || i.category === "HOUSES") && ok(i.serviceDate) && ok(i.serviceEndDate));
  const ticket = items.find((i) => i.category === "TICKETS" && ok(i.serviceDate));
  if (stay) {
    out.checkin = stay.serviceDate!;
    out.checkout = stay.serviceEndDate!;
  } else if (ticket && opts.stayFromTicket) {
    // só ingresso: hospedagem chegando um dia antes da visita
    const before = addDays(ticket.serviceDate!, -1);
    out.checkin = before >= minDate ? before : minDate;
    out.checkout = addDays(out.checkin, STAY_AROUND_TICKET);
  }
  // ingresso: a mesma data de outro ingresso; senão, o 1º dia da hospedagem
  out.date = ticket?.serviceDate ?? (stay ? addDays(stay.serviceDate!, 1) : base.date);
  if (stay && out.date >= out.checkout) out.date = out.checkin;
  const pax = items[0].pax;
  if (pax?.adults) {
    out.adults = pax.adults;
    out.children = pax.children ?? 0;
    out.ages = (pax.childrenAges ?? []).slice(0, out.children);
    while (out.ages.length < out.children) out.ages.push(8);
    if (pax.rooms) out.rooms = pax.rooms;
  }
  return out;
}
