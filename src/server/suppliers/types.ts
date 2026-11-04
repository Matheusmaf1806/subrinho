import type { Category, Currency, PaxConfig, PersonData, PriceLine } from "@/server/db/schema";

export type PaxType = "ADULT" | "CHILD" | "SENIOR" | "ROOM" | "UNIT";

export const PAX_KEY: Record<PaxType, keyof PaxConfig> = {
  ADULT: "adults",
  CHILD: "children",
  SENIOR: "seniors",
  ROOM: "rooms",
  UNIT: "units",
};

export type PaxRule = {
  type: PaxType;
  label: string;
  min: number;
  max: number;
  hint?: string;
  /** Crianças: pedir a idade de cada uma (hotéis). */
  ages?: { min: number; max: number };
};

export type SearchParams = {
  destination?: string;
  /** Chave do destino escolhido na lista de sugestões (hotéis reais). */
  destinationKey?: string;
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

/** Preço mínimo de venda exigido pelo fornecedor (na moeda dele). */
export type MinSellPrice = { currency: Currency; amount: string };

export type OfferOption = {
  optionId: string;
  title: string;
  description?: string;
  currency: Currency;
  lines: PriceLine[];
  attributes?: { label: string; value: string }[];
  /** Avisos importantes da tarifa (taxas pagas no hotel, política de cancelamento…). */
  notes?: string[];
  /** Cancelamento grátis até esta data (yyyy-mm-dd); null = não reembolsável. */
  freeCancellationUntil?: string | null;
  /** Não vender abaixo deste valor (ex.: Hotelbeds hotelMandatory / tarifa comissionada). */
  minSellPrice?: MinSellPrice | null;
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
  /** Preço mínimo de venda da opção mais barata (quando o fornecedor exige). */
  minSellPrice?: MinSellPrice | null;
  /** Hotéis: estrelas e diferenciais (filtros da listagem). */
  stars?: number;
  perks?: { breakfast: boolean; refundable: boolean };
  /** Hotéis: bairro/área (selo do card). */
  area?: string | null;
};

export type ProductDetail = ProductSummary & {
  /** Texto corrido; parágrafos separados por linha em branco. */
  description: string;
  /** Fotos reais do fornecedor (quando houver). */
  gallery?: string[];
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

/** Item a reservar no fornecedor (dados congelados do pedido). */
export type BookItem = {
  quoteRef: string | null;
  productId: string;
  optionId: string | null;
  pax: PaxConfig;
  serviceDate?: string | null;
  serviceEndDate?: string | null;
  details?: Record<string, unknown>;
  /** Referência única nossa (vai para o fornecedor e permite achar a reserva de novo). */
  reference?: string;
  /** Custo vendido — a reserva não é feita se o fornecedor pedir mais do que isto. */
  maxCost?: { currency: Currency; amount: string };
};

export type BookContext = {
  /** Nova tentativa depois de falha: refaz a consulta no fornecedor em vez de usar a cotação gravada. */
  retry?: boolean;
  travelers: PersonData[];
  /** Quem responde pela reserva (pagador/cliente). */
  holder?: PersonData | null;
  remark?: string | null;
};

/**
 * Status devolvido pelo fornecedor:
 * CONFIRMED (confirmada), PENDING (pedido recebido, aguardando confirmação), REJECTED, CANCELLED.
 */
export type BookingResult = { bookingRef: string; status: string; payload: Record<string, unknown> };

/** Cancelamento no fornecedor (simulação mostra a multa sem cancelar). */
export type CancelResult = {
  status: string;
  penalty: { amount: string; currency: string } | null;
  reference: string | null;
  payload: Record<string, unknown>;
};

export class SupplierError extends Error {}

/** Erro de integração (credencial, rede, resposta inesperada) — mensagem técnica para o Painel Subrinho. */
export class SupplierIntegrationError extends SupplierError {
  constructor(
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface SupplierAdapter {
  code: string;
  name: string;
  category: Category;
  defaultCurrency: Currency;
  /** true = API real do fornecedor (reservas de verdade). false/undefined = catálogo simulado. */
  live?: boolean;
  destinations(): { id: string; name: string }[];
  search(params: SearchParams): Promise<ProductSummary[]>;
  getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null>;
  /** Cotação com preço correto da API para a configuração de pax (usado ao adicionar e ao alterar quantidade). */
  quote(req: QuoteRequest): Promise<Quote>;
  book(item: BookItem, ctx: BookContext): Promise<BookingResult>;
  /** Consulta a reserva no fornecedor (status atualizado). */
  bookingStatus?(bookingRef: string): Promise<BookingResult>;
  /** Procura uma reserva feita com a nossa referência (evita reservar duas vezes). */
  findBooking?(item: BookItem): Promise<BookingResult | null>;
  /** Cancela a reserva no fornecedor (ou simula, quando suportado, para mostrar a multa). */
  cancelBooking?(bookingRef: string, opts: { simulate: boolean }): Promise<CancelResult>;
  /** O fornecedor consegue simular a multa antes de cancelar? */
  cancelSimulation?: boolean;
  /** Dados oficiais do voucher no fornecedor (ex.: link do PDF), quando houver. */
  voucher?(bookingRef: string): Promise<Record<string, unknown> | null>;
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
