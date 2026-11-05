/**
 * Schema do banco de dados da plataforma Subrinho.
 *
 * Convenções:
 * - Valores monetários em BRL: numeric(14,2). Custos em moeda do fornecedor: numeric(14,4).
 * - Percentuais (margens, taxas): numeric(7,4) em pontos percentuais (4.5 = 4,5%).
 * - Câmbio: numeric(12,6).
 * - Tudo que é vendido é "congelado" (snapshot) em orders/order_items: o Painel Subrinho
 *   sempre consegue reconstruir a conta completa de cada item.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const foreignMoney = (name: string) => numeric(name, { precision: 14, scale: 4 });
const pct = (name: string) => numeric(name, { precision: 7, scale: 4 });
const fx = (name: string) => numeric(name, { precision: 12, scale: 6 });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ───────────────────────────── Enums ─────────────────────────────

export const categoryEnum = pgEnum("category", [
  "TICKETS", // Ingressos e Experiências
  "LODGING", // Hospedagem
  "HOUSES", // Casas
  "INSURANCE", // Seguro Viagem
  "CHIP", // Chip / eSIM
  "CAR_RENTAL", // futuro: Aluguel de Carro
  "REMOTE_GUIDE", // futuro: Guiamento Remoto
  "CRUISE", // futuro: Cruzeiros
  "TRANSFER", // futuro: Transfer
  "ITINERARY", // futuro: Roteirização
]);

export const currencyEnum = pgEnum("currency", ["BRL", "USD", "EUR"]);
export const subrinhoRoleEnum = pgEnum("subrinho_role", ["OWNER", "ADMIN", "FINANCE", "SUPPORT"]);
export const affiliateRoleEnum = pgEnum("affiliate_role", ["ADMIN", "AGENT"]);
export const userTypeEnum = pgEnum("user_type", ["SUBRINHO", "AFFILIATE", "CUSTOMER"]);
export const marginOwnerEnum = pgEnum("margin_owner", ["SUBRINHO", "AFFILIATE"]);
export const marginScopeEnum = pgEnum("margin_scope", [
  "DEFAULT",
  "CATEGORY",
  "SUPPLIER",
  "PRODUCT",
  "PRODUCT_OPTION",
]);
export const cartStatusEnum = pgEnum("cart_status", ["OPEN", "CONVERTED"]);
export const cartItemStatusEnum = pgEnum("cart_item_status", ["ACTIVE", "EXPIRED", "REMOVED", "UNAVAILABLE"]);
export const couponIssuerEnum = pgEnum("coupon_issuer", ["SUBRINHO", "AFFILIATE"]);
export const discountTypeEnum = pgEnum("discount_type", ["PERCENT", "FIXED", "CONDITIONAL"]);
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING_PAYMENT",
  "PAID",
  "CANCELLED",
  "REFUNDED",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["PIX", "CARD"]);
export const payoutStatusEnum = pgEnum("payout_status", ["SCHEDULED", "PAID", "CANCELLED"]);

// ───────────────────────────── Usuários ─────────────────────────────

/** Usuário da Subrinho (equipe interna). */
export const subrinhoUsers = pgTable("subrinho_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: subrinhoRoleEnum("role").notNull().default("ADMIN"),
  active: boolean("active").notNull().default(true),
  /** Verificação em duas etapas (app autenticador): segredo TOTP cifrado; ligado quando confirmado. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: ts("totp_enabled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Afiliado (agência). Cada afiliado tem a sua Loja. */
export const affiliates = pgTable("affiliates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // nome fantasia exibido na loja
  legalName: text("legal_name"),
  document: text("document"), // CNPJ/CPF
  slug: text("slug").notNull().unique(), // identificador interno (e endereço reserva /loja/<slug>)
  /** Endereço na plataforma: <subdomain>.<STORE_ROOT_DOMAIN> (ex.: viagensdaana.subrinho.com.br). */
  subdomain: text("subdomain").unique(),
  /** Domínio próprio da agência (ex.: viagensdaana.com.br ou loja.viagensdaana.com.br). */
  customDomain: text("custom_domain").unique(),
  /** O domínio próprio já respondeu pela loja: só então os links e o endereço oficial usam ele. */
  customDomainVerifiedAt: ts("custom_domain_verified_at"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  /** Endereço da agência (rodapé e páginas legais da loja). */
  address: text("address"),
  /** Registro no Cadastur (Ministério do Turismo), obrigatório para agências de turismo. */
  cadastur: text("cadastur"),
  /** Observações da agência na política de cancelamento (somam ao texto padrão). */
  policyNotes: text("policy_notes"),
  /** Rastreamento da própria agência (carregado só com o consentimento de cookies do cliente). */
  metaPixelId: text("meta_pixel_id"),
  ga4Id: text("ga4_id"),
  // ── White-label: identidade da loja (cada afiliado tem a sua) ──
  logoUrl: text("logo_url"), // logo para fundo claro
  logoOnDarkUrl: text("logo_on_dark_url"), // logo para fundo escuro (rodapé)
  faviconUrl: text("favicon_url"), // ícone da aba; sem ele, gera monograma
  brandColor: text("brand_color").notNull().default("#E4113F"), // cor principal
  darkColor: text("dark_color").notNull().default("#0A0A0B"), // cor escura (blocos, botões, texto)
  fontFamily: text("font_family").notNull().default("inter-tight"),
  heroTitle: text("hero_title"),
  heroSubtitle: text("hero_subtitle"),
  heroImageUrl: text("hero_image_url"),
  heroImage2Url: text("hero_image2_url"),
  tagline: text("tagline"), // frase do rodapé
  instagram: text("instagram"),
  /** Exibe "tecnologia Subrinho" na loja (decisão da Subrinho). */
  showPoweredBy: boolean("show_powered_by").notNull().default(true),
  // Dados bancários para repasse
  pixKey: text("pix_key"),
  bankName: text("bank_name"),
  bankAgency: text("bank_agency"),
  bankAccount: text("bank_account"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Usuário do afiliado. ADMIN pode alterar margens, cupons e usar o "modo ADMIN" na loja. */
export const affiliateUsers = pgTable(
  "affiliate_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: affiliateRoleEnum("role").notNull().default("AGENT"),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("affiliate_users_affiliate_idx").on(t.affiliateId)],
);

/** Usuário da loja (cliente final). A conta é por loja/afiliado. */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    document: text("document"), // CPF
    birthDate: date("birth_date"),
    passwordHash: text("password_hash").notNull(),
    /** Conta excluída a pedido do cliente (LGPD): dados pessoais apagados, pedidos mantidos por obrigação legal. */
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_affiliate_email_uq").on(t.affiliateId, t.email)],
);

/** Sessões (token aleatório no cookie; aqui só o hash SHA-256). */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userType: userTypeEnum("user_type").notNull(),
    userId: uuid("user_id").notNull(),
    /** Para sessões de loja: a qual loja (afiliado) esta sessão pertence. */
    storeAffiliateId: uuid("store_affiliate_id"),
    /** Afiliado ADMIN logado na loja com "modo ADMIN" ligado. */
    adminMode: boolean("admin_mode").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userType, t.userId)],
);

// ───────────────────────────── Catálogo / configuração ─────────────────────────────

export const suppliers = pgTable("suppliers", {
  code: text("code").primaryKey(), // ex.: HOTELBEDS
  name: text("name").notNull(),
  category: categoryEnum("category").notNull(),
  defaultCurrency: currencyEnum("default_currency").notNull(),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
});

/**
 * Destinos dos fornecedores de hotel (cidades da GGT/GoGlobal, destinos da Hotelbeds), sincronizados
 * das APIs. Usados para transformar o que o cliente digita ("Orlando") nos códigos de cada fornecedor.
 */
export const hotelDestinations = pgTable(
  "hotel_destinations",
  {
    supplierCode: text("supplier_code").notNull(),
    code: text("code").notNull(),
    /** Nome como o fornecedor envia (ex.: "ORLANDO (FL)"). */
    name: text("name").notNull(),
    /** Nome limpo para exibir (ex.: "Orlando"). */
    city: text("city").notNull(),
    /** Estado/região, quando houver (ex.: "FL"). */
    region: text("region"),
    /** ISO 3166-1 alfa-2. */
    countryCode: text("country_code"),
    countryName: text("country_name"),
    /** Nome normalizado (minúsculo, sem acento, sem estado) — chave de busca. */
    searchKey: text("search_key").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.supplierCode, t.code] }),
    index("hotel_destinations_search_idx").on(t.searchKey.op("text_pattern_ops")),
    index("hotel_destinations_country_idx").on(t.countryCode, t.searchKey),
  ],
);

/** Cache de respostas dos fornecedores (conteúdo de hotéis, buscas recentes). */
export const supplierCache = pgTable(
  "supplier_cache",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("supplier_cache_expires_idx").on(t.expiresAt)],
);

/** Histórico de câmbio. A cotação vigente é a mais recente por moeda. */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    currency: currencyEnum("currency").notNull(), // moeda base (USD/EUR) → BRL
    rate: fx("rate").notNull(),
    source: text("source").notNull(), // poolvo | awesomeapi | manual
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [index("fx_rates_currency_idx").on(t.currency, t.fetchedAt)],
);

/** Configurações globais (taxa do parcelado, nº de parcelas, etc.). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Feriados adicionais (além dos nacionais calculados automaticamente). */
export const holidays = pgTable("holidays", {
  date: date("date").primaryKey(),
  name: text("name").notNull(),
});

/**
 * Regras de margem. A mais específica vence:
 * PRODUCT_OPTION > PRODUCT > SUPPLIER > CATEGORY > DEFAULT.
 * owner=SUBRINHO → margem da Subrinho (affiliateId null).
 * owner=AFFILIATE → margem do afiliado (affiliateId obrigatório).
 */
export const marginRules = pgTable(
  "margin_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: marginOwnerEnum("owner").notNull(),
    affiliateId: uuid("affiliate_id").references(() => affiliates.id),
    scope: marginScopeEnum("scope").notNull(),
    category: categoryEnum("category"),
    supplierCode: text("supplier_code"),
    productId: text("product_id"),
    optionId: text("option_id"),
    label: text("label"), // ex.: "Coliseu 1 dia"
    marginPct: pct("margin_pct").notNull(),
    /** Chave determinística do escopo para garantir 1 regra por alvo. */
    scopeKey: text("scope_key").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (t) => [uniqueIndex("margin_rules_scope_uq").on(t.scopeKey)],
);

// ───────────────────────────── Carrinho ─────────────────────────────

/** Um carrinho NUNCA expira. Quem expira são os itens. */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Token público usado no link de compartilhamento. */
    token: text("token").notNull().unique(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    status: cartStatusEnum("status").notNull().default("OPEN"),
    /** Quem gerou o carrinho (se estava logado). */
    createdByType: userTypeEnum("created_by_type"),
    createdByCustomerId: uuid("created_by_customer_id").references(() => customers.id),
    createdByAffiliateUserId: uuid("created_by_affiliate_user_id").references(() => affiliateUsers.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: ts("last_viewed_at"),
    convertedOrderId: uuid("converted_order_id"),
    convertedAt: ts("converted_at"),
    /** Lembrete de carrinho abandonado já enviado (um por carrinho). */
    reminderSentAt: ts("reminder_sent_at"),
  },
  (t) => [index("carts_affiliate_idx").on(t.affiliateId, t.createdAt)],
);

/** Cada acesso ao carrinho (link compartilhado, página do carrinho, checkout). */
export const cartViews = pgTable(
  "cart_views",
  {
    id: serial("id").primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    viewedAt: ts("viewed_at").notNull().defaultNow(),
    page: text("page").notNull(), // cart | checkout | shared
    viewerType: userTypeEnum("viewer_type"),
    viewerId: uuid("viewer_id"),
    visitorId: text("visitor_id"), // cookie anônimo
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (t) => [index("cart_views_cart_idx").on(t.cartId, t.viewedAt)],
);

export type PriceLine = {
  /** ADULT | CHILD | SENIOR | ROOM | NIGHT | UNIT | TRAVELER ... */
  type: string;
  label: string;
  unitCost: string; // na moeda do fornecedor
  quantity: number;
  ages?: number[];
};

/** Quantidades editáveis de um item (ingressos, hóspedes, viajantes, unidades...). */
export type PaxConfig = {
  adults: number;
  children: number;
  seniors?: number;
  childrenAges?: number[];
  rooms?: number;
  units?: number;
};

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    category: categoryEnum("category").notNull(),
    supplierCode: text("supplier_code").notNull(),
    productId: text("product_id").notNull(),
    optionId: text("option_id"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    imageUrl: text("image_url"),
    location: text("location"),
    /** Cidade/destino da vitrine (ex.: "Paris"): usado para sugerir o que combina com a viagem. */
    destination: text("destination"),
    serviceDate: date("service_date"),
    serviceEndDate: date("service_end_date"),
    /** Momento a partir do qual o item não pode mais ser vendido. */
    expiresAt: ts("expires_at"),
    pax: jsonb("pax").$type<PaxConfig>().notNull(),
    lines: jsonb("lines").$type<PriceLine[]>().notNull(),
    costCurrency: currencyEnum("cost_currency").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    supplierQuoteRef: text("supplier_quote_ref"),
    quotedAt: ts("quoted_at").notNull().defaultNow(),
    status: cartItemStatusEnum("status").notNull().default("ACTIVE"),
    statusReason: text("status_reason"),
    statusChangedAt: ts("status_changed_at"),
    /** O usuário já foi avisado sobre a remoção (expiração)? */
    noticeAcknowledged: boolean("notice_acknowledged").notNull().default(false),
    /** Margem do afiliado alterada no checkout (somente neste carrinho). */
    affiliateMarginOverridePct: pct("affiliate_margin_override_pct"),
    overrideByAffiliateUserId: uuid("override_by_affiliate_user_id"),
    overrideAt: ts("override_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId)],
);

// ───────────────────────────── Cupons ─────────────────────────────

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // sempre em MAIÚSCULAS
    /** SUBRINHO desconta da margem Subrinho; AFFILIATE desconta da margem do afiliado. */
    issuer: couponIssuerEnum("issuer").notNull(),
    /** Afiliado dono do cupom (issuer=AFFILIATE) ou restrição de loja (issuer=SUBRINHO, opcional). */
    affiliateId: uuid("affiliate_id").references(() => affiliates.id),
    /** 'SUBRINHO' ou id do afiliado — garante código único por camada. */
    scopeKey: text("scope_key").notNull(),
    description: text("description"),
    discountType: discountTypeEnum("discount_type").notNull(),
    percentOff: pct("percent_off"),
    amountOff: money("amount_off"), // FIXED: R$; CONDITIONAL: R$ a cada `stepAmount`
    stepAmount: money("step_amount"), // CONDITIONAL: a cada R$ X
    maxDiscount: money("max_discount"),
    minSubtotal: money("min_subtotal"),
    /** Categorias elegíveis. Vazio = todas. */
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdByType: userTypeEnum("created_by_type").notNull(),
    createdById: uuid("created_by_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupons_scope_code_uq").on(t.scopeKey, t.code)],
);

export const cartCoupons = pgTable(
  "cart_coupons",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id),
    layer: couponIssuerEnum("layer").notNull(),
    appliedAt: ts("applied_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.layer] })],
);

// ───────────────────────────── Pedidos ─────────────────────────────

export type PersonData = {
  name: string;
  /** Hotéis: adulto ou criança (ordem dos hóspedes na reserva). */
  type?: "ADULT" | "CHILD";
  /** Tratamento (reservas de hotel): Sr. = MR, Sra. = MRS. */
  title?: "MR" | "MRS" | "MS";
  /** Idade da criança no check-in. */
  age?: number;
  email?: string | null;
  phone?: string | null;
  document?: string | null; // CPF/CNPJ
  birthDate?: string | null;
  address?: {
    zip?: string;
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  } | null;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    /** Conta (usuário da loja) que fez a compra. */
    customerId: uuid("customer_id").references(() => customers.id),
    /** Afiliado logado em modo ADMIN que finalizou (se for o caso). */
    placedByAffiliateUserId: uuid("placed_by_affiliate_user_id").references(() => affiliateUsers.id),
    status: orderStatusEnum("status").notNull().default("PENDING_PAYMENT"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    installments: integer("installments").notNull().default(1),

    // Snapshot do carrinho
    cartCreatedAt: ts("cart_created_at").notNull(),
    cartCreatedByType: userTypeEnum("cart_created_by_type"),
    cartCreatedById: uuid("cart_created_by_id"),
    cartViewCountAtOrder: integer("cart_view_count_at_order").notNull().default(0),

    // Pessoas
    customerData: jsonb("customer_data").$type<PersonData>().notNull(), // quem tem a conta
    payerData: jsonb("payer_data").$type<PersonData>().notNull(), // quem pagou
    travelers: jsonb("travelers").$type<PersonData[]>().notNull().default([]),
    /** Pedido especial do cliente ao hotel (ex.: chegada tarde) — enviado na reserva. */
    specialRequests: text("special_requests"),

    // Totais (BRL)
    totalCostBrl: money("total_cost_brl").notNull(),
    totalSubrinhoMargin: money("total_subrinho_margin").notNull(),
    totalNetSubrinho: money("total_net_subrinho").notNull(),
    totalAffiliateMargin: money("total_affiliate_margin").notNull(),
    totalNetAffiliate: money("total_net_affiliate").notNull(), // preço PIX sem desconto
    totalSubrinhoDiscount: money("total_subrinho_discount").notNull(),
    totalAffiliateDiscount: money("total_affiliate_discount").notNull(),
    totalPix: money("total_pix").notNull(), // preço PIX final
    totalInstallment: money("total_installment").notNull(), // preço PARCELADO final
    installmentFeePct: pct("installment_fee_pct").notNull(),
    amountCharged: money("amount_charged").notNull(),
    subrinhoRevenue: money("subrinho_revenue").notNull(), // margem Subrinho − desconto Subrinho
    affiliateCommission: money("affiliate_commission").notNull(), // margem afiliado − desconto afiliado
    fxSnapshot: jsonb("fx_snapshot").$type<Record<string, { rate: string; source: string; fetchedAt: string }>>().notNull(),
    couponsSnapshot: jsonb("coupons_snapshot").$type<unknown[]>().notNull().default([]),

    // Pagamento
    paymentProvider: text("payment_provider").notNull(),
    paymentRef: text("payment_ref"),
    paymentData: jsonb("payment_data").$type<Record<string, unknown>>().notNull().default({}),
    paidAt: ts("paid_at"),
    cancelledAt: ts("cancelled_at"),

    // Repasse
    payoutDate: date("payout_date"),
    payoutId: uuid("payout_id"),

    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_affiliate_idx").on(t.affiliateId, t.createdAt),
    index("orders_paid_idx").on(t.status, t.paidAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    cartItemId: uuid("cart_item_id"),
    category: categoryEnum("category").notNull(),
    supplierCode: text("supplier_code").notNull(),
    productId: text("product_id").notNull(),
    optionId: text("option_id"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    location: text("location"),
    serviceDate: date("service_date"),
    serviceEndDate: date("service_end_date"),
    pax: jsonb("pax").$type<PaxConfig>().notNull(),
    lines: jsonb("lines").$type<PriceLine[]>().notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),

    // Conta completa
    costCurrency: currencyEnum("cost_currency").notNull(),
    costForeign: foreignMoney("cost_foreign").notNull(), // Σ preço × quantidade na moeda do fornecedor
    fxRate: fx("fx_rate").notNull(),
    costBrl: money("cost_brl").notNull(),
    subrinhoMarginPct: pct("subrinho_margin_pct").notNull(),
    subrinhoMarginRuleId: uuid("subrinho_margin_rule_id"),
    subrinhoMarginAmount: money("subrinho_margin_amount").notNull(),
    netSubrinho: money("net_subrinho").notNull(),
    affiliateMarginPct: pct("affiliate_margin_pct").notNull(),
    affiliateMarginSource: text("affiliate_margin_source").notNull(), // RULE | OVERRIDE | FALLBACK
    affiliateMarginRuleId: uuid("affiliate_margin_rule_id"),
    affiliateMarginAmount: money("affiliate_margin_amount").notNull(),
    netAffiliate: money("net_affiliate").notNull(),
    subrinhoDiscount: money("subrinho_discount").notNull(),
    affiliateDiscount: money("affiliate_discount").notNull(),
    finalPix: money("final_pix").notNull(),
    installmentFeePct: pct("installment_fee_pct").notNull(),
    finalInstallment: money("final_installment").notNull(),
    chargedAmount: money("charged_amount").notNull(),
    effectiveSubrinhoMarginPct: pct("effective_subrinho_margin_pct").notNull(),
    effectiveAffiliateMarginPct: pct("effective_affiliate_margin_pct").notNull(),
    affiliateCommission: money("affiliate_commission").notNull(),
    subrinhoRevenue: money("subrinho_revenue").notNull(),

    // Fornecedor
    supplierQuoteRef: text("supplier_quote_ref"),
    supplierBookingRef: text("supplier_booking_ref"),
    supplierStatus: text("supplier_status"),
    supplierPayload: jsonb("supplier_payload").$type<Record<string, unknown>>(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

// ───────────────────────────── Repasses / relatórios ─────────────────────────────

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  /** Arquivos públicos (logos, imagens da loja) podem ser servidos sem login. */
  isPublic: boolean("is_public").notNull().default(false),
  uploadedByType: userTypeEnum("uploaded_by_type"),
  uploadedById: uuid("uploaded_by_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Relatório de fechamento de quinzena (gerado no dia 16 e no dia 1). */
export const fortnightReports = pgTable(
  "fortnight_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    payoutDate: date("payout_date").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    generatedByType: text("generated_by_type").notNull(), // CRON | SUBRINHO
    generatedById: uuid("generated_by_id"),
  },
  (t) => [uniqueIndex("fortnight_reports_period_uq").on(t.periodStart)],
);

/** Repasse ao afiliado referente a uma quinzena. */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    reportId: uuid("report_id").references(() => fortnightReports.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    ordersCount: integer("orders_count").notNull(),
    grossSales: money("gross_sales").notNull(),
    amount: money("amount").notNull(),
    status: payoutStatusEnum("status").notNull().default("SCHEDULED"),
    paidAt: ts("paid_at"),
    paidById: uuid("paid_by_id"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payouts_affiliate_period_uq").on(t.affiliateId, t.periodStart)],
);

export const payoutProofs = pgTable("payout_proofs", {
  id: uuid("id").primaryKey().defaultRandom(),
  payoutId: uuid("payout_id")
    .notNull()
    .references(() => payouts.id, { onDelete: "cascade" }),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id),
  note: text("note"),
  uploadedById: uuid("uploaded_by_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ───────────────────────────── E-mails, segurança, auditoria, monitoramento, notas ─────────────────────────────

/**
 * Fila de e-mails: todo e-mail nasce aqui (dentro da mesma transação do evento) e é enviado logo depois
 * pelo provedor (Resend). Sem provedor configurado, fica "SKIPPED" e aparece no Painel Subrinho.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    affiliateId: uuid("affiliate_id").references(() => affiliates.id),
    orderId: uuid("order_id"),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    fromName: text("from_name"),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    /** PENDING | SENDING | SENT | FAILED | SKIPPED */
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerId: text("provider_id"),
    /** Evita o mesmo e-mail duas vezes (ex.: order-paid:<pedido>:customer). */
    dedupeKey: text("dedupe_key").unique(),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    claimedAt: ts("claimed_at"),
    sentAt: ts("sent_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("email_outbox_status_idx").on(t.status, t.nextAttemptAt), index("email_outbox_order_idx").on(t.orderId), index("email_outbox_created_idx").on(t.createdAt)],
);

/** Tokens de uso único: redefinição de senha (RESET) e segunda etapa do login (MFA). Aqui só o hash. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(), // sha256(token)
    purpose: text("purpose").notNull(), // RESET | MFA
    userType: userTypeEnum("user_type").notNull(),
    userId: uuid("user_id").notNull(),
    storeAffiliateId: uuid("store_affiliate_id"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userType, t.userId)],
);

/** Tentativas de login (e de pedidos de nova senha) para limitar ataques de força bruta. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(), // subrinho | afiliado | loja:<affiliateId> | reset:<...> | mfa
    identifier: text("identifier").notNull(), // e-mail (minúsculo)
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_id_idx").on(t.scope, t.identifier, t.createdAt), index("login_attempts_ip_idx").on(t.ip, t.createdAt)],
);

/** Histórico de alterações: quem mudou o quê (margens, cupons, preços, emissões, marca, usuários, repasses). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorType: text("actor_type").notNull(), // SUBRINHO | AFFILIATE | CUSTOMER | SYSTEM
    actorId: uuid("actor_id"),
    actorName: text("actor_name"),
    /** Loja afetada (null = plataforma). */
    affiliateId: uuid("affiliate_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_affiliate_idx").on(t.affiliateId, t.createdAt), index("audit_log_created_idx").on(t.createdAt), index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

/** Erros da aplicação e falhas de fornecedor (monitoramento e alertas). */
export const errorEvents = pgTable(
  "error_events",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(), // request | supplier | email | cron
    key: text("key").notNull(), // fornecedor, rota...
    message: text("message").notNull(),
    code: text("code"),
    path: text("path"),
    digest: text("digest"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("error_events_key_idx").on(t.source, t.key, t.createdAt), index("error_events_created_idx").on(t.createdAt)],
);

/** Último alerta enviado por assunto (para não lotar a caixa da equipe). */
export const alertState = pgTable("alert_state", {
  key: text("key").primaryKey(),
  lastSentAt: ts("last_sent_at").notNull(),
  count: integer("count").notNull().default(1),
});

/**
 * Notas fiscais registradas na plataforma:
 *  - ORDER: nota do pedido para o cliente (o cliente baixa na página do pedido);
 *  - PAYOUT: nota da agência para a Subrinho pela comissão do repasse.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // ORDER | PAYOUT
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(), // SUBRINHO | AFFILIATE
    number: text("number").notNull(),
    series: text("series"),
    issuedAt: date("issued_at").notNull(),
    amount: money("amount").notNull(),
    fileId: uuid("file_id").references(() => files.id),
    xmlFileId: uuid("xml_file_id").references(() => files.id),
    url: text("url"),
    status: text("status").notNull().default("ISSUED"), // ISSUED | CANCELLED
    notes: text("notes"),
    createdByType: text("created_by_type"),
    createdById: uuid("created_by_id"),
    cancelledAt: ts("cancelled_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("invoices_order_idx").on(t.orderId), index("invoices_payout_idx").on(t.payoutId), index("invoices_affiliate_idx").on(t.affiliateId, t.createdAt)],
);

// ───────────────────────────── Relations ─────────────────────────────

export const affiliatesRelations = relations(affiliates, ({ many }) => ({
  users: many(affiliateUsers),
  customers: many(customers),
}));
export const affiliateUsersRelations = relations(affiliateUsers, ({ one }) => ({
  affiliate: one(affiliates, { fields: [affiliateUsers.affiliateId], references: [affiliates.id] }),
}));
export const cartsRelations = relations(carts, ({ many, one }) => ({
  items: many(cartItems),
  views: many(cartViews),
  coupons: many(cartCoupons),
  affiliate: one(affiliates, { fields: [carts.affiliateId], references: [affiliates.id] }),
  createdByCustomer: one(customers, { fields: [carts.createdByCustomerId], references: [customers.id] }),
  createdByAffiliateUser: one(affiliateUsers, {
    fields: [carts.createdByAffiliateUserId],
    references: [affiliateUsers.id],
  }),
}));
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
}));
export const cartViewsRelations = relations(cartViews, ({ one }) => ({
  cart: one(carts, { fields: [cartViews.cartId], references: [carts.id] }),
}));
export const cartCouponsRelations = relations(cartCoupons, ({ one }) => ({
  cart: one(carts, { fields: [cartCoupons.cartId], references: [carts.id] }),
  coupon: one(coupons, { fields: [cartCoupons.couponId], references: [coupons.id] }),
}));
export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  events: many(orderEvents),
  affiliate: one(affiliates, { fields: [orders.affiliateId], references: [affiliates.id] }),
  cart: one(carts, { fields: [orders.cartId], references: [carts.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));
export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));
export const payoutsRelations = relations(payouts, ({ many, one }) => ({
  proofs: many(payoutProofs),
  affiliate: one(affiliates, { fields: [payouts.affiliateId], references: [affiliates.id] }),
}));
export const payoutProofsRelations = relations(payoutProofs, ({ one }) => ({
  payout: one(payouts, { fields: [payoutProofs.payoutId], references: [payouts.id] }),
  file: one(files, { fields: [payoutProofs.fileId], references: [files.id] }),
}));

export type Category = (typeof categoryEnum.enumValues)[number];
export type Currency = (typeof currencyEnum.enumValues)[number];
export type UserType = (typeof userTypeEnum.enumValues)[number];
export type MarginScope = (typeof marginScopeEnum.enumValues)[number];
export type DiscountType = (typeof discountTypeEnum.enumValues)[number];
export type CouponIssuer = (typeof couponIssuerEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
