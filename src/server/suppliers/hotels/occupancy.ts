/**
 * Ocupação de hotel: valida a configuração de hóspedes e distribui adultos/crianças pelos quartos
 * — a MESMA distribuição é usada na busca, na cotação e na reserva (os fornecedores exigem que a
 * ocupação da reserva seja idêntica à pesquisada).
 */
import type { PaxConfig } from "@/server/db/schema";
import { SupplierError } from "../types";

export const HOTEL_MAX_ROOMS = 5;
export const HOTEL_MAX_ADULTS = 16;
export const HOTEL_MAX_CHILDREN = 8;
/** Criança = 0 a 17 anos (idade no dia do check-in). */
export const CHILD_MAX_AGE = 17;
/** Limite por quarto aceito pelos fornecedores. */
export const MAX_GUESTS_PER_ROOM = 8;

export type RoomOccupancy = { adults: number; childAges: number[] };
export type RoomGroup = RoomOccupancy & { count: number };

/** Normaliza e valida a ocupação. Lança SupplierError com mensagem pronta para o cliente. */
export function normalizeHotelPax(pax: Partial<PaxConfig>): PaxConfig {
  const rooms = Math.floor(pax.rooms ?? 1);
  const adults = Math.floor(pax.adults ?? 0);
  const children = Math.floor(pax.children ?? 0);
  if (!(rooms >= 1 && rooms <= HOTEL_MAX_ROOMS)) throw new SupplierError(`Escolha de 1 a ${HOTEL_MAX_ROOMS} quartos`);
  if (!(adults >= 1 && adults <= HOTEL_MAX_ADULTS)) throw new SupplierError(`Informe de 1 a ${HOTEL_MAX_ADULTS} adultos`);
  if (adults < rooms) throw new SupplierError("Cada quarto precisa de ao menos 1 adulto");
  if (!(children >= 0 && children <= HOTEL_MAX_CHILDREN)) throw new SupplierError(`Máximo de ${HOTEL_MAX_CHILDREN} crianças`);
  const ages = (pax.childrenAges ?? []).map((a) => Math.floor(Number(a)));
  if (children > 0 && ages.length !== children) throw new SupplierError("Informe a idade de cada criança");
  if (ages.some((a) => !Number.isFinite(a) || a < 0 || a > CHILD_MAX_AGE)) throw new SupplierError(`A idade da criança deve ser de 0 a ${CHILD_MAX_AGE} anos`);
  const out: PaxConfig = { adults, children, rooms };
  if (children > 0) out.childrenAges = ages.slice(0, children);
  for (const r of distributeRooms(out)) {
    if (r.adults + r.childAges.length > MAX_GUESTS_PER_ROOM)
      throw new SupplierError(`Máximo de ${MAX_GUESTS_PER_ROOM} hóspedes por quarto, adicione mais quartos`);
  }
  return out;
}

/**
 * Distribui hóspedes nos quartos: adultos o mais igual possível (os primeiros quartos recebem o
 * excedente) e crianças em rodízio a partir do primeiro quarto, na ordem informada.
 * Ex.: 3 adultos + 2 crianças (5 e 9 anos) em 2 quartos → [{2, [5]}, {1, [9]}].
 */
export function distributeRooms(pax: PaxConfig): RoomOccupancy[] {
  const rooms = Math.max(1, pax.rooms ?? 1);
  const base = Math.floor(pax.adults / rooms);
  const extra = pax.adults % rooms;
  const out: RoomOccupancy[] = Array.from({ length: rooms }, (_, i) => ({ adults: base + (i < extra ? 1 : 0), childAges: [] }));
  (pax.childrenAges ?? []).slice(0, pax.children).forEach((age, i) => out[i % rooms].childAges.push(age));
  return out;
}

/** Agrupa quartos com ocupação idêntica (para APIs que aceitam "N quartos iguais"). Preserva a ordem. */
export function groupRooms(rooms: RoomOccupancy[]): RoomGroup[] {
  const groups: RoomGroup[] = [];
  for (const r of rooms) {
    const key = occupancyKey(r);
    const g = groups.find((x) => occupancyKey(x) === key);
    if (g) g.count++;
    else groups.push({ adults: r.adults, childAges: [...r.childAges], count: 1 });
  }
  return groups;
}

export function occupancyKey(r: RoomOccupancy): string {
  return `${r.adults}|${[...r.childAges].sort((a, b) => a - b).join(",")}`;
}

/** "2 quartos · 3 adultos · 1 criança (7 anos)" */
export function occupancyLabel(pax: PaxConfig): string {
  const rooms = pax.rooms ?? 1;
  const parts = [`${rooms} quarto${rooms > 1 ? "s" : ""}`, `${pax.adults} adulto${pax.adults > 1 ? "s" : ""}`];
  if (pax.children > 0) {
    const ages = pax.childrenAges?.length ? ` (${pax.childrenAges.map((a) => (a === 0 ? "menos de 1 ano" : `${a} ano${a > 1 ? "s" : ""}`)).join(", ")})` : "";
    parts.push(`${pax.children} criança${pax.children > 1 ? "s" : ""}${ages}`);
  }
  return parts.join(" · ");
}

/** Assinatura da ocupação — entra nas chaves de cache e de cotação. */
export function paxKey(pax: PaxConfig): string {
  return distributeRooms(pax).map(occupancyKey).join(";");
}
