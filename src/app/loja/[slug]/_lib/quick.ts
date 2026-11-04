/**
 * Padrões do "Adicionar ao carrinho" rápido (cards da vitrine): datas e pessoas que o cliente já usa
 * no carrinho (o item mais recente manda) e, sem carrinho, os da busca atual.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { cartItems, carts, type PaxConfig } from "@/server/db/schema";
import { addDays } from "@/lib/tz";
import type { SearchDefaults } from "../_components/search-forms";
import { currentCartToken, type Store } from "./store";
import { addToCartAction, quickOptionsAction } from "../actions";
import type { QuickCtx } from "../_components/quick-add";

export type QuickDefaults = { date: string; checkin: string; checkout: string; adults: number; children: number; ages: number[]; rooms: number; fromCart: boolean };

export async function quickDefaults(store: Store, d: Required<SearchDefaults>, minDate: string): Promise<QuickDefaults> {
  const base: QuickDefaults = { date: d.data, checkin: d.checkin, checkout: d.checkout, adults: Math.max(1, d.adultos), children: d.criancas, ages: d.criancas ? d.idades : [], rooms: d.quartos, fromCart: false };
  const token = await currentCartToken(store).catch(() => null);
  if (!token) return base;
  const items = await db
    .select({ category: cartItems.category, serviceDate: cartItems.serviceDate, serviceEndDate: cartItems.serviceEndDate, pax: cartItems.pax })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(and(eq(carts.token, token), eq(carts.affiliateId, store.id), eq(carts.status, "OPEN")))
    .orderBy(desc(cartItems.createdAt))
    .limit(20)
    .catch(() => []);
  if (!items.length) return base;
  const out = { ...base, fromCart: true };
  const ok = (v: string | null | undefined) => !!v && v >= minDate;
  const stay = items.find((i) => (i.category === "LODGING" || i.category === "HOUSES") && ok(i.serviceDate) && ok(i.serviceEndDate));
  if (stay) {
    out.checkin = stay.serviceDate!;
    out.checkout = stay.serviceEndDate!;
  }
  const ticket = items.find((i) => i.category === "TICKETS" && ok(i.serviceDate));
  // ingresso: a mesma data de outro ingresso; senão, o 1º dia da hospedagem
  out.date = ticket?.serviceDate ?? (stay ? addDays(stay.serviceDate!, 1) : base.date);
  if (stay && out.date > out.checkout) out.date = out.checkin;
  const pax = items[0].pax as PaxConfig;
  if (pax?.adults) {
    out.adults = pax.adults;
    out.children = pax.children ?? 0;
    out.ages = (pax.childrenAges ?? []).slice(0, out.children);
    while (out.ages.length < out.children) out.ages.push(8);
    if (pax.rooms) out.rooms = pax.rooms;
  }
  return out;
}

/** Tudo que o card precisa para o adicionar rápido (ações já presas à loja + padrões). */
export async function quickContext(store: Store, d: Required<SearchDefaults>, minDate: string): Promise<QuickCtx> {
  return { add: addToCartAction.bind(null, store.slug), options: quickOptionsAction.bind(null, store.slug), defaults: await quickDefaults(store, d, minDate), minDate };
}
