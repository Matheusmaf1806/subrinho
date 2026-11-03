import { BedDouble, House, ShieldCheck, Smartphone, Ticket, Car, Headphones, Ship, BusFront, Route } from "lucide-react";
import type { Category } from "@/server/db/schema";
import { CATEGORY_LABEL } from "@/server/suppliers/types";

export const STORE_CATEGORIES: { category: Category; slug: string; short: string; icon: typeof Ticket }[] = [
  { category: "TICKETS", slug: "ingressos", short: "Ingressos", icon: Ticket },
  { category: "LODGING", slug: "hospedagem", short: "Hospedagem", icon: BedDouble },
  { category: "HOUSES", slug: "casas", short: "Casas", icon: House },
  { category: "INSURANCE", slug: "seguro-viagem", short: "Seguro Viagem", icon: ShieldCheck },
  { category: "CHIP", slug: "chip", short: "Chip", icon: Smartphone },
];

export const COMING_SOON = [
  { label: "Aluguel de Carro", icon: Car },
  { label: "Guiamento Remoto", icon: Headphones },
  { label: "Cruzeiros", icon: Ship },
  { label: "Transfer", icon: BusFront },
  { label: "Roteirização", icon: Route },
];

export function categoryIcon(c: Category) {
  return STORE_CATEGORIES.find((x) => x.category === c)?.icon ?? Ticket;
}

export function categorySlug(c: Category) {
  return STORE_CATEGORIES.find((x) => x.category === c)?.slug ?? "ingressos";
}

export const categoryLabel = (c: Category) => CATEGORY_LABEL[c];
