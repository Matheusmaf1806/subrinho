import type { Category, Currency, PaxConfig, PriceLine } from "@/server/db/schema";

export type PaxType = "ADULT" | "CHILD" | "SENIOR" | "ROOM" | "UNIT";

export const PAX_KEY: Record<PaxType, keyof PaxConfig> = {
  ADULT: "adults",
  CHILD: "children",
  SENIOR: "seniors",
  ROOM: "rooms",
  UNIT: "units",
};

export type PaxRule = { type: PaxType; label: string; min: number; max: number; hint?: string };

export type SearchParams = {
  destination?: string;
  /** Ingressos: data da visita */
  date?: string;
  /** Hospedagem/Casas */
  checkIn?: string;
  checkOut?: string;
  /** Seguro/Chip: período da viagem */
  startDate?: string;
  endDate?: string;
  pax?: Partial<PaxConfig>;
};

export type OfferOption = {
  optionId: string;
  title: string;
  description?: string;
  currency: Currency;
  lines: PriceLine[];
  attributes?: { label: string; value: string }[];
  available: boolean;
};

export type ProductSummary = {
  supplierCode: string;
  supplierName: string;
  category: Category;
  productId: string;
  title: string;
  subtitle?: string;
  location: string;
  destination: string;
  imageUrl?: string | null;
  rating?: number;
  tags: string[];
  /** Custo da melhor opção para os parâmetros pedidos */
  currency: Currency;
  lines: PriceLine[];
  /** Identidade do produto entre fornecedores (ex.: mesmo hotel em 2 fornecedores) */
  groupKey?: string;
};

export type ProductDetail = ProductSummary & {
  description: string;
  highlights: string[];
  options: OfferOption[];
  paxRules: PaxRule[];
  info: { label: string; value: string }[];
};

export type QuoteRequest = {
  productId: string;
  optionId?: string | null;
  date?: string;
  checkIn?: string;
  checkOut?: string;
  startDate?: string;
  endDate?: string;
  pax: PaxConfig;
};

export type Quote = {
  supplierCode: string;
  category: Category;
  productId: string;
  optionId: string | null;
  title: string;
  subtitle: string | null;
  location: string | null;
  imageUrl: string | null;
  serviceDate: string | null;
  serviceEndDate: string | null;
  /** A partir deste instante o item não pode mais ser vendido (data passou). */
  expiresAt: Date | null;
  currency: Currency;
  lines: PriceLine[];
  pax: PaxConfig;
  paxRules: PaxRule[];
  details: Record<string, unknown>;
  quoteRef: string;
};

export type BookingResult = { bookingRef: string; status: string; payload: Record<string, unknown> };

export class SupplierError extends Error {}

export interface SupplierAdapter {
  code: string;
  name: string;
  category: Category;
  defaultCurrency: Currency;
  destinations(): { id: string; name: string }[];
  search(params: SearchParams): Promise<ProductSummary[]>;
  getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null>;
  /** Cotação com preço correto da API para a configuração de pax (usado ao adicionar e ao alterar quantidade). */
  quote(req: QuoteRequest): Promise<Quote>;
  book(item: { quoteRef: string | null; productId: string; optionId: string | null; pax: PaxConfig }, travelers: unknown[]): Promise<BookingResult>;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  TICKETS: "Ingressos e Experiências",
  LODGING: "Hospedagem",
  HOUSES: "Casas",
  INSURANCE: "Seguro Viagem",
  CHIP: "Chip",
  CAR_RENTAL: "Aluguel de Carro",
  REMOTE_GUIDE: "Guiamento Remoto",
  CRUISE: "Cruzeiros",
  TRANSFER: "Transfer",
  ITINERARY: "Roteirização",
};

export const CATEGORY_SLUG: Partial<Record<Category, string>> = {
  TICKETS: "ingressos",
  LODGING: "hospedagem",
  HOUSES: "casas",
  INSURANCE: "seguro-viagem",
  CHIP: "chip",
};

export const ACTIVE_CATEGORIES: Category[] = ["TICKETS", "LODGING", "HOUSES", "INSURANCE", "CHIP"];
export const FUTURE_CATEGORIES: Category[] = ["CAR_RENTAL", "REMOTE_GUIDE", "CRUISE", "TRANSFER", "ITINERARY"];
