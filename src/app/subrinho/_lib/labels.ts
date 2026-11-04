/** Rótulos e regras de permissão do Painel Subrinho (puro — pode ser importado em componentes cliente). */

export type SubrinhoRole = "OWNER" | "ADMIN" | "FINANCE" | "SUPPORT";

export const ROLE_LABEL: Record<SubrinhoRole, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  FINANCE: "Financeiro",
  SUPPORT: "Suporte",
};

/** Papéis que podem executar cada grupo de ações (OWNER sempre pode). */
export const PERMS = {
  orders: ["ADMIN", "FINANCE"],
  affiliates: ["ADMIN"],
  margins: ["ADMIN"],
  coupons: ["ADMIN"],
  fx: ["ADMIN", "FINANCE"],
  payouts: ["ADMIN", "FINANCE"],
  reports: ["ADMIN", "FINANCE"],
  suppliers: ["ADMIN"],
  settings: ["ADMIN"],
} satisfies Record<string, SubrinhoRole[]>;

export function canDo(role: SubrinhoRole, roles: SubrinhoRole[]): boolean {
  return role === "OWNER" || roles.includes(role);
}

export const SCOPE_LABEL: Record<string, string> = {
  DEFAULT: "Padrão",
  CATEGORY: "Categoria",
  SUPPLIER: "Fornecedor",
  PRODUCT: "Produto",
  PRODUCT_OPTION: "Opção do produto",
  FALLBACK: "Padrão do sistema",
};

export const MARGIN_SOURCE_LABEL: Record<string, string> = {
  RULE: "Regra do afiliado",
  OVERRIDE: "Alterada no checkout",
  FALLBACK: "Padrão do sistema (sem regra)",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = { PIX: "Pix", CARD: "Cartão de crédito" };

export const PAYPAL_STATUS_LABEL: Record<string, string> = {
  AWAITING_BUYER: "Aguardando o cliente abrir o PayPal",
  CREATED: "Aberto no PayPal, aguardando o cliente",
  PAYER_ACTION_REQUIRED: "Aguardando confirmação do cliente no PayPal",
  APPROVED: "Aprovado pelo cliente, captura em andamento",
  COMPLETED: "Capturado (dinheiro recebido)",
  DECLINED: "Recusado",
  FAILED: "Falhou",
  MISMATCH: "Valor não confere com o pedido, verificar no PayPal",
};

export const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  PERCENT: "Percentual (%)",
  FIXED: "Valor fixo (R$)",
  CONDITIONAL: "Condicional (R$ X a cada R$ Y)",
};

export const EVENT_LABEL: Record<string, string> = {
  ORDER_CREATED: "Pedido criado",
  PIX_CREATED: "Cobrança Pix gerada",
  PAID: "Pagamento confirmado",
  PAYMENT_DECLINED: "Pagamento recusado",
  BOOKING_FAILED: "Falha na reserva com o fornecedor",
  BOOKING_PENDING: "Item aguardando emissão da reserva",
  BOOKING_REQUESTED: "Emissão da reserva solicitada",
  BOOKING_CONFIRMED: "Reserva emitida no fornecedor",
  BOOKING_RECOVERED: "Reserva encontrada no fornecedor",
  BOOKING_STATUS_CHANGED: "Status da reserva atualizado",
  BOOKING_CANCELLED: "Reserva cancelada no fornecedor",
  PAID_AFTER_CANCEL: "Pagamento recebido após cancelamento",
  CANCELLED: "Pedido cancelado",
  MANUAL_PAYMENT: "Pagamento confirmado manualmente",
  PAYPAL_ORDER_CREATED: "Pagamento aberto no PayPal",
  PAYPAL_CAPTURED: "Pagamento capturado no PayPal",
  PAYMENT_PENDING: "Pagamento em análise no PayPal",
  PAYMENT_MISMATCH: "Pagamento não confere com o pedido, verificar",
  PAYMENT_REFUNDED: "Estorno registrado no PayPal",
  PAYMENT_REVERSED: "Contestação/estorno forçado no PayPal, verificar",
};

export const VIEW_PAGE_LABEL: Record<string, string> = {
  cart: "Carrinho",
  checkout: "Checkout",
  shared: "Link compartilhado",
};

export const USER_TYPE_LABEL: Record<string, string> = {
  SUBRINHO: "Equipe Subrinho",
  AFFILIATE: "Agência",
  CUSTOMER: "Cliente",
};

export const CURRENCY_LABEL: Record<string, string> = { USD: "Dólar (USD)", EUR: "Euro (EUR)", BRL: "Real (BRL)" };
