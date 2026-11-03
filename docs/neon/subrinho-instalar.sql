-- ============================================================================
-- Subrinho — INSTALAR banco (tabelas + dados de exemplo)
--
-- Funciona em qualquer situação: banco vazio, tabelas já criadas pelo deploy,
-- instalação pela metade ou já instalada. O que já existe é mantido.
--
-- Neon → SQL Editor → (se aparecer "Failed transaction", clique em ROLLBACK)
--      → apague tudo do editor → cole este arquivo inteiro → Run.
-- No final aparece uma tabela com a contagem (lojas, pedidos...).
--
-- Acessos de exemplo (TROQUE AS SENHAS antes de usar de verdade):
--   Painel Subrinho  /subrinho/login  admin@subrinho.com.br   / subrinho123
--   Painel Afiliado  /afiliado/login  ana@viagensdaana.com.br / afiliado123
--   Loja             /loja/viagens-da-ana  maria@cliente.com.br / cliente123
--
-- Gerado por scripts/neon-sql.ts (npm run neon:sql) — não edite à mão.
-- ============================================================================

BEGIN;
SET LOCAL search_path = public;

-- ───────── 1. Estrutura (cria só o que falta) ─────────
-- Migração 0000_init
DO $$ BEGIN
  CREATE TYPE "public"."affiliate_role" AS ENUM('ADMIN', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."cart_item_status" AS ENUM('ACTIVE', 'EXPIRED', 'REMOVED', 'UNAVAILABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."cart_status" AS ENUM('OPEN', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."category" AS ENUM('TICKETS', 'LODGING', 'HOUSES', 'INSURANCE', 'CHIP', 'CAR_RENTAL', 'REMOTE_GUIDE', 'CRUISE', 'TRANSFER', 'ITINERARY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."coupon_issuer" AS ENUM('SUBRINHO', 'AFFILIATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."currency" AS ENUM('BRL', 'USD', 'EUR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'FIXED', 'CONDITIONAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."margin_owner" AS ENUM('SUBRINHO', 'AFFILIATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."margin_scope" AS ENUM('DEFAULT', 'CATEGORY', 'SUPPLIER', 'PRODUCT', 'PRODUCT_OPTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."payment_method" AS ENUM('PIX', 'CARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."payout_status" AS ENUM('SCHEDULED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."subrinho_role" AS ENUM('OWNER', 'ADMIN', 'FINANCE', 'SUPPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."user_type" AS ENUM('SUBRINHO', 'AFFILIATE', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "affiliate_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "affiliate_role" DEFAULT 'AGENT' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_users_email_unique" UNIQUE("email")
);
CREATE TABLE IF NOT EXISTS "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"document" text,
	"slug" text NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"logo_url" text,
	"brand_color" text DEFAULT '#E4113F' NOT NULL,
	"pix_key" text,
	"bank_name" text,
	"bank_agency" text,
	"bank_account" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_slug_unique" UNIQUE("slug")
);
CREATE TABLE IF NOT EXISTS "cart_coupons" (
	"cart_id" uuid NOT NULL,
	"coupon_id" uuid NOT NULL,
	"layer" "coupon_issuer" NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_coupons_cart_id_layer_pk" PRIMARY KEY("cart_id","layer")
);
CREATE TABLE IF NOT EXISTS "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"supplier_code" text NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text,
	"location" text,
	"service_date" date,
	"service_end_date" date,
	"expires_at" timestamp with time zone,
	"pax" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"cost_currency" "currency" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supplier_quote_ref" text,
	"quoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "cart_item_status" DEFAULT 'ACTIVE' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"notice_acknowledged" boolean DEFAULT false NOT NULL,
	"affiliate_margin_override_pct" numeric(7, 4),
	"override_by_affiliate_user_id" uuid,
	"override_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "cart_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page" text NOT NULL,
	"viewer_type" "user_type",
	"viewer_id" uuid,
	"visitor_id" text,
	"ip_hash" text,
	"user_agent" text
);
CREATE TABLE IF NOT EXISTS "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"status" "cart_status" DEFAULT 'OPEN' NOT NULL,
	"created_by_type" "user_type",
	"created_by_customer_id" uuid,
	"created_by_affiliate_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"converted_order_id" uuid,
	"converted_at" timestamp with time zone,
	CONSTRAINT "carts_token_unique" UNIQUE("token")
);
CREATE TABLE IF NOT EXISTS "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"issuer" "coupon_issuer" NOT NULL,
	"affiliate_id" uuid,
	"scope_key" text NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"percent_off" numeric(7, 4),
	"amount_off" numeric(14, 2),
	"step_amount" numeric(14, 2),
	"max_discount" numeric(14, 2),
	"min_subtotal" numeric(14, 2),
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_type" "user_type" NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"document" text,
	"birth_date" date,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_type" "user_type",
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "fortnight_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payout_date" date NOT NULL,
	"summary" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by_type" text NOT NULL,
	"generated_by_id" uuid
);
CREATE TABLE IF NOT EXISTS "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" "currency" NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
CREATE TABLE IF NOT EXISTS "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
CREATE TABLE IF NOT EXISTS "margin_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" "margin_owner" NOT NULL,
	"affiliate_id" uuid,
	"scope" "margin_scope" NOT NULL,
	"category" "category",
	"supplier_code" text,
	"product_id" text,
	"option_id" text,
	"label" text,
	"margin_pct" numeric(7, 4) NOT NULL,
	"scope_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
CREATE TABLE IF NOT EXISTS "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"cart_item_id" uuid,
	"category" "category" NOT NULL,
	"supplier_code" text NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"title" text NOT NULL,
	"subtitle" text,
	"location" text,
	"service_date" date,
	"service_end_date" date,
	"pax" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_currency" "currency" NOT NULL,
	"cost_foreign" numeric(14, 4) NOT NULL,
	"fx_rate" numeric(12, 6) NOT NULL,
	"cost_brl" numeric(14, 2) NOT NULL,
	"subrinho_margin_pct" numeric(7, 4) NOT NULL,
	"subrinho_margin_rule_id" uuid,
	"subrinho_margin_amount" numeric(14, 2) NOT NULL,
	"net_subrinho" numeric(14, 2) NOT NULL,
	"affiliate_margin_pct" numeric(7, 4) NOT NULL,
	"affiliate_margin_source" text NOT NULL,
	"affiliate_margin_rule_id" uuid,
	"affiliate_margin_amount" numeric(14, 2) NOT NULL,
	"net_affiliate" numeric(14, 2) NOT NULL,
	"subrinho_discount" numeric(14, 2) NOT NULL,
	"affiliate_discount" numeric(14, 2) NOT NULL,
	"final_pix" numeric(14, 2) NOT NULL,
	"installment_fee_pct" numeric(7, 4) NOT NULL,
	"final_installment" numeric(14, 2) NOT NULL,
	"charged_amount" numeric(14, 2) NOT NULL,
	"effective_subrinho_margin_pct" numeric(7, 4) NOT NULL,
	"effective_affiliate_margin_pct" numeric(7, 4) NOT NULL,
	"affiliate_commission" numeric(14, 2) NOT NULL,
	"subrinho_revenue" numeric(14, 2) NOT NULL,
	"supplier_quote_ref" text,
	"supplier_booking_ref" text,
	"supplier_status" text,
	"supplier_payload" jsonb
);
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"cart_id" uuid NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"customer_id" uuid,
	"placed_by_affiliate_user_id" uuid,
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"cart_created_at" timestamp with time zone NOT NULL,
	"cart_created_by_type" "user_type",
	"cart_created_by_id" uuid,
	"cart_view_count_at_order" integer DEFAULT 0 NOT NULL,
	"customer_data" jsonb NOT NULL,
	"payer_data" jsonb NOT NULL,
	"travelers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cost_brl" numeric(14, 2) NOT NULL,
	"total_subrinho_margin" numeric(14, 2) NOT NULL,
	"total_net_subrinho" numeric(14, 2) NOT NULL,
	"total_affiliate_margin" numeric(14, 2) NOT NULL,
	"total_net_affiliate" numeric(14, 2) NOT NULL,
	"total_subrinho_discount" numeric(14, 2) NOT NULL,
	"total_affiliate_discount" numeric(14, 2) NOT NULL,
	"total_pix" numeric(14, 2) NOT NULL,
	"total_installment" numeric(14, 2) NOT NULL,
	"installment_fee_pct" numeric(7, 4) NOT NULL,
	"amount_charged" numeric(14, 2) NOT NULL,
	"subrinho_revenue" numeric(14, 2) NOT NULL,
	"affiliate_commission" numeric(14, 2) NOT NULL,
	"fx_snapshot" jsonb NOT NULL,
	"coupons_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_provider" text NOT NULL,
	"payment_ref" text,
	"payment_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"payout_date" date,
	"payout_id" uuid,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number")
);
CREATE TABLE IF NOT EXISTS "payout_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"note" text,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"report_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"scheduled_date" date NOT NULL,
	"orders_count" integer NOT NULL,
	"gross_sales" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "payout_status" DEFAULT 'SCHEDULED' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_type" "user_type" NOT NULL,
	"user_id" uuid NOT NULL,
	"store_affiliate_id" uuid,
	"admin_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text
);
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "subrinho_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "subrinho_role" DEFAULT 'ADMIN' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subrinho_users_email_unique" UNIQUE("email")
);
CREATE TABLE IF NOT EXISTS "suppliers" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"default_currency" "currency" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text
);
DO $$ BEGIN
  ALTER TABLE "affiliate_users" ADD CONSTRAINT "affiliate_users_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "cart_coupons" ADD CONSTRAINT "cart_coupons_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "cart_coupons" ADD CONSTRAINT "cart_coupons_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "cart_views" ADD CONSTRAINT "cart_views_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "carts" ADD CONSTRAINT "carts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "carts" ADD CONSTRAINT "carts_created_by_customer_id_customers_id_fk" FOREIGN KEY ("created_by_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "carts" ADD CONSTRAINT "carts_created_by_affiliate_user_id_affiliate_users_id_fk" FOREIGN KEY ("created_by_affiliate_user_id") REFERENCES "public"."affiliate_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "coupons_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "margin_rules" ADD CONSTRAINT "margin_rules_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_affiliate_user_id_affiliate_users_id_fk" FOREIGN KEY ("placed_by_affiliate_user_id") REFERENCES "public"."affiliate_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payout_proofs" ADD CONSTRAINT "payout_proofs_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payout_proofs" ADD CONSTRAINT "payout_proofs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_report_id_fortnight_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fortnight_reports"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "affiliate_users_affiliate_idx" ON "affiliate_users" USING btree ("affiliate_id");
CREATE INDEX IF NOT EXISTS "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");
CREATE INDEX IF NOT EXISTS "cart_views_cart_idx" ON "cart_views" USING btree ("cart_id","viewed_at");
CREATE INDEX IF NOT EXISTS "carts_affiliate_idx" ON "carts" USING btree ("affiliate_id","created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_scope_code_uq" ON "coupons" USING btree ("scope_key","code");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_affiliate_email_uq" ON "customers" USING btree ("affiliate_id","email");
CREATE UNIQUE INDEX IF NOT EXISTS "fortnight_reports_period_uq" ON "fortnight_reports" USING btree ("period_start");
CREATE INDEX IF NOT EXISTS "fx_rates_currency_idx" ON "fx_rates" USING btree ("currency","fetched_at");
CREATE UNIQUE INDEX IF NOT EXISTS "margin_rules_scope_uq" ON "margin_rules" USING btree ("scope_key");
CREATE INDEX IF NOT EXISTS "order_events_order_idx" ON "order_events" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "order_items_order_idx" ON "order_items" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "orders_affiliate_idx" ON "orders" USING btree ("affiliate_id","created_at");
CREATE INDEX IF NOT EXISTS "orders_paid_idx" ON "orders" USING btree ("status","paid_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_affiliate_period_uq" ON "payouts" USING btree ("affiliate_id","period_start");
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_type","user_id");
-- Migração 0001_white_label
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "logo_on_dark_url" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "favicon_url" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "dark_color" text DEFAULT '#0A0A0B' NOT NULL;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "font_family" text DEFAULT 'inter-tight' NOT NULL;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "hero_title" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "hero_subtitle" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "hero_image_url" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "hero_image2_url" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "tagline" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "instagram" text;
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "show_powered_by" boolean DEFAULT true NOT NULL;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;

-- ───────── 2. Registro das migrações (deploys na Vercel não recriam nada) ─────────
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT 'cc82c7b8b87848166c0ba109f3d56de356a9895cecd43c1282e9e6c6fd4cf0df', 1793738509985 WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'cc82c7b8b87848166c0ba109f3d56de356a9895cecd43c1282e9e6c6fd4cf0df');
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT '5711f6b68afa084672aef9331fee8e9988f9d128b3ab7ddbc8164a5e0b734629', 1793744798484 WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '5711f6b68afa084672aef9331fee8e9988f9d128b3ab7ddbc8164a5e0b734629');

-- ───────── 3. Dados de exemplo (o que já existir é ignorado) ─────────
--
-- PostgreSQL database dump
--

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

--
-- Data for Name: affiliates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.affiliates (id, name, legal_name, document, slug, email, phone, whatsapp, logo_url, brand_color, pix_key, bank_name, bank_agency, bank_account, active, created_at, logo_on_dark_url, favicon_url, dark_color, font_family, hero_title, hero_subtitle, hero_image_url, hero_image2_url, tagline, instagram, show_powered_by) VALUES
	('8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'Viagens da Ana', 'Ana Souza Turismo LTDA', '12.345.678/0001-90', 'viagens-da-ana', 'contato@viagensdaana.com.br', '(11) 3333-4444', '5511999990000', NULL, '#E4113F', '12.345.678/0001-90', 'Banco do Brasil', '1234-5', '98765-4', true, '2026-11-03 22:39:35.083424+00', NULL, NULL, '#0A0A0B', 'inter-tight', 'Viaje mais.
Pague em 10x.', NULL, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=75&w=1200&h=1500', 'https://images.unsplash.com/photo-1520466809213-7b9a56adcd45?auto=format&fit=crop&q=75&w=900&h=1000', 'Viajar com a Ana é viajar com quem entende.', 'viagensdaana', true),
	('c6994c2f-43bc-4dfc-8414-6691817ef944', 'Rota Brasil Turismo', NULL, NULL, 'rota-brasil', 'contato@rotabrasil.com.br', NULL, NULL, NULL, '#0F766E', 'contato@rotabrasil.com.br', NULL, NULL, NULL, true, '2026-11-03 22:39:35.217525+00', NULL, NULL, '#0B2B26', 'manrope', 'O mundo
começa aqui.', 'Pacotes, hotéis e ingressos com o cuidado da Rota Brasil — atendimento de segunda a sábado.', 'https://images.unsplash.com/photo-1598966739654-5e9a252d8c32?auto=format&fit=crop&q=75&w=1200&h=1500', 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?auto=format&fit=crop&q=75&w=900&h=1000', 'Rota Brasil Turismo — viajando com você desde 2009.', 'rotabrasil', true),
	('2430a981-f5c5-48e7-acdf-dedce00eafb3', 'Sol & Mar Viagens', NULL, NULL, 'sol-e-mar', 'ola@solemar.com.br', '(81) 3222-1100', '5581988887777', '/api/public/files/d76b9e00-c0ed-4a83-94a2-e0c812cd6f2e', '#FFC531', 'ola@solemar.com.br', NULL, NULL, NULL, true, '2026-11-03 22:39:35.286877+00', '/api/public/files/9a16b58d-a9fc-4be7-8ce7-b821bcfdd627', NULL, '#10214A', 'fraunces', 'O verão
nunca acaba.', 'Resorts, casas com piscina e ingressos para curtir o ano inteiro — no Pix ou em 10x.', 'https://images.unsplash.com/photo-1551918120-9739cb430c6d?auto=format&fit=crop&q=75&w=1200&h=1500', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=75&w=900&h=1000', 'Praia, sol e viagens sem preocupação.', 'solemarviagens', false) ON CONFLICT DO NOTHING;

--
-- Data for Name: affiliate_users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.affiliate_users (id, affiliate_id, name, email, password_hash, role, active, created_at) VALUES
	('51a57e35-078b-444a-88f9-520cb238749e', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'Ana Souza', 'ana@viagensdaana.com.br', '$2b$10$ArH6V1v18mZFlJNmviDlSeYB643Dr6hbI9mtDO4S7bBUQW2VKc5.m', 'ADMIN', true, '2026-11-03 22:39:35.148815+00'),
	('73ba93f7-beb6-43bc-aa28-9054ef20b2a0', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'Bruno Lima', 'bruno@viagensdaana.com.br', '$2b$10$AYyIP/7bgZjB60wMQQAvWuPD2EGIzbonZU911c8fWUe5xrPiAHxu.', 'AGENT', true, '2026-11-03 22:39:35.214363+00'),
	('7d450f27-852e-4b19-9d77-bddd41cf7c4f', 'c6994c2f-43bc-4dfc-8414-6691817ef944', 'Carlos Rocha', 'carlos@rotabrasil.com.br', '$2b$10$RrKQ5a.PdNfGzdGVa8lVzOVS5xvVdk2uHCYZnjBhz3hpid/AbBIKS', 'ADMIN', true, '2026-11-03 22:39:35.282512+00'),
	('ebb9af83-770f-4634-adbb-d35fc1e61db5', '2430a981-f5c5-48e7-acdf-dedce00eafb3', 'Marina Costa', 'marina@solemar.com.br', '$2b$10$MQ0yis0yniQcTEkQbEAkC.nOD4ecMx8H7KJkJRTVpGjHfqz1dPOJC', 'ADMIN', true, '2026-11-03 22:39:35.351597+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.customers (id, affiliate_id, name, email, phone, document, birth_date, password_hash, created_at) VALUES
	('e31cb832-3bff-4be3-8522-f45d1409aa2a', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'Maria Oliveira', 'maria@cliente.com.br', '(11) 98888-1111', '123.456.789-09', '1988-04-12', '$2b$10$wiJL7oVCIQDddC2n.6gvEOI6vxel0IOOK.5rY6sTJv3frF8i9MBzu', '2026-11-03 22:39:35.440786+00'),
	('e2d229c7-ef0e-4dfb-9658-a206debca10b', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'João Pereira', 'joao@cliente.com.br', '(21) 97777-2222', '987.654.321-00', NULL, '$2b$10$CijAQISD4jOR/UTExPq/huk2fiwAKZ1lOl20mpBrdCwjTxvVTs4bK', '2026-11-03 22:39:35.506525+00'),
	('5b51e82d-f12b-4814-b7bd-c18eb05f8e10', 'c6994c2f-43bc-4dfc-8414-6691817ef944', 'Lúcia Santos', 'lucia@cliente.com.br', '(31) 96666-3333', '111.222.333-96', NULL, '$2b$10$wVbvaD5ryUxgGkzJGJWIZe0bTS/skEJnyLhhRFFE90oB3juXCwMt6', '2026-11-03 22:39:35.572047+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.carts (id, token, affiliate_id, status, created_by_type, created_by_customer_id, created_by_affiliate_user_id, created_at, updated_at, view_count, last_viewed_at, converted_order_id, converted_at) VALUES
	('36c5d579-5ee2-4b41-8c0b-f034a0d920b6', 'niB9xubvUNyH', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'OPEN', 'CUSTOMER', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', NULL, '2026-11-03 21:39:35.778+00', '2026-11-03 21:39:35.778+00', 1, '2026-11-03 22:39:35.781+00', NULL, NULL),
	('3ae3c866-c9b3-4294-893d-dd5d9775f623', 'cZ2oCdNRcqyd', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CONVERTED', 'AFFILIATE', NULL, '73ba93f7-beb6-43bc-aa28-9054ef20b2a0', '2026-10-02 13:15:00+00', '2026-10-02 13:15:00+00', 7, '2026-11-03 22:39:35.586+00', '3cd626ca-4255-4e41-ba2b-ce85e1740aad', '2026-10-05 19:40:00+00'),
	('4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', 'pJnzemmriiCj', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CONVERTED', 'CUSTOMER', 'e2d229c7-ef0e-4dfb-9658-a206debca10b', NULL, '2026-10-08 12:00:00+00', '2026-10-08 12:00:00+00', 4, '2026-11-03 22:39:35.628+00', '63be7a2a-6b8f-4761-8e5f-cf61f43b4618', '2026-10-12 14:20:00+00'),
	('a3521eaa-4aa1-43ee-973d-713df285ff4f', 'v745XYfGRiQY', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'OPEN', 'AFFILIATE', NULL, '51a57e35-078b-444a-88f9-520cb238749e', '2026-10-29 22:39:35.791+00', '2026-10-29 22:39:35.791+00', 9, '2026-11-03 22:39:35.804+00', NULL, NULL),
	('38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', 'WunfAWWyUz3L', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CONVERTED', 'CUSTOMER', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', NULL, '2026-10-17 22:30:00+00', '2026-10-17 22:30:00+00', 11, '2026-11-03 22:39:35.662+00', 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', '2026-10-21 11:05:00+00'),
	('abc78d7e-e338-4503-b2a4-ac04f9eb9cb3', 'eGFtb2NaackH', 'c6994c2f-43bc-4dfc-8414-6691817ef944', 'CONVERTED', 'CUSTOMER', '5b51e82d-f12b-4814-b7bd-c18eb05f8e10', NULL, '2026-10-06 16:00:00+00', '2026-10-06 16:00:00+00', 3, '2026-11-03 22:39:35.702+00', 'bb9f6dd1-5bc1-4eb5-8355-69430cf3ffd2', '2026-10-07 18:00:00+00'),
	('8321885b-e122-4219-85e3-033cae3efe08', 'afQZzrEmgLtZ', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CONVERTED', 'CUSTOMER', 'e2d229c7-ef0e-4dfb-9658-a206debca10b', NULL, '2026-11-01 22:39:35.747+00', '2026-11-01 22:39:35.747+00', 2, '2026-11-03 22:39:35.755+00', '51f81517-b285-466c-a4fe-873be675fb7c', '2026-11-02 22:39:35.758+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.coupons (id, code, issuer, affiliate_id, scope_key, description, discount_type, percent_off, amount_off, step_amount, max_discount, min_subtotal, categories, starts_at, ends_at, max_redemptions, redemptions, active, created_by_type, created_by_id, created_at) VALUES
	('e672e2cf-8550-4d6b-b56c-979c418b7cb1', 'INGRESSO10', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', '10% em ingressos', 'PERCENT', 10.0000, NULL, NULL, NULL, NULL, '{TICKETS}', NULL, NULL, NULL, 0, true, 'AFFILIATE', '51a57e35-078b-444a-88f9-520cb238749e', '2026-11-03 22:39:35.373807+00'),
	('b7cb781f-dbb1-4b6e-841a-83ac3a980927', 'ROTA50', 'AFFILIATE', 'c6994c2f-43bc-4dfc-8414-6691817ef944', 'c6994c2f-43bc-4dfc-8414-6691817ef944', 'R$ 50 de desconto', 'FIXED', NULL, 50.00, NULL, NULL, 1500.00, '{}', NULL, NULL, NULL, 0, true, 'AFFILIATE', 'c6994c2f-43bc-4dfc-8414-6691817ef944', '2026-11-03 22:39:35.375315+00'),
	('691cc700-87bc-4215-b388-35a0830302e6', 'BEMVINDO5', 'SUBRINHO', NULL, 'SUBRINHO', '5% em hospedagem (campanha Subrinho)', 'PERCENT', 5.0000, NULL, NULL, 300.00, NULL, '{LODGING}', NULL, NULL, NULL, 1, true, 'SUBRINHO', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.370511+00'),
	('ca6192a7-1b89-4e5f-8384-cb10626e4e52', 'ANA100', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'R$ 100 a cada R$ 10.000', 'CONDITIONAL', NULL, 100.00, 10000.00, NULL, NULL, '{}', NULL, NULL, NULL, 1, true, 'AFFILIATE', '51a57e35-078b-444a-88f9-520cb238749e', '2026-11-03 22:39:35.372338+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: cart_coupons; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cart_coupons (cart_id, coupon_id, layer, applied_at) VALUES
	('38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '691cc700-87bc-4215-b388-35a0830302e6', 'SUBRINHO', '2026-11-03 22:39:35.668923+00'),
	('38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', 'ca6192a7-1b89-4e5f-8384-cb10626e4e52', 'AFFILIATE', '2026-11-03 22:39:35.675539+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cart_items (id, cart_id, category, supplier_code, product_id, option_id, title, subtitle, image_url, location, service_date, service_end_date, expires_at, pax, lines, cost_currency, details, supplier_quote_ref, quoted_at, status, status_reason, status_changed_at, notice_acknowledged, affiliate_margin_override_pct, override_by_affiliate_user_id, override_at, created_at) VALUES
	('7225a2ac-c8f9-48ad-8f1c-fbffa85b7202', '3ae3c866-c9b3-4294-893d-dd5d9775f623', 'TICKETS', 'TU_EXPERIENZA', 'colosseo', 'colosseo-vaticano', 'Coliseu, Fórum Romano e Palatino', 'Coliseu + Vaticano', 'https://images.unsplash.com/photo-1555992828-ca4dbe41d294?auto=format&fit=crop&q=75&w=900', 'Roma, Itália', '2026-12-13', NULL, '2026-12-13 03:00:00+00', '{"adults": 2, "children": 1}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "63.30"}, {"type": "CHILD", "label": "Criança (6 a 17 anos)", "quantity": 1, "unitCost": "30.63"}]', 'EUR', '{"duration": "3 horas", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 17 anos)"}], "optionDescription": "Combo Coliseu 1 dia + Museus Vaticanos e Capela Sistina."}', 'TU_-T7TWT5-MW19SW47', '2026-11-03 22:39:35.576328+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.576328+00'),
	('19b3f5b6-a307-4580-9b44-f7db4058e84d', '3ae3c866-c9b3-4294-893d-dd5d9775f623', 'LODGING', 'HOTELBEDS', 'hotelbeds-rom-trevi', 'dbl-bb', 'Palazzo Trevi Boutique Hotel', 'Duplo Clássico · Café da manhã · 5 noites', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&q=75&w=900', 'Centro Histórico, Roma', '2026-12-11', '2026-12-16', '2026-12-11 03:00:00+00', '{"rooms": 1, "adults": 2, "children": 0}', '[{"type": "NIGHT", "label": "Diária Duplo Clássico · Café da manhã", "quantity": 5, "unitCost": "208.90"}]', 'EUR', '{"beds": "1 casal", "room": "Duplo Clássico", "board": "Café da manhã", "stars": 4, "nights": 5, "hotelKey": "rom-trevi", "paxRules": [{"max": 5, "min": 1, "type": "ROOM", "label": "Quartos"}, {"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 8, "min": 0, "type": "CHILD", "label": "Crianças (até 11 anos)"}]}', 'HOT-1R8Z0JJ-MW19SW4A', '2026-11-03 22:39:35.579033+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.579033+00'),
	('179f13b0-039b-4330-a03e-eb870dcfac78', '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', 'TICKETS', 'NADIO', 'disney-mk', 'disney-4d', 'Walt Disney World — Ingresso de 1 parque', '4 dias — 1 parque por dia', 'https://images.unsplash.com/photo-1597466599360-3b9775841aec?auto=format&fit=crop&q=75&w=900', 'Orlando, Flórida', '2027-01-02', NULL, '2027-01-02 03:00:00+00', '{"adults": 2, "children": 2}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "544.82"}, {"type": "CHILD", "label": "Criança (3 a 9 anos)", "quantity": 2, "unitCost": "524.22"}]', 'USD', '{"duration": "1 dia", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (3 a 9 anos)"}], "optionDescription": "Quatro dias consecutivos."}', 'NAD-13ZPUY1-MW19SW5H', '2026-11-03 22:39:35.621478+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.621478+00'),
	('16894bbf-5fbd-4d9b-b16c-77eb145e6d7e', '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', 'HOUSES', 'MASTER_VACATION_HOME', 'windsor-hills-5', 'casa-inteira', 'Casa 5 quartos com piscina — Windsor Hills', '8 noites · 4 hóspedes', 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&q=75&w=900', 'Windsor Hills, Kissimmee', '2026-12-31', '2027-01-08', '2026-12-31 03:00:00+00', '{"adults": 2, "children": 2}', '[{"type": "NIGHT", "label": "Diária da casa", "quantity": 8, "unitCost": "281.86"}, {"type": "FEE", "label": "Taxa de limpeza", "quantity": 1, "unitCost": "250.00"}]', 'USD', '{"nights": 8, "bedrooms": 5, "paxRules": [{"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 11, "min": 0, "type": "CHILD", "label": "Crianças"}], "bathrooms": 4, "maxGuests": 12}', 'MAS-1083MLE-MW19SW5J', '2026-11-03 22:39:35.623801+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.623801+00'),
	('026274c6-d18e-4c4d-8fc5-61cb4f8d82c4', '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', 'LODGING', 'GGT_BEST_BUY', 'ggt_best_buy-orl-lakeside', 'fam-bb', 'Lakeside Resort Orlando', 'Suíte Família · Café da manhã · 14 noites', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=75&w=900', 'Lake Buena Vista, Orlando', '2027-01-12', '2027-01-26', '2027-01-12 03:00:00+00', '{"rooms": 1, "adults": 2, "children": 2}', '[{"type": "NIGHT", "label": "Diária Suíte Família · Café da manhã", "quantity": 14, "unitCost": "288.96"}]', 'USD', '{"beds": "1 king + sofá-cama + beliche", "room": "Suíte Família", "board": "Café da manhã", "stars": 4, "nights": 14, "hotelKey": "orl-lakeside", "paxRules": [{"max": 5, "min": 1, "type": "ROOM", "label": "Quartos"}, {"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 8, "min": 0, "type": "CHILD", "label": "Crianças (até 11 anos)"}]}', 'GGT-1VAM3II-MW19SW67', '2026-11-03 22:39:35.647974+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.647974+00'),
	('fe4f5bd6-a423-4b8a-b3f5-d6dc93379e08', '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', 'INSURANCE', 'INTERMAC', 'im-150', 'América do Norte', 'Seguro Viagem Intermac 150', 'América do Norte · 15 dias · 4 viajante(s)', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&q=75&w=900', 'América do Norte', '2027-01-12', '2027-01-26', '2027-01-12 03:00:00+00', '{"adults": 4, "seniors": 0, "children": 0}', '[{"type": "ADULT", "label": "Viajante até 64 anos · 15 dias", "quantity": 4, "unitCost": "328.50"}]', 'BRL', '{"days": 15, "region": "América do Norte", "luggage": "USD 1.500", "medical": "USD 150.000", "paxRules": [{"max": 15, "min": 0, "type": "ADULT", "label": "Viajantes até 64 anos"}, {"max": 10, "min": 0, "hint": "Tarifa com acréscimo de 80%", "type": "SENIOR", "label": "Viajantes de 65 a 85 anos"}]}', 'INT-1OO59FJ-MW19SW69', '2026-11-03 22:39:35.650199+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.650199+00'),
	('a0e3face-1cb8-4f1e-ade9-14995065de81', '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', 'TICKETS', 'NADIO', 'universal', 'universal-p2p', 'Universal Orlando Resort', '1 dia — Park-to-Park', 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=75&w=900', 'Orlando, Flórida', '2027-01-17', NULL, '2027-01-17 03:00:00+00', '{"adults": 2, "children": 2}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "209.87"}, {"type": "CHILD", "label": "Criança (3 a 9 anos)", "quantity": 2, "unitCost": "204.59"}]', 'USD', '{"duration": "1 dia", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (3 a 9 anos)"}], "optionDescription": "Universal Studios + Islands of Adventure."}', 'NAD-43LCDU-MW19SW6B', '2026-11-03 22:39:35.651824+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.651824+00'),
	('c9e33ed2-0a5a-4db6-bc4d-48bb940f6b7c', 'abc78d7e-e338-4503-b2a4-ac04f9eb9cb3', 'LODGING', 'RATEHAWK', 'ratehawk-lis-chiado', 'dbl-bb', 'Chiado Prime Lisboa', 'Duplo Deluxe · Café da manhã · 5 noites', 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?auto=format&fit=crop&q=75&w=900', 'Chiado, Lisboa', '2026-12-08', '2026-12-13', '2026-12-08 03:00:00+00', '{"rooms": 1, "adults": 2, "children": 0}', '[{"type": "NIGHT", "label": "Diária Duplo Deluxe · Café da manhã", "quantity": 5, "unitCost": "971.42"}]', 'BRL', '{"beds": "1 casal", "room": "Duplo Deluxe", "board": "Café da manhã", "stars": 4, "nights": 5, "hotelKey": "lis-chiado", "paxRules": [{"max": 5, "min": 1, "type": "ROOM", "label": "Quartos"}, {"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 8, "min": 0, "type": "CHILD", "label": "Crianças (até 11 anos)"}]}', 'RAT-81WAF2-MW19SW7M', '2026-11-03 22:39:35.698577+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.698577+00'),
	('925952e0-8687-4587-bcc9-816da1a92807', '8321885b-e122-4219-85e3-033cae3efe08', 'CHIP', 'ESIMX', 'eu-10', 'eu-10', 'eSIM Europa — 10 GB', '15 dias · 2 chip(s)', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=75&w=900', 'Europa', NULL, NULL, NULL, '{"units": 2, "adults": 0, "children": 0}', '[{"type": "UNIT", "label": "eSIM Europa 10 GB · 15 dias", "quantity": 2, "unitCost": "19.00"}]', 'USD', '{"data": "10 GB", "days": 15, "paxRules": [{"max": 20, "min": 1, "type": "UNIT", "label": "Quantidade de chips"}], "countries": ["Itália", "França", "Portugal", "Espanha", "Alemanha"]}', 'ESX-RO9XWK-MW19SW90', '2026-11-03 22:39:35.748761+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.748761+00'),
	('65f38364-1459-4615-8135-bd8703f20666', '8321885b-e122-4219-85e3-033cae3efe08', 'TICKETS', 'TU_EXPERIENZA', 'colosseo', 'colosseo-1d', 'Coliseu, Fórum Romano e Palatino', 'Coliseu 1 dia', 'https://images.unsplash.com/photo-1555992828-ca4dbe41d294?auto=format&fit=crop&q=75&w=900', 'Roma, Itália', '2026-11-23', NULL, '2026-11-23 03:00:00+00', '{"adults": 2, "children": 0}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "25.60"}]', 'EUR', '{"duration": "3 horas", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 17 anos)"}], "optionDescription": "Coliseu + Fórum Romano + Palatino, válido por 1 dia."}', 'TU_-FWXR6I-MW19SW92', '2026-11-03 22:39:35.751216+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.751216+00'),
	('da8c9aea-a387-44b8-8625-86daee0b2094', '36c5d579-5ee2-4b41-8c0b-f034a0d920b6', 'TICKETS', 'TU_EXPERIENZA', 'vaticano', 'vaticano-guiado', 'Museus Vaticanos e Capela Sistina', 'Tour guiado em português', 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&q=75&w=900', 'Cidade do Vaticano', '2026-11-28', NULL, '2026-11-28 03:00:00+00', '{"adults": 2, "children": 0}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "71.55"}]', 'EUR', '{"duration": "3 horas", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 17 anos)"}], "optionDescription": "Guia credenciado em português, grupos pequenos."}', 'TU_-S8VCYL-MW19SW9V', '2026-11-03 22:39:35.779914+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.779914+00'),
	('9568749f-4a0e-47c7-8bb2-c73ef8de5412', 'a3521eaa-4aa1-43ee-973d-713df285ff4f', 'HOUSES', 'MAPRO', 'storey-lake-4', 'casa-inteira', 'Townhouse 4 quartos — Storey Lake', '7 noites · 6 hóspedes', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=75&w=900', 'Storey Lake, Kissimmee', '2027-02-01', '2027-02-08', '2027-02-01 03:00:00+00', '{"adults": 4, "children": 2}', '[{"type": "NIGHT", "label": "Diária da casa", "quantity": 7, "unitCost": "209.37"}, {"type": "FEE", "label": "Taxa de limpeza", "quantity": 1, "unitCost": "180.00"}]', 'USD', '{"nights": 7, "bedrooms": 4, "paxRules": [{"max": 10, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 9, "min": 0, "type": "CHILD", "label": "Crianças"}], "bathrooms": 3, "maxGuests": 10}', 'MAP-CQKCU4-MW19SWA8', '2026-11-03 22:39:35.792947+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.792947+00'),
	('1be60f58-85da-4473-86df-f680235a8657', 'a3521eaa-4aa1-43ee-973d-713df285ff4f', 'TICKETS', 'NADIO', 'disney-mk', 'disney-1d', 'Walt Disney World — Ingresso de 1 parque', '1 dia — 1 parque', 'https://images.unsplash.com/photo-1597466599360-3b9775841aec?auto=format&fit=crop&q=75&w=900', 'Orlando, Flórida', '2027-02-02', NULL, '2027-02-02 03:00:00+00', '{"adults": 4, "children": 2}', '[{"type": "ADULT", "label": "Adulto", "quantity": 4, "unitCost": "172.53"}, {"type": "CHILD", "label": "Criança (3 a 9 anos)", "quantity": 2, "unitCost": "167.11"}]', 'USD', '{"duration": "1 dia", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (3 a 9 anos)"}], "optionDescription": "Um parque por dia."}', 'NAD-XZE5NJ-MW19SWAA', '2026-11-03 22:39:35.794761+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.794761+00'),
	('36f74411-2985-4e15-89e4-aec45bfd3efe', 'a3521eaa-4aa1-43ee-973d-713df285ff4f', 'TICKETS', 'NADIO', 'empire-state', 'esb-86', 'Empire State Building — Observatório', 'Observatório 86º andar', NULL, 'Nova York, EUA', '2026-11-02', NULL, '2026-11-02 22:39:35.805+00', '{"adults": 2, "children": 0}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "53.65"}]', 'USD', '{"paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 12 anos)"}]}', 'NAD-1TOC37I-MW19SWAL', '2026-11-03 22:39:35.806389+00', 'ACTIVE', NULL, NULL, false, NULL, NULL, NULL, '2026-11-03 22:39:35.806389+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: cart_views; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cart_views (id, cart_id, viewed_at, page, viewer_type, viewer_id, visitor_id, ip_hash, user_agent) VALUES
	(1, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(2, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(3, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(4, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'checkout', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(5, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(6, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(7, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '2026-10-02 14:15:00+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(8, '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', '2026-10-08 13:00:00+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(9, '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', '2026-10-08 13:00:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(10, '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', '2026-10-08 13:00:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(11, '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', '2026-10-08 13:00:00+00', 'checkout', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(12, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(13, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(14, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(15, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'checkout', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(16, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(17, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(18, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(19, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(20, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(21, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'checkout', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(22, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '2026-10-17 23:30:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(23, 'abc78d7e-e338-4503-b2a4-ac04f9eb9cb3', '2026-10-06 17:00:00+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(24, 'abc78d7e-e338-4503-b2a4-ac04f9eb9cb3', '2026-10-06 17:00:00+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(25, 'abc78d7e-e338-4503-b2a4-ac04f9eb9cb3', '2026-10-06 17:00:00+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(26, '8321885b-e122-4219-85e3-033cae3efe08', '2026-11-01 23:39:35.747+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(27, '8321885b-e122-4219-85e3-033cae3efe08', '2026-11-01 23:39:35.747+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(28, '36c5d579-5ee2-4b41-8c0b-f034a0d920b6', '2026-11-03 22:39:35.778+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(29, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(30, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(31, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(32, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'checkout', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(33, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed'),
	(34, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(35, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'checkout', NULL, NULL, 'seed-0', NULL, 'seed'),
	(36, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'cart', 'CUSTOMER', NULL, 'seed-1', NULL, 'seed'),
	(37, 'a3521eaa-4aa1-43ee-973d-713df285ff4f', '2026-10-29 23:39:35.791+00', 'cart', NULL, NULL, 'seed-0', NULL, 'seed') ON CONFLICT DO NOTHING;

--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.files (id, filename, mime_type, size, data, uploaded_by_type, uploaded_by_id, created_at, is_public) VALUES
	('d76b9e00-c0ed-4a83-94a2-e0c812cd6f2e', 'sol-e-mar-logo.png', 'image/png', 8493, '\x89504e470d0a1a0a0000000d49484452000002a9000000760806000000ebd10a14000020f44944415478daed9d79d81c45b9b7ef04b3119682b08a608a450d8b1a342c060e08a85880208b10653f70405121448ee00e828a7a24ec41f120a210440183147b58230a48d8c2ae45226b30d062f690bce78fea7c5f0cef9099ee9a999e797ff775f5854edeaaaeaead7ffdd4534ff5a30fd33365644fd1b4fd464fed871042082184680a7d42689511a312af420821841012a91d294c2558851042082124522b2d4c2558851042082124522b2d4c25588510420821fa9848ed44712ab12a84104208d1a522b51bc4a9c4aa10420821449788d46e14a712ab42082184101d2a52fb823895581542082184f877fa4ba0eab98510420821aa46252d761269cb3490acaa42082184e88354ce922a81aafa1042082184a89448952053bd0821841042404596fb25c21a68302dff0b218410a20fd0764baa04aaea4b08218410a2522255824bf526841042085129912aa1a5fa1342082184a8944895c0523d0a21841042544aa44a58a93e85104208212a255225a854af42082184109512a91252aa5f21841042884a8954092809552184104288ca89542184104208211aa1e9a717c9bad78646d5a954a20331d63d0b6cd284aca765c16fa91a164288cea2a9965409d4f6a07a1742082144a7f30e09a5ee15aa7dd9a26aac5b0718056c016c0ebc0b580f580b18020c065602e6027396f9ef1c20036600d3f36be9ff7e210b7eb17a97e8a271f26e60eb7c9c6c0c0ccfc7c83060556020300058022c046603ff045e0566022f022fe4e3e339e06f59f02fa96685109516a942b4e185bb3d7020f0b15c98d6c3aaf9550f0b8d75d3800781a9f9f57016fc1cd5bee890313218d80bd8331f27ebd799b47ffebe58195807d8ec6dee310778167832bfa6018f01cf64c1bfd907eb7c53e09916def2ce2cf89d2b580ffb02bf6be12dcfcc823f59a35e22f52dc88a5a0dfa8235d55837143812388168096a26038191f9b59425c6baa78129c06dc0e42cf857d4fb44c5c6c926c038e073c06a4dbedd50e003f9b52ca7003f506b349d9d8c751fca82ff4bc5ca354e4d23da2e52255025545bf4d2ed0f1c0d9c4e5c9e6c17fd81f7e5d77fe6659b960bd6db88568d7faa27ae982cf84d6bb4f55ac4e565d1f838591b3823ff905b4935d26718077cb642fd703be0236a1651e4052b44a7bd783705fe044c68b340adc516c09781df0397aac5449bc6c9a788cbed474ba0f6390e30d66d5831d12c44c324b5a4ca8a5a4dbac99a6aacdb07f825f5fb9102cc275a35efcd5fda4f01af133781cc0606e5f9ad06ac4eb48a6e056c09ec40f3974785483d4ebe017cb760f245c024e026e03ee025e266c281c40d559b013b010700ef556d57f6ddfe65e0a40af4450b7c5a4d22da2e528568f2647724f053eab70a3d0b9c065cbd82cd4d73f36ba92fe903cbdc7310f049e020603f8d19d101e3e454e05b05934f044eacb1437fe9eefee9c0adc6ba6f039f01cea59a2b1a95200bfe59561093dc5837013826f1ad8f36d69d9605ffaf3657c158d25bf2e764c1afa2ded5fd245bee9715b5da747afb18ebf6072eae73b2eb01be098cc882bfaccceefb2cf80559f0d766c11f44b4ae5eafde242a3e4e8a0ad4e3b2e0c7d41b422a0b7e4916fc44e0c3c0e3aafdcab13ab99f7c1bfba321fa430bd15e912a441327ba91c425fe7a5d160ece823f3d75b89b2cf827b3e0f7246e4858a89611151b27c3800b0b26ff6e16fc0505c7c574e053449700512d8e37d6b5d31ff95862b40721da27526545ed0c3ab19d8c7503899b8f86d499644216fce5cd2c5316fc15c0eec4a0e6425485af506cd9fd396204803263e2af68734c15190eecdba6b97b00f025358168bb4815a2898c252eb3d7c342622cc6a693057f3b70889a4754e863eed882c92fcb825f90a01897d2daa0f5a23edaf5f1300678a7aa5fb455a4ca8ada5974527b19eb56a1b1dda93764c167ad2a5f16fc75c079ea55a202ec029882696f4b341e1653dcdd40f4cec340d9a398b735d68d6e43d94facf1fb5fd4aca26522558826723831e44dbdfca90d653c89ff1f15408876b16389b42f262cc7efd41449790eb8b68982b12918eb3ec65b4f1c5bdad7ae54b30a8954d10d34ba9cfe52ab0b98053f9f1882478876b27989b44b128e8719c0a36a8ea49c95208f7df2a3715b452d1783f38871788568be48d5527f67d209ed66ac7b27b04d83c9e6b7a9b8170273d4b3441b59bb44da2d139745cbb9693f84a700f72778d79fd0a2b97b0be013bdfcd35ce022b5a868994815a289ec5420cd9a6d7a89bc06dcaa26136d647089b4fb252ecb836a8ee4a4b0a61e61ac5ba30565ad6545bd349f2b85a81b9d9e23aacaa8026946b4b1bcb7007babd9449b985d22ed81c6baaf65c13f9fe8a3ed5ce402939aab801f011b94c86328f154ab1f34ab90c6baf58871a497a707385bcd281aa5b025554bfd9d4d07b4df6605d2ecda66912a44bbf85b89b40381efa90aab4b7e30498a48225fcce397368b2f01837af9fdfa2cf8a7d492a25164491555657881349b1beb76cb826ff9d27b16fcd3d47f229610a9f933704489f4071beb7e91053f595559597e4a3cee79e512796c001c045c96ba70c6ba95a91dabf72c359f904815ddc46a05d39d65acdb3e0b7e765faf40635d3fe03dc048e0838005de450cb0bd0af114af21c4ddb6f38179c04ce005e079601af01030350bfe0d75c94a73037149b5e887523fe017c6baadb2e075925a05c9827fcd587729f0f992599dd80c919a7f24f5b62fe0e16ef8f831d6ad9dcfa3efceaf8df2ffae957f380cc9ffbb723e9e16e6d76ce01ff9f577e0afc4432f1ecc82ef13875f18eb46000e783f71a3e6baf93b7e68fefe9903bc9ed7d14ce0e5fc3d74752191aaa5feeea067cac89e7ea3a756d5fa57d45ab025708db16effbef8b235d60d269ea3be277187ed3a75241b945fab03ebe513c9b22c36d6fd19b811b82a0bfe498d9eca099819c6ba3b819d4b64b32170a9b1eed359f09ae3abc978a2b5b2ccbcfd4163dd2e2985a3b1eeeda207749c15357f9e6d88f18747e5d7f006b3596a04589d1abec4c6bad781bb80eb80ebb2e06736e1590e02ae6852554dcb82dfb2c67d07014703c701efabe3fdb326b07c98b459b2a48aaa522696de6ec0e3c6baaf03bfcafdb9ba5d9c5ae211b20703a977f0ae047c24bf4e33d64d012e002666c12f5157ad9480d9b9641e7b03df00beabeaace4c7c8d3c63a0fec5132ab71404aebe6dec0a6bdfcfe72130552ea397428f0b1fc237f8f3a3ff0cbb2465e777b038b8c75bf07cec982bfbbc3df477b03e7536ea31fa01054a2c2f371c9f4ef042e019e35d69d62acdba01b2bc958b7beb1ee22e029e2a685568498190dfc1a78cc58b7bfba6a6598449a18a5a71aebc6a83a2b4b0acbe427f325d854d40a3b754116fcc20ea9d753816b886e0bebb4e1fe0380fd81bb8c75de58f7be0e7c1fbdc358773ef194b424ef5c895451555e4f94cfbb893b976718eb261beb8e33d66dd82502f570e071e0bff209aed58c00ae32d64dca0f5f10edfcaa8b4bf46389bea965e8075c62acdb59b55ac976be0d7824411b8f4d340f6d9b7fb82ecf7ce24127a2c04704f0a0b1ee8b9d245081cb812fa4cc5722555495d4419ffb031f2586719961ac7bd458f76363ddeef9324f2789d321c6ba2b899662d360f2d9c039c4705debe4e2765560ab7c722912887d2fe05163dd47d56ddb2e60ee062e4e90d5206092b16e946ab5928c4f90c721f966a0b27ca5c6ef9765c1ffa30beb7e09d18f745c3e8f6e48f43b1d405cc9da98e8cb7a12d1d77471c1fb0c01ce35d69d936f82ad3a3f050e489da97c524555798cb8f9a7596c995fe388be400f00b703770053b2e0e75654a0ae0b7860eb02c927039fcb827fb917e1fa587e5d68ac3b3617b28d5867d7046e36d67d210bfe67eabe6d655cfe41b669c97c56056e30d67d340bfe51556ba5b89c1894bfccb2f4e0fcc3f4d412f391053eddcb3ff5d09d61a7fe009cf836bbf2b3fc0ac03dc08f8d751b01a7503b3cd78af812b02017bd453e5c2702136bb4df5ac0ab09de4b87532e045e4d1ab6a46a677f7751e1f6fc530bef3500d81ef81a70339019ebee31d69d6eacdbd55837a42202752de0b61202d5f522507b9bd42610376015f9e8bdc858779446567b8775fec1958261c06dc6ba0faa5aab4316fc02d22ca51f97470429ca09c48d95cb735316fc135d56eda766c1efd568d8a82cf81959f09fcfc5fcbc82f7fe8ab1eeb315359c6c40ef074d2c067e0b1c48b42e2f8d76301c18438c1653d74b45882a726f1bef3d80e863351af83ab0d058775f2e106f02eecb825fdce28960703ea8b72890fc0da20575410313eb6f8c759f040e6ff05efd72a13a2b0bfe1a75e396f69155897e8627907603dddac0ada92caac6bae788bee2a9b9280bfed83ed4e4170027d3fb094f8db4ed21c0cf0ab4a3018eacf1cfdd66459d9005ff9d921f16d71aeb8e017e59308b738c75b764c1bf5ab1baf91e31dee9f2efef236b842b9c9e5f138d75fb02bfcac56bafc8275554d5523013b8bf22c51908ec007c1bf823f08ab1ee67b995b555be4217001f2a98f6ec7a2ca8bdf02d8af953f5270686df543db925e2b47feea2f157e2d26d33223c0ccb85ea08d578a5e6c8cb136435b6e03c762cf15090e59996057f731755f50ce2010829daec32e07725c6e0372b56371be51f39cb7205b0533df1b4b3e0af06fe73452f1321aaca79152dd730e028e056e06963ddd8666ebe32d61d40717f9f1ea2437b9109f5ef44cb71115603aec883628be6f58d0fe41f731712ad62cd641de2d2bf3e3eaac3f804798c20ee266fa4df0d20fa4af646b75951cfcc829f9730bf1f96487b54a2cd6ea958957f3f58e226e0d02cf8bae39c67c15fc1dbb827e90522aacc952470ea6e329b023f019e33d69d984fde2945c82a2527fd07b3e09f2f917e5289b41f2686c712e9c5693f63ddc9b940ddba85b75e1f989c6f98116d260bfe11a21b52591ab5148e21c6a25e9e99c4e5db6e611e7069e236bb8f18d7ba084380cf54b4ae5e050e297878ce7912a9a21327e005449fd04e602de07f80878c751f4e98ef49940b8a5c76034dd9934f4ecf85b648275057cd3f1ebe4ffd111896108f287c3e411136cc85ea866a8d4a90c272b96b6e952f2b6a2f6cc4f7bd03b8390b7e4e13f2fd6389b40754b4aebe57c25ff6566ab89669e394a8ba50fd99b1ce01fb7448913707fe68acfbef2cf8f125c5c8cac4738fcb705fc9f44f10435415159ac3883e4767ab372711a8eb0137001f6c30e91959f0171bebee22c6785cb76451861397fe77ca827fa9c1313d7c05cf783bbd1feffaf32c78458e782b9e68997b6fc97cc60187d6d10777037a13b40b88bef39dfaaef90ab563bea6e6018abb706d6fac1b54b18f8197808b4ad4fd1bc6ba6780b79cb2254baae8048e02fed641e51d009c65ac1b5f329f4372915786c74b4edc3d145f9a5acaf11d128cbaea02751d6228b14605ea63c077f3f67c1ad80d9895a0489be54235f51192efaaf1fb33ea0535c7e83909b23aa8ce93e36a1d81faeb7c33975831650e3918088cacd8f39c9bc06f777a6f3f4aa48a4e988467112d2b4f7658d18f37d67dbf44fab271f17a8067133cc7d325d35b605bf5e452027530f1f49a22bbebbfb8ec46862cf8c7808f03ff4c50b411c02dc6ba35133d677f6abbb748a4d6e617943f4afaed36432d6d9f2d80dd6bfcf3783543fdafb592e9df57b1e7b93ac17b7ef72cf87ecb5de749a48a4e11aa7fcf85ced51d56f4938d750d3bbae7274bed50f2de33132d09a5f063dc4fbdb8143f01b62990eec62cf83b7b194f0f127774cf4e50b6f7e74275f504792d0dfadd1b8fab1bd49c1fe752308ac7721cb3824825b5aca8b7e854b286287ba2e1f00a3dcbd359f04f352b738954d14913f11b59f0fb117796bed041459f50206cc82e09c6e78b89caff52823c76530f2e86b1ee23143f52f1476f339eee05f6a2f82938cbb2357063bea9ab0c5bd5f8fd0dcabb9d743be7016f96cc630d6af84ae6fed0b55677ce52f5b794752b54961b9b99b944aae844b13a91e80f7732f04a0714790d729fc006d82ec17d67252aff6b09f2d8aa99b164bb58a00e206e4828e2d3fb5416fce4158ca53b807d8185098abb1d707dbee1af28a36bfcfe97dcf752d46ecbe781ab126475428df8c65fa4f7d3ad9e68b650116f61e50a95e5b16666aeddfda25327e479c099f9e6a4cf12c3eb6c5fe1221f61ac3b2d0bbe5eeb668a3056af252a7b8a7c56223afbdfa3dedb109f01b62c98f6b7758ea51b8d7507e602a7ec3b6147e03a63dd1e59f0f30ba4dfb9c6ef7f5457a88bb3882b4d65d804d81bb866998fa595a96dcd1fdf573e208c758388d6fe91444389256ef45b33bf861037360d6872518654a85a9e6866e6b2a48a4e17ab0bb2e02fc982ff083104cb3780bf10370d558981d43ee7bad68ba22cb313953d559cc08dd5631be6f325d2ded0c038ba96184d62498232ef025c63ac1bd8a000588fdabb966f5257a8ab1def07a624c86a79dfd323e83dd2c82ce0b22e17a61b18ebc619eb6e256e36bc9fe8ff7b12b03f7105e13dc458d9435b2050aba6dd9eec2b0f2a44d909fae92cf833b2e03f0cac071c4cdcf5fa5c458a58d76efd7c27778ab03e7313953b553ec3d54b1b7a396e49ede5ef15b128ff586b64fc4c24867b4bf181b73b70558327b0ed5fe39df40670af7a44dda4f00f1d6dacdb26ef87fd81136afcdd84c447865669fced68acbb1e9801fc18d895dedd1dfa328bb3e0ffd1cc1b342c52fb8d9eaa78875d44b7b66716fccc2cf85f67c11f91056f73817404f188bbe96d2ad6883a4fe95997623e88cb333f51b953e5b39e465c437caa44da678a2cb767c15f42f43d4c55fecb8d752bd5f9f7b502c95f5ff0a8c5becab5893ecc975a53f7261effbc3c0b81f3bb509cbedb58378978e88543c6bcb76376b36fa0ca177d822cf8e959f0bfc8823f3c3ff16663e2f2fb65f99772abd8b18ebf49b5c128d58b7d71a27c56564f6c88323ed6cf95182b1710973253b03f70698d8d38cb0a83ed815135fef957ea0a0db5df62e0dc0459ed67ac1b4eedb053131b3d6dac0304ea5ec023c4a817a20222551ba7445f9dc80310804bf2c96933e2728ecbffdb2c41f57ee0f215fc4d2aa7f854e23295d895486d8c32111e5e2b393e7e9c6f963935c1737c0e5860ac3bea6d36d87cadc6ef33819bd5151ae662e03b409990602be5f3632d9793ae0a3b65ac3b347fde32c6bba9c095c01d44e3c7ac2cf885bddc6b07e06e8954895421ea7d293f433cd16682b16e08b047fe72dd33f138796f0b1fab5fc5f211f5bf30d7236ec428cabc0463e2b45ca87e35c1231d495c1efe7c8d17f69e35d24dd0527fa1b67bc358f7bfc0f125b3dab9c6efb767c13fd445e3ed63c0ff9610a8b380a3b3e0afe9635dade96353cbfd42bc75829f9705ffdb2cf84f031b013f20dd0ef77acec69e5bb1f1bd52a27ce6aa77d54dd9634607261a0b279366e918e05863dd59cb898381c08535fe7e017081ba4261ce214db486dee81a2baab16e18d1a5a4e83cf73cb04d1f14a82d41225588b77f49bf94057f0a3126dea404590e6ba1984b65014e2552e7a847b54ca4ae96b02cc713978f537082b1ee07cbfcffef503b0eecc559f0afa82b149ebbfe06fcbe09593f03fca18baaea9b148fa6b2181893d7b5a88a48d50effee40edd8985805f6012694ccaa1e7fd3574813066870a2c74fe523fbb27a52ddac5e32fd4609fb7e0f700cf0eb44597ed55877aab16e6fe2a971bd311b384ddda034cdb078764df07e639d01feab44165765c1eb8092aa895421faa850ed2186e7b9ab44362bd5719ff9a439ee35d546a55422f539f5a2ba595432fd66c6ba7e09fbfe12e030e0ea44597e0bf80db5fd9dbf9f053f53dda074bbdd4d83f17257c0ebc4d8d3ddc29892f3dbb9ea6512a9a28f62ac7bd958d7b3dcd5d617571edea54c789e7a97bc9f4d50dc55123d76aa9058cfaa57d7cdbf4aa65f0dd8bc097d7f0ce0136559cb6ff611e047ea02c9189f30af8bb2e0bbc9b7fc1325d2ce06feacee555191aaa5e2cea683db6f6d63dd88360bd5fb80c79b2c3eee4f50d435133df2b004792c021ed2c8ab9b14f127776f42df5f08ec074c6ed2732f028ecc825fa42e908c2b811713b5cd795d56376562114fcd3fdc4413f9b78d15c6ba86fc4cd6385815d8a918bb7e436d9d055f2551bb13f0449bcb701bc52c557faff3efee05c656405ca612bb0f77ebf1894d6206f1a4af327ec50702ffd304a13adf58f729e0268a1fdb5a8b7159f07f51f3276daf45c6baf381334a66f59b2cf817bae71de856a7dcf1d372476901fd8b0a54d1d7446da5fac76e1528c3df0ba6ab77c97b32e563d06d90e859df99200f05646f4c582c011e2b99cda8a5e7af37a17c7388075f3c9030dbc959f0f2f16b0e17513e76ee595d5627eb971d06ea562d12a912a8a2c384eaa78c75ebb7b90c4527a8a9758a8059c4534bcab0b6b16e5082677d57823c7eab11d430b726c8e3d4a60d80e0df20faf43d9228cb1d8d751f57b337a5ad6601bf2c91c55d5d68e12eeb6b3fa044da55d42beb14a912a8a20385ea007a39b9a6c5145d4abfbd81bf2d1bf2a71f31be6b59de5332fd1359f053357a1ae6fa0479ec9e2fcd374bfcbc067c0c7832d1b8fe9db1ee436afaa6309ee2a1edceeac2fa28ebf75ce6c8d935d51deb14a9aa02d1a11c63ac6be7d7e87a05d23c9a05df889bc015940f45556a87b7b1ae7f0291fa1375d74202f01ed2f85eff2c3f66b559e59c09ec0aa40868be0a70bdb16e63f580e4edf424706381a47f25cd412655e3b592e9879748fb01f5488954d1ddac03fcb88df72fb22bf492065f2a0b281f3e66db92e9b7a0dcb2d88bc065eaae853937d1589964ac1bdaac4266c1bf08ec42715fed655917b8c958b7b69a3f39452ca267e73ed212a9ffce08635dd1d3f8765157944815ddcf31edf06133d6bd0b18d560b237804b0bdc6e3c104a1477e7928ffb1f25d3ff772eb645312e261e43599651c075c6ba559b55d02cf8e9c0d71265b729d1a23a545d20691bdd42631bf2fed9e8c77507d5c5dc9242757091f9d558370af8b07a637dbc230bbe9ffc52450303bb6af1557f69acdb350b7e5a0bef7912b54fcaa9c58f72ffbd46eb7bbeb1eecbc07505cb3ad258b75116fc8c82e9f72e514f7764c1ff5aa3a6d4785b94b7ff0d09b2fb2870a7b16ebf2cf890b29c79389f53812f25cc7614f05b63dd5e59f06faa3724eb535ba916fe1ff700657cb68f248623ac779cf4077ea86aaf9ffe15151e4202b55ed605ee30d66ddd8a9b19ebb6251e8dda084f52225e6516fc1f28beecdb8f8267531beb2cd1d7b008af028aa49c66dcdd48ba8d2b2381a9c6ba63f21766d9f130d4583796e8b7783ce957e776275a9385680677964c3fc658f79106fefe0ccaaf6ef53d912aa12a3a54a02e652d60b2b1eeb0260bd4ad8916cd465ec40b80cf2608643f0e985230ed970b86ec3abda0e858048ce9a6c0df15e0abc4e0f929581d98003c6cac3bc45837b8c0581861acfb21309db8316e58139ffd3063ddf7d4054413f0148f78b0d40830295fc27fbbf1b28ab1ee22e064557963bc23a510e99932526e0315a50f1c63bb3af00b63dd91c07159f08fa5cad858d70f380c389b78267abd2ccec55ae9f04bf9b2ef1ec4a5a54643f4ac0a5c6eacdbbd5eff5063dd21c0670b1475712eca6fd3a84bfa91b8c858f769e2b2ff4e89b2dd92183bf37c63dd0dc05dc0c3441fe8d789275e0dcac7d646c44811a38821a71a096db684f216d6538c752f64c19fafde20128eab278d757f00f62a91cd30e05e63dda5c423681f0166e5e36613e093c031148b08d3e749ba34d3078490046af5f90fe01163dd9dc6ba23cb6c1431d6ad6cac3b00b88fb879a01181ba1038340bfe9a8413ea3f818f037f2c907c67c0af281491b1ae5fee035964b3c4fc5c942b707f735ea8f388cbdf9727ce7a55e033c473d9ef069e07e6e41f1c738197803fe77de20b0d08d4b9c0d1449fbf4509ca798eb16e3ff50491981456fa9588fea937e5e36521d1e5e94fc0b79713a83d943b58a16fe997d419ca9a2a919a0a63ddcb449fd332cc071e021eccaf278856a237883b57e7012be72fead5893141b722faee7d8262e1976602fb67c1dfdda47a1904fc1438b440f2d9441fbf49c0a3795d0c22c6fcdb99e8bf5a2486df4bc03e59f0f79578ae6773cb432bb9320bfea00e1c1b63f397ebe08a16f1cfc0e1796c4e8c7507110fa768764499cf67c14fa8585b6d4a9a080db5d83e0bfe4f157adea516f876736616fcc97596f96ce0cb2d28530f705c3ef7dedda47b9c9a05ff9d0accad35cbd308c9270c5953255013b223701af59f77df1b8381ed8816a08b897e9d8f13ad45ff02decc05eb0bf9efd702df05f62d2850af04b668964085183f350bfe30e272fcac0693af029c004ccebff4df245acda601e71714a81381adca0854d1701f380bf8207189be4abc0a1c950ba7279729efc47c0c0a5145c6517e13d58a9803ec9b057fa1aabb8d225542550235e18bf8992cf86f67c16f066c43b41c4dab6871a7003b65c11f9405ff8f16d5cf15443fc10b88cb4bade621c065c18fc9cf0617ad1d1f4f65c1ef04ec415c256827338153804db2e07f9e05dfd34b79b5714454752cbd09ec439a506fbdf100b04d16fcb5aaed0a8854219a3089dc9f05fff52cf82d89cb165f00ae262e57b78bb944dfa2d159f03b64c1dfd5867a9999057f1cd14d613c8d5b561ba507b81dd80fd83a0bfe06f5ceb68f0d9f05ff216007e292fadc167f9c1d050ccf82ff4116fcbf5650d6338133d56aa282e32803f624c6fb5d9428db99c05860bb2cf8c755cb8df36fbbfb5306f55f431112db8eb1ebf7241cc095b1ca66c1ff0db810b8308ff5b805f1f8cf6d893bdf47d01c5fbd1ee029a22fd11f805bf3534baa5027d381b1c6ba93893b55f7246eb2593741f66f02f7e65686df64c1ff55a3ab922fd929c01463dd10e20efc3d882e33ef23ddfe83f94417831b814945fa4216fcc979f0ff63d56aa262636809f01d63ddcf892e004751ccedeb01e209839764c1cf51cd16a75f3304aae8da01dc11ee03b970dd3817ab96183e6743e219e66b1243860c253af70f24ae282c22c6349d4fb4cebe9a7f053f47dcf4f014f060feb5dd211f29ae1fd1c23a92e8bfb809b001f04ee246b121791d2c266e209b973ff70bc00ca26bc55460ea8a2c64a2d2fd60cdbc0fbc37bf36ca3f5ed6256e161c945fefc8fbff3ca2ffdc4b44dfede9c4a334a702d3b2e017aa56451f193b4381d1c4a831db1177e9af09ac41dcd13f07c88861db9ece3fe6efc88d06229548954015dd265485104208d1d9f49740150d7e59aabf08218410a2f9225555208410420821245285104208218490481542082184101d2752b511463482fa8b104208215a2252253c8404aa104208212a295225408404aa10420821aa44db8547cf94910a69d468a38d9e2ac12884104288aea6ed1ba724b8545f42082184106fd13c552a8cacaa12a7420821841050b110541262aa172184104288ca89540932d5871042082104546cb97f79faf2f2bfc4a9104208212452738c75f20915bda21054420821846825fd2550453da87f08218410a2e52255024448a80a218410a2522255c24348a80a218410a272225555208410420821245285104208218490481542082184101d2752155a483482fa8b104208215a2252253c8404aa104208212a295225408404aa10420821aac4ff0186911bf854e4cf320000000049454e44ae426082', 'SUBRINHO', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.35276+00', true),
	('9a16b58d-a9fc-4be7-8ce7-b821bcfdd627', 'sol-e-mar-logo-dark.png', 'image/png', 8201, '\x89504e470d0a1a0a0000000d49484452000002a9000000760806000000ebd10a1400001fd04944415478daed9d79b454c5b587bf0d32832838e08c53228a89a838a181382424710c9a8871e4e953a35109f105f3922826266a7c016734264a7cce467d38a1511c11671c500189011c500c4a0833c27e7fd46105f136749f53a7fb74dfdfb7562ff4de5b75aaab7655fd4ed5ae5d4633c6c7f5f2b469adcf04430821841042e442b3105a59c4a8c4ab1042082184446a5d0a530956218410420889d4420b530956218410420889d4420b5309562184104288662652eb519c4aac0a2184104234a8486d04712ab12a84104208d12022b511c5a9c4aa10420821449d8ad4e6204e255685104208213e4f0b09547d6f2184104288a251c8153b89b4951a48abaa420821846886146e25550255f521841042085128912a41a67a114208218480826cf74b8455d060dafe174208214433a0e62ba912a8aa2f2184104288428954092ed59b1042082144a144aa8496ea4f08218410a2502255024bf528841042085128912a61a5fa144208218428944895a052bd0a21841042144aa44a48a97e85104208210a255225a0245485104208210a2752851042082184a884dc6f2fd2ea5e0d1a55b752893ac4dda7025be790f51b66d653352c8410f545ae2ba912a8359aec55ef42082184a873d692506a5ca1da9c5754dd7d03a037b003b03db029d00d580f6807b4055a020b80f92bfd3b1f9803cc00a6279f15fffdbe992d93758906ea275b003b27fd642ba07bd247ba029d80d6402b6039b0049807fc13f81898057c00bc9ff48f69c03b663653352b8428b44815a20613ee9ec0f7810312615a0e9d924f392c71f73780978109c9e755339bafda1775d247da0207010726fd64a33293b648e68bf6c006c0b6ab79c67c602a3029f9bc014c04de36b3cf9a619d6f03bc5dc5473e6166fd0a580fdf05fe52c5475e646643d5eb2552bf688c5a452dc6a0d00c5653ddbd033008388bb0129427ad815ec96705cbdd7d0a300e7814186b661fc9fa44c1fac9d6c010e007c0da393fae03f0d5e4b332e70017aa3572a7afbbef62662f15ac5c43d434a252a2fba44aa0164fa836e8a4dbc2dd4f266c315e560581baba3eb41df01fc0cdc087ee3ed1dd2f75f783ddbdb3acb03ccc6c1b6b02607dd54eea7eb2bebb5f0b4c064ead82401512844dd9e11ec05e6a165173912a441506bc6d8067819104ffb9a2b1037006f07fc028b598a8513f3998b0dd7e12c1ff5a341f8e70f7cd249a45bd1375bb5faba8059dac1a68dbdfdd0f05fe4cf97ea4008b085bf1e393497b32f029e110c83ca04d92dfda4067c2cae88e404f606fb4fa24eaaf9ffc1cf855cae44b81d1c043c0f3c04cc261c2d6840355db027d8123802fabb60b3bb79f019c5d005bdc12384c4d226a2e5285c879b01b045c4bf9ab425381f381bbd670b86941f259e14bfae24acf6c037c0b381218a03e23eaa09f0c037e9932f9adc08f4b9cd05f71ba7f3af088bb9f0b7c0fb89c62ee681402339bca1a6292bbfb48e0e4c88f3ec9ddcf37b37fd5b80a06137f257fbe99759475353ed1b6fbb58a5af089abcedbc7dd0f07ae2b73b073e017400f33bb31cbe97b335b6c66f798d99184d5d5fb654da2e0fd24ad403dcdcc06961b42cacc969bd9adc0aec09baafdc2d199e02b5f4b7b5c8770b05588da8a5421721ce87a11b6f8cb755938dacc7e1d3bdc8d994d32b30381a308ab4a4214a99f7405ae4e99fc57667655ca7e311d3898e012208ac599ee5e4b7fe45308d11e84a89d48d52a6a9d4c6275d84eeede9a70f8a85d9949469ad9cd7996c9cc6e01fa13829a0b51147e42ba6df769c00519fbc4dfd0e19822d21df86e8dc6ee56c08fd404a2e62255881c194cd8662f872584588cb963668f01c7a87944815ee64e4999fc46335b1ca118a3a86ed07a511eb57a7918086cacea173515a95a45adb3c9ac8edacbdd3b52d9e9d407cd6c4eb5ca6766f70257c8aa4401d817582765da4723f58765a47737104df32a90f52ae6ddddbd4f0dcafee3123f7f49cd2aaa265285c891e309216fcae5d91a94f16cfe1d1540885ab14f86b41f442cc75fd414519906dc93a360cc05773f802fde38b6c2d66e53b30a8954d10854ba9d3eb3da0534b34584103c42d492ed33a45d1eb13fcc005e5773446578843c0e4daec6ad16a55c0cae20c4e115227f91aaadfefaa41edacddd370676ab30d9a21a15f76a60be2c4bd4902c57c7f68c5c166de7c67d111e07bc1061ae3fab4a63f70ec0379bf8d502e01ab5a8a89a48152247faa648d3a54693c827c0236a325143da66483b2072595e56734427c66aea09eebe6e15ca5a6a15755432560a21912aea9ede29d2f4a86179ffaa261335645e86b4df77f74d23beb45d6e4d73a19a29357700ef67cca303f16fb5fa1ceede8d1047fa0bbf022e55338aaa89546df5d73775d07edba648b39f44aa68a6bc93216d6be037aac2e2925c4c122392c8e949fcd2bcf811d0a6899fdf6f6693d592a26a2255889ce99e22cdf6eebe7f8d26912925568f0e55538a2af05cc6f447bbfbbeaac642732dc1af330b9b0047e65138776f4fe958bdc3d57c220d6ba90a4441593b65bae1eebea799cd6bee15e8ee067c09e805ec046c096c4a08b0dd91708b573bc269db45c0426016615bf13de00de015608299cd9549169a07095baa9632bd0137b8fb8e66a69bd40a88997de2eea380533366f563e0c61c8a78024d9f0b78d5ccc636c078ba7e328e6e917c364ffe5d0f689f8ca5ed938f112e97594270c5f947f27917f81be1d28b97cdac595c7ee1ee3d806f035f211cd4dc3099e33b24f3cf7ce0d3a48e66011f26f3d05da944aab6fa1bc470c6f572eb33c10a5abcf629d3f504ee76f7c39be364ebee6d09f7a81f483861bb4119c9da249fce40b76420599965eefe1c3006b8c3cc26a9f7144ec0cc70f727807e19b2d90c18e5ee879999c6f8623282b05a9965dcdec9ddf78d291cdd7d75d103ea6e1535f93ebb11e20ff74e3edd2bcc66c5224067c20a7653cff9147812b817b8d7cc66e5f05d8e046ec9a9aade30b39e259edb063809380dd8ae8cf9a70bb06a98b4d9daee1745254b2cbdfd8137ddfd78776f16bb05eebea5bb5fc6bf83651f53a6402d8796c05ec0f9c05beefeb4bb1f950ce4a25802262b87003f575516f665640af04084ac625f957a08b04d133fff304781147b0cede0ee87bafb9f0831b7c70317034790cefdac1cd64deaee3ae03d77bfc3ddf7a9773b75f743082bc697af41a0ae114d32a2a8ccc9987e63e07a60aabb9fe3ee9b34a838ddc8ddaf0126130e2d5423c44c1fe02660a2bb1f2e532d0ca38913a37498bb0f54751696182b93df4ab66063514af45e65664beaa45e87017713dc1636a8c1f35b0187034fbafb03eebe5dbd19a6bbafe5ee57126e498b32e74aa48aa2f269a47cb6209c5c9ee1ee63ddfd3477dfac4104eaf1c09bc07f26035cb5e901dce1eea393cb17440d49b6e807137c533365055cefeefd54ab856ce74781d722b4f1e048e3d0eec98bebaa2c225c742252bc44002fbbfbe9f52450819b811fc6cc5722551495d8419f5b005f27847199e1eeafbbfb25eededfdd3bd499386de7eeb711568ad7a930f93ce03242b8ae0d1271db09d831195cd204623f0878ddddbf2eb3adb980798ab075989536c06877efad5a2d242322e4714c7218282b3f29f1f31bcdec1f0d58f7cb097ea4439271743382df692bc24ed656045fd6b309bea6cb523ea71d70b9bb5f961c822d3ad7125c23a24fdc4214918939e7df3319641e043e75f767dcfd02773f2009a5525481ba21f034f0bd14c9c702db9ad9996636d6cc3e36b3cfcc6c9e994d34b3abcd6c17c2e9e14a7d82bb000fbbfb4932dd9a3304981a219f4ec083eebea3aab470dc4c38059d85b6645cf572f72d81c39afa158d1976ea3e603b33eb6b66bf4fc6d1f7cc6c6e3296ce31b3bf9bd9d3667689991d9c88d691199ef923826f6cda17d75b4b844734b25da7bcb21d1c4f7093884ec5225527fb1b8b02b7e7b3557c562b604fe067c0c3c09ce470d0afdd7d3f776f571081ba1ef028b0734a81fa6d33fbb08c416d2470748a67ac055ce3ee27aa67d5d65480c722e5d51578d4dd7752b51607335b4c9cadf4d392882069398b70b072551e32b3b71aacda8799d94195868d32b31966766a22e617a67cf64fdcfda8822e9c6c42d3174d2c03ee04be9f08f515d10eba030309d162e28b5421aac4f81a3ebb15c1c7eabf814712d1fa94bb9fe7ee7bba7bcb1a0c046d934ebd438ae473811f24135bb903ebedc00d69e6cf44a81e2613aeba8d7472f75f023308a15f62b13ef048ac1555779fe6f930b29935f955c0e2086d7b4cca765c071854e2d78db68a3ad2cccecbf862710fd9aea5bd2c927b466c7e438877baeafcddd3cc8e30b3db93d5e545c9677ab2bafb2d60c09a84bb44aa28ea4ac12ce0858214a735b037702ef00cf091bbff215965ad96afd055c02e29d35e5ace0a6a13fc9274fe542d0881e1b7912557459cb670f75308215f86914f8487ae8950eda11a2fd418797384ac06a71cc74e215c0ab22a6f98d9c30d54d533081720c468b31b81bf64e883bf2858dd6cdec44bce2d40df72e2699bd95dc07f48a48a7ae58a8296ab2b70226195758abb0fcef3f095bb1f417a7f1f2738b4a71950df051e4af9dcb5815b144b357781fad5e465ee6a22f997ad860d085bff7af9280e2322e4d183709abc12bb6b45f0956c8a465b45bdc8cc1646ccefe20c694f2cd86a6a273e7fb1c443c0b16656f6990633bb85d5b82769021145e636e0e38297711be0f7c03477ff713278c714211d330efa2f9bd97b19d28fce90765742782c115f9c9abb0f4d04eace557cf446c0d8e4c08ca83166f61ac14f3d2b95ae140e24c4a25e9559c0ff3650152f0446456eb3e70971add3d08e748766abc1c7c03166f6598ab45748a48a7a1c801713fc42eb81f580ff015e71f75d23e67b36d98222673d40f354c6f4bf4e84b68827503b252f0fbfa5fcf8b8cb097eaaef4528c2668950dd4cad510862ac5cee97acca6715b55757e2fb5e073c6c66f373c8f7990c698f28685dfdc6ccd22e2a3d4209d73289545174a1fa07c2ed15f5c2f6c033ee7e560431d29e70ef71169ecf98fe2d426cd5b474650d3e47a2229be84688d1786085492f30b3eb08711d3f8a5094ee84adff8d52f4e9eeb61a80c74b24fda3ad9e539aa9593c40fa95b9951952a60dee0f34256817137ce7eb75aef949133675684e8f7b3143da3dddbd4dc1aa6f26704d86ba9f0bbc2d912aea95138177eaa8bcad80e1ee3e22633ec724222f0b6f661cb83dc20478669d04a32eba40dd80104a6ca70a934e047e95b4e714607f607684226d9b08d5d857486e5ae2e76fcb0a4af6d1cb226475649937c79512b3372587b9c49ac972c9416ba057c1becfe511fc76a74ba48a7a1d846703fd80497556f433ddfdb719d2678d8be7c409ea3e2563fa2d81dd65c999046a5bc2ed35694ed79fbef24106339b087c03f86784a2f500feeaee5d227dcf1694766f91482dcd0d64bf4a7a7587a156b4cf0e40ff12bf1ea166289b3919d36f57b0ef73578479be7f132bd95748a48a7a11aaef2642e7ae3a2bfa5077afd8d13db9596aef8ccf9e15c93f2c861fe3005971267e0fec9622dd18337ba289fef432e144f7bc0865fb4a22543b47c86b45d0efa678536650727c5c40ca281eab70f21a2295945a45fdab99bdae96289b0519d3772fd07799626693f3ca5c2255d4d3403cd7cc06104e96be5f47451f99226cc8be11fae70791ca3f33421efbcb82d3e1ee7b116252a6e177abe94fe38183487f0bcecaec0c8c490e7565a1d485017389e377d9c85c017c96318f752911ee2ef1872eb5bb335cd55f55362c5059c6e499b944aaa847b17a2bc11f6e28710e81e4cdba243e8115b04784e7ce8e54fe4f22e4b1639eb1641b58a0b6221c4848e3d33bd9ccc6aea12f3d0e7c175812a1b87b00f72707fed2d2a7c4cf5f4a7c2f45e9b67c0fb82342566795886f7c3ad0d4819db7f2162ae20bb42f5059264aa40af1c50179a1995d046c41b89a6f7cc18b7c429987125610238cd52791ca1e239f9614cfd9bf1ef81ed03365da3bcbec4b6308f76b7f16a1bcfb00f766b80fbe5f899f3f2353288b182b9a5b0387acf2b2d49ed2abf9239acb0b84bbb771f75dddfd2477bfd8ddef70f7f1ee3ed9dd3f76f779eebe644df7f7923db45fbb0255cb5b12a942949e60179bd9f566b617f065e0e7c04b84434345a235a5efb92e355164655ea4b2c78a13b8952cb6624ecd90f6c10afad13d846812cb2394795fe06e776f5da100e8b69a179987640a65b5e30bc0b80859adea7b7a024d471a990ddcd8e0c27413771fe2ee8f100e1bbe40f0ff3d1b389cb083f02542acec0e941fbbb851b4dba4e6f24585c83a404f31b30bcc6c57a01b7034e1d4ebb48214b1acd3fac92a548cb03e0b22953b563edd65a5154d8e3d29bdfdbd2696262f6b95f49f5b09e1de62bce0f507eea8f006b6c34bcc497329fe4e499188b19adac7dd774becb005705689bf1b19f9cad022f5bf7ddcfd7e6006700921c6701b99d7e7586666ffc8f301158b54eb3341f10e1b49d835687b9ad92c33bbc9cc4e30b32d13817402e18abbe9352a568f326fe9d990743e88abb22852b963e5d34d3dae220ece90f66d335b94a2df5c4ff03d8c55fe9bddbd65997f7f6c899fdf9ff2aac5e6ca3d915ecc57aca61e42b8fe795596005736a038ddc2dd47132ecdf8365acc5b1df3f27e802a5f340f316e36ddcc6e30b3e3cdac3b61eb791061ab6a46158bb24f197f13eb8051ac897d59a47cdacb122b62cf0c69a765e82b5711b63263703830aac4419c9585c19e40ef12bffe5f994245edb70cb83c425603dcbd3ba5c34edd6a66331ba9eedcfd20e03542d40b21912a44cd06f2bf27beacc79ad916049fa2530901d317e4f8e8af94f137b19ce26389cb58625722b532b24478f82463ffb8043837d2f7f801f08735dc3af6b3123f9f053c2c53a898eb807f65cca325703da55d4e1a2aec94bb1f4b58855e3b433613085167f6003606da94b8fa779f06a9b6dc45ea5aeacb428099bd4db8d166a4bbb703be934cae0746ee275faee6d72a583ea2fc09b31be120465a1646e813e727a7ba7f1ae12b0d226c0f9fdac477dd3be9674d31525bfda9da6eaebbff0938336356fd4afcfc31337ba581fadb01c09f48bf70371b38c9ccee6e66a6967bdfd44aaa105f1ce0179ad99d667618b0397021f14eb89713866a41c1fa77cb48f92c9075954dd66b465b47ea0b4389b3750c708abb0f5f451cb406ae2ef1f78b81ab640aa9b98c38d11a9aa2615651ddbd2bc1a524ed38f71eb05b3314a85541225588d54fd233cdec1cc2e501a32364d9b58a622ed60a702c913a5f16553591ba76c4b29c49d83e8ec159ee7ee14aff7f1ea5e3c05e67661fc914528f5def00ff9743d66f03f7355055fd82f4d15496010393ba164511a93ae1df208398dab122b10a1c0a8ccc985539fea61f11270c50db485f3f968fec87b2a4b2e99c31fde6116ddf8193819b2265f953771fe6ee8710fcf79a621e70becc203379ac78364cf07e775f07f8cf0c59dc61664fcbcc0a26528568a642d509e1799ecc904dcb329eb38838d7bdc63aa8144ba44e931595cdd28ce9b75dc341a54a6d7f39701c7057a42c7f09dc4e697fe7df9ad92c9941e6767b8a0ae3e5ae814f09b1a71b858119c7b7cb656512a9a299e2ee1f3671a35c4d27ae24bc4b96f03ce56e794f8d50dc8e91be76ac90585365d56593f564f6dac0f639d8fe40e081485996f29b7d0df89d4c201a2322e6758d9935926ff93733a49d073c27f32aa848d556719dbf61d76ffbadefee3d6a2c549f07decc597cbc10a1a85d227de5ae11f2580abca29e573631e24ff6cfc1f697000380b1397defa5c020335b2a1388c66dc00791dae68a06ab9b2cb18827242f6e22473e77b0c2dd5d55d23c70afcce73189ed5614fa026fd5b80c8f926ea5eadd32ff6e3c30b800e23296d87db551af4fcc8919849bbeb2f8157f1ff89f1c84ea22773f187888f4d7b696628899bda4e68fda5e4bddfd4ae0828c59dd6e66ef37ce1ce89dc976fdb4dc51aa400b09545166872e927dec5f8032bc9b325db95bde63c91e836e9348df75e3087928207b65c2623930316336bd57dcbf9e43f9e613ae8c7c3162b663cd4c3e7ef9700dd963e70e6fb03ad92863fa3932ab2a89540954516742f56077dfa8c665483b404d285304cc061ecf58c6f5ddbd4d84efba69843cee540faa984722e4312c47213d97e0d3f75aa42cf771f76fa8d97369abd9c09f3364f16403ae7067f5b56f95216d4759659922550255d4a1506d451337d75499b45be98f55f0b75943fe1821be6b56be9431fd5b663641bda762ee8f9047ff646b3e2ff1f3097000302952bffe8bbbefa2a6cf8511a40f6d37bc01eb23abdf73a70c69bbc81ccb14a9aa0251a79ceceeb57c1bed9622cdeb6656899bc02d640f4595e984b7bbb78820527f2f734d25009f268eeff51f926b56f32ae72c603f204640f38ec0fdeebe952c207a3b4d02c6a448fa37e25c6452343ec998be7b86b45f95454aa48ac66603e0921a3e3fcda9d0eb2b9c5416933d7cccee19d3ef40b66db10f801b65aea9b93c525f19edee1df22aa4997d00ec4b7a5fed95d91078c8ddd757f34727cd8ae8a5898fb444eae7e9e1ee696fe3db57a628912a1a9f936be1c3e6ee9b02bd2b4c36171895e2712380bf67286ebf8c5ff76b19d3ff5722b6453aae235c439995dec0bdeede29af829ad974e06791b2db86b0a2da412610b58dfe4a6507f2fe59e9cb751dd5c5828c42b56d9af1d5dd7b03bbca1acb14a9050b2d248adfb18b662f7f76f71daafcccb3297d534e297e97f8ef555adf8b80333294b597bb67b922f3900c691f37b39bd46b32f5b7a519db7f65be0e3ce1ee5be6f0e2d6d9dd47a47c115b9db0bed3ddd7922544b5a91dad7cd631b3790d5c1d59af341d54613f69015c2c2bac40a41654780809d472d91078dcdd77aec6c3dc7d77c2d5a89530890cf12acdec3ed26ffb1a29efa64ec4cc7e299ffb3170b47a4d947e37867807577a0113dcfde464c2ccda1f3ab8fb6082dfe299c4df9deb4f584d16220f9ec8987ea0bbef55c1df5f40f6ddade627522554459d0ad415ac078c75f7e37216a83b03f75638112f068e8a10c87e08302e65da335286ecfa754ad1b11418d84881bf0bc04f09c1f363d0191809bceaeec7b87bdb147da187bb5f0c4c271c8ceb9ae3773fcedd7f23131039f000e9231eac5804189d6ce1afaebf7474f76b80a1aaf2ca582ba610f171bd14ceaaa822b3f1afb1ed0cdce0ee8380d3cc6c62ac8cdddd80e3804b0977a297cbb244ac650ebf94dc1af31dc24d579586e8e904dceceefdcbf50f75f76380a35214755922ca1f55af8bfa92b8d4dd0f031e24dcb816839e84d89957bafb83c093c0ab041fe84f09375eb549fad6e6844811bd0921a72a096db69cec2bace7b8fbfb6676a5ac4144ec5793dcfd3ee0a00cd97405c6bbfb28c215b4af01b3937eb335f02de064d2458469f644dd9a6906424802b5f87c0d78cddd9f70f741590e8ab87b7b773f02789e7078a01281ba0438d6ccee8e38a0fe13f806f04c8ae4fd8007d6148ac8ddcdddcf20dd618945892857e0fe7c26d48584edef9b2367dd09f81ee15ef6a780f780f9c90bc7026026f05c62133fac40a02e004e020e267b4c4a80cbdc7d802c414426c62a7d4b827fea43497f594270797a1638771581ea64bb58a1798d7bb133d46aaa446a345b72ff90e0739a8545c02bc0cbc9e72dc22ad15cc2c9d58540fb64a2ee4c8809ba23c177ef9ba40bbf340b38dccc9ecaa95eda00d702c7a6483e8fe0e3371a783da98b3684987ffd08feab6962f8cd040e35b3e7337cafa9c9ca4335b9cdcc8eacc3be3138995cdb16b488cf01c727b13971f723099753e41d51e654331b59b0b6da8638111a4ab1a7993d5ba0efbb6205bed65c646643cb2cf3a5c43ba0b8da4701a72563ef53393d6398999d5780b1b564792a21faa949eb33c12454255023b10fe1f0cd5184903469680bec917caa227a80d3cdec1fb9b569d8b23fceddc7100e5455e20fd811382bf9c4e2d6e43bcf568fab52bf361beeee0f242f2b5f2b50d13e06ce01fe6466be52796f75f715beb042148d21c9cb79df1c9f311f38daccee71f7bd55e5e591cb5badb6fd2550234dc46f9bd9b966b62db01b61e5e88d8216771cd0d7cc8ecc53a0ae523fb710fc04af226c2f559b57806f9bd94009d49af48fc966d617f80e6197a096cc4ac4e9d666f6c79505ea4ae5d5c11151d4bef4197028c1e73b0f5e047633b37b54db0510a942e43088bc6066ff6d663d09db163f04ee226c57d78a0504dfa23e66b6b7993d59837a996566a711dc1446101cf6f3c481c78001c0ce66f6a0acb3e67de30133db05d89bb0a5bea0ca2f672702ddcdec4233fbd71aca7a1170915a4d14b01fcd010e048611c7877ac5cbdb60600f337b53b55c399fdbee77776dd33710ee78c40e5c985559337b07b81ab83a89f5b803e1facfdd0927df7b908faf9e039309be44f7018f24b79614a14ea60383dd7d28e1a4ea818443361b46c8fe33607cb2ca70bb99fd4dbdab9093ec38609cbbb7239cc0ff0ec165663be29d3f584488023006189dc616cc6c68b2f57f8a5a4d14ac0f2d07ce73f73f125c004e24ddb9841709175b5c6f66f355b319da440255d4a3505dbd38f716c0568958dd92103e6733c21de65d083e9c1d08cefdad093b0a4b09314d171156673f4ede82a7110e3d4c065e4edeb6ebe425c58db0c2da0bd889b002bd09b031e1a058bba40e96110e902d4cbef7fbc00c826bc50460c29a56c844a1eda04b62035f4e3e9b272f2f1b120e0bb6493e6b25f6bf90e03f379370d27f3ae12acd09c01b66b644b52a9a49dfe900f421f87def4138a5df05589770a27f3e308710b66d4af232ff78b268206289540954d168425508218410f54d0b095451e19ba5ec4508218410f98b545581104208218490481542082184104222550821841042d49d48d541185109b217218410425445a44a78080954218410421452a44a8008095421841042144a7bd4ba003eae97421a55da687d2648300a218410a2a1a9f9c129092ed59710420821c417344f910aa35555895321841042082858082a0931d58b1042082144e144aa0499ea4308218410020ab6ddbf2acd79fb5fe2540821841012a92b44a1bb7c4245d386a2105442082184a8222d24504539c83e841042085175912a01222454851042085128912ae121245485104208513891aa2a10420821841012a942082184104248a40a2184104288ba13a90a2d242a41f62284104288aa8854090f21812a84104288428a54091021812a8410428822f1ff8ce49991a2d188880000000049454e44ae426082', 'SUBRINHO', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.35431+00', true),
	('90d45419-a6a0-4d87-9bbb-4427e4174731', 'comprovante-2026-10-01.pdf', 'application/pdf', 408, '\x255044462d312e340a312030206f626a3c3c2f547970652f436174616c6f672f50616765732032203020523e3e656e646f626a20322030206f626a3c3c2f547970652f50616765732f4b6964735b33203020525d2f436f756e7420313e3e656e646f626a20332030206f626a3c3c2f547970652f506167652f506172656e742032203020522f4d65646961426f785b30203020333030203134345d2f436f6e74656e74732034203020522f5265736f75726365733c3c2f466f6e743c3c2f46312035203020523e3e3e3e3e3e656e646f626a20342030206f626a3c3c2f4c656e6774682036303e3e73747265616d0a4254202f4631203134205466203230203130302054642028436f6d70726f76616e746520646520726570617373652053756272696e686f2920546a2045540a656e6473747265616d20656e646f626a20352030206f626a3c3c2f547970652f466f6e742f537562747970652f54797065312f42617365466f6e742f48656c7665746963613e3e656e646f626a0a747261696c65723c3c2f526f6f742031203020523e3e0a2525454f46', 'SUBRINHO', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.742087+00', false),
	('a2f9ffa0-2ee3-42a3-a91e-ad574ec53f65', 'comprovante-2026-10-01.pdf', 'application/pdf', 408, '\x255044462d312e340a312030206f626a3c3c2f547970652f436174616c6f672f50616765732032203020523e3e656e646f626a20322030206f626a3c3c2f547970652f50616765732f4b6964735b33203020525d2f436f756e7420313e3e656e646f626a20332030206f626a3c3c2f547970652f506167652f506172656e742032203020522f4d65646961426f785b30203020333030203134345d2f436f6e74656e74732034203020522f5265736f75726365733c3c2f466f6e743c3c2f46312035203020523e3e3e3e3e3e656e646f626a20342030206f626a3c3c2f4c656e6774682036303e3e73747265616d0a4254202f4631203134205466203230203130302054642028436f6d70726f76616e746520646520726570617373652053756272696e686f2920546a2045540a656e6473747265616d20656e646f626a20352030206f626a3c3c2f547970652f466f6e742f537562747970652f54797065312f42617365466f6e742f48656c7665746963613e3e656e646f626a0a747261696c65723c3c2f526f6f742031203020523e3e0a2525454f46', 'SUBRINHO', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.746009+00', false) ON CONFLICT DO NOTHING;

--
-- Data for Name: fortnight_reports; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.fortnight_reports (id, period_start, period_end, payout_date, summary, generated_at, generated_by_type, generated_by_id) VALUES
	('8018cec8-20e3-4824-9310-8a268bca4f3a', '2026-10-01', '2026-10-15', '2026-10-22', '{"period": {"end": "2026-10-15", "half": 1, "start": "2026-10-01"}, "totals": {"items": 5, "orders": 3, "costBrl": "34212.20", "totalPix": "38360.59", "amountCharged": "41686.00", "installmentFees": "3325.41", "subrinhoRevenue": "1701.13", "subrinhoDiscount": "0.00", "affiliateDiscount": "0.00", "affiliateCommission": "2447.26"}, "byCategory": [{"items": 2, "label": "Ingressos e Experiências", "category": "TICKETS", "finalPix": "12748.48", "subrinhoRevenue": "536.54", "affiliateCommission": "825.31"}, {"items": 2, "label": "Hospedagem", "category": "LODGING", "finalPix": "11707.86", "subrinhoRevenue": "582.70", "affiliateCommission": "648.65"}, {"items": 1, "label": "Casas", "category": "HOUSES", "finalPix": "13904.25", "subrinhoRevenue": "581.89", "affiliateCommission": "973.30"}], "bySupplier": [{"items": 1, "costBrl": "845.90", "supplierCode": "TU_EXPERIENZA"}, {"items": 1, "costBrl": "5619.41", "supplierCode": "HOTELBEDS"}, {"items": 1, "costBrl": "10540.73", "supplierCode": "NADIO"}, {"items": 1, "costBrl": "12349.06", "supplierCode": "MASTER_VACATION_HOME"}, {"items": 1, "costBrl": "4857.10", "supplierCode": "RATEHAWK"}], "payoutDate": "2026-10-22", "byAffiliate": [{"name": "Viagens da Ana", "orders": 2, "commission": "2178.17", "affiliateId": "8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9", "amountCharged": "35727.38"}, {"name": "Rota Brasil Turismo", "orders": 1, "commission": "269.09", "affiliateId": "c6994c2f-43bc-4dfc-8414-6691817ef944", "amountCharged": "5958.62"}]}', '2026-11-03 22:39:35.725981+00', 'CRON', NULL),
	('fd477710-cf88-41a7-89de-6af9182a1459', '2026-10-16', '2026-10-31', '2026-11-09', '{"period": {"end": "2026-10-31", "half": 2, "start": "2026-10-16"}, "totals": {"items": 3, "orders": 1, "costBrl": "25344.60", "totalPix": "28035.52", "amountCharged": "28035.52", "installmentFees": "0.00", "subrinhoRevenue": "1121.43", "subrinhoDiscount": "300.00", "affiliateDiscount": "200.00", "affiliateCommission": "1569.49"}, "byCategory": [{"items": 1, "label": "Hospedagem", "category": "LODGING", "finalPix": "21877.20", "subrinhoRevenue": "749.69", "affiliateCommission": "1183.49"}, {"items": 1, "label": "Seguro Viagem", "category": "INSURANCE", "finalPix": "1539.68", "subrinhoRevenue": "179.18", "affiliateCommission": "46.50"}, {"items": 1, "label": "Ingressos e Experiências", "category": "TICKETS", "finalPix": "4618.64", "subrinhoRevenue": "192.56", "affiliateCommission": "339.50"}], "bySupplier": [{"items": 1, "costBrl": "19944.02", "supplierCode": "GGT_BEST_BUY"}, {"items": 1, "costBrl": "1314.00", "supplierCode": "INTERMAC"}, {"items": 1, "costBrl": "4086.58", "supplierCode": "NADIO"}], "payoutDate": "2026-11-09", "byAffiliate": [{"name": "Viagens da Ana", "orders": 1, "commission": "1569.49", "affiliateId": "8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9", "amountCharged": "28035.52"}]}', '2026-11-03 22:39:35.735904+00', 'CRON', NULL) ON CONFLICT DO NOTHING;

--
-- Data for Name: fx_rates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.fx_rates (id, currency, rate, source, fetched_at, created_by) VALUES
	(1, 'USD', 4.930000, 'poolvo', '2026-11-03 22:39:34.932723+00', NULL),
	(2, 'EUR', 5.380000, 'poolvo', '2026-11-03 22:39:34.933849+00', NULL) ON CONFLICT DO NOTHING;

--
-- Data for Name: holidays; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.holidays (date, name) VALUES
	('2026-01-25', 'Aniversário de São Paulo'),
	('2026-07-09', 'Revolução Constitucionalista (SP)'),
	('2027-01-25', 'Aniversário de São Paulo'),
	('2027-07-09', 'Revolução Constitucionalista (SP)') ON CONFLICT DO NOTHING;

--
-- Data for Name: margin_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.margin_rules (id, owner, affiliate_id, scope, category, supplier_code, product_id, option_id, label, margin_pct, scope_key, updated_at, updated_by) VALUES
	('75f732c7-2e1c-49dd-8464-2ddd3b36f333', 'SUBRINHO', NULL, 'DEFAULT', NULL, NULL, NULL, NULL, 'Padrão Subrinho', 4.5000, 'SUBRINHO|DEFAULT', '2026-11-03 22:39:35.076+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51'),
	('b381d293-f455-4b75-94db-0f0d720b4ea4', 'SUBRINHO', NULL, 'CATEGORY', 'LODGING', NULL, NULL, NULL, 'Hospedagem', 5.0000, 'SUBRINHO|CATEGORY|LODGING', '2026-11-03 22:39:35.078+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51'),
	('66466ee3-6323-4295-bdff-2eff92ab24b4', 'SUBRINHO', NULL, 'CATEGORY', 'INSURANCE', NULL, NULL, NULL, 'Seguro Viagem', 12.0000, 'SUBRINHO|CATEGORY|INSURANCE', '2026-11-03 22:39:35.079+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51'),
	('79b184dc-b076-4b2e-8fb7-212ecb860ac0', 'SUBRINHO', NULL, 'CATEGORY', 'CHIP', NULL, NULL, NULL, 'Chip', 15.0000, 'SUBRINHO|CATEGORY|CHIP', '2026-11-03 22:39:35.08+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51'),
	('2215acc0-8226-4c44-bd1c-72fa6ae7c445', 'SUBRINHO', NULL, 'SUPPLIER', NULL, 'HOTELBEDS', NULL, NULL, 'Hotelbeds', 5.5000, 'SUBRINHO|SUPPLIER|HOTELBEDS', '2026-11-03 22:39:35.081+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51'),
	('96f5ad58-56d4-4da2-a5d8-a1fa1e41527d', 'AFFILIATE', '2430a981-f5c5-48e7-acdf-dedce00eafb3', 'DEFAULT', NULL, NULL, NULL, NULL, 'Padrão', 6.0000, 'AFFILIATE:2430a981-f5c5-48e7-acdf-dedce00eafb3|DEFAULT', '2026-11-03 22:39:35.356+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51'),
	('0fa575e9-f9b6-46a1-94d4-3db174a1db07', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'DEFAULT', NULL, NULL, NULL, NULL, 'Padrão', 3.7000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|DEFAULT', '2026-11-03 22:39:35.358+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('c307a828-d328-472b-a6ce-c7b71291a3f7', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CATEGORY', 'TICKETS', NULL, NULL, NULL, 'Ingressos', 8.0000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|CATEGORY|TICKETS', '2026-11-03 22:39:35.359+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('e4f119ba-6c6b-439f-8568-e355009a0b73', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CATEGORY', 'LODGING', NULL, NULL, NULL, 'Hospedagem', 6.0000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|CATEGORY|LODGING', '2026-11-03 22:39:35.36+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('a857e2b8-a7a0-4412-9815-b4642a7e8c82', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'CATEGORY', 'HOUSES', NULL, NULL, NULL, 'Casas', 7.0000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|CATEGORY|HOUSES', '2026-11-03 22:39:35.362+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('453158b5-440a-4a0b-bfa8-0e5c4792a950', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'PRODUCT', 'TICKETS', 'TU_EXPERIENZA', 'colosseo', NULL, 'Coliseu, Fórum Romano e Palatino', 10.0000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|PRODUCT|TU_EXPERIENZA|colosseo', '2026-11-03 22:39:35.363+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('2dd87ce4-2e91-4bda-aec3-aebd71eb745b', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'PRODUCT_OPTION', 'TICKETS', 'TU_EXPERIENZA', 'colosseo', 'colosseo-vaticano', 'Coliseu + Vaticano', 12.0000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|PRODUCT_OPTION|TU_EXPERIENZA|colosseo|colosseo-vaticano', '2026-11-03 22:39:35.365+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('589c5b90-5c88-402d-975d-ac96441ceb3a', 'AFFILIATE', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'PRODUCT', 'TICKETS', 'NADIO', 'disney-mk', NULL, 'Walt Disney World', 6.0000, 'AFFILIATE:8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9|PRODUCT|NADIO|disney-mk', '2026-11-03 22:39:35.367+00', '51a57e35-078b-444a-88f9-520cb238749e'),
	('53828477-ee28-471e-846e-df18b821673a', 'AFFILIATE', 'c6994c2f-43bc-4dfc-8414-6691817ef944', 'DEFAULT', NULL, NULL, NULL, NULL, 'Padrão', 5.0000, 'AFFILIATE:c6994c2f-43bc-4dfc-8414-6691817ef944|DEFAULT', '2026-11-03 22:39:35.368+00', '51a57e35-078b-444a-88f9-520cb238749e') ON CONFLICT DO NOTHING;

--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.orders (id, number, cart_id, affiliate_id, customer_id, placed_by_affiliate_user_id, status, payment_method, installments, cart_created_at, cart_created_by_type, cart_created_by_id, cart_view_count_at_order, customer_data, payer_data, travelers, total_cost_brl, total_subrinho_margin, total_net_subrinho, total_affiliate_margin, total_net_affiliate, total_subrinho_discount, total_affiliate_discount, total_pix, total_installment, installment_fee_pct, amount_charged, subrinho_revenue, affiliate_commission, fx_snapshot, coupons_snapshot, payment_provider, payment_ref, payment_data, paid_at, cancelled_at, payout_date, payout_id, ip, user_agent, created_at) VALUES
	('bb9f6dd1-5bc1-4eb5-8355-69430cf3ffd2', 4, 'abc78d7e-e338-4503-b2a4-ac04f9eb9cb3', 'c6994c2f-43bc-4dfc-8414-6691817ef944', '5b51e82d-f12b-4814-b7bd-c18eb05f8e10', NULL, 'PAID', 'CARD', 10, '2026-10-06 16:00:00+00', 'CUSTOMER', '5b51e82d-f12b-4814-b7bd-c18eb05f8e10', 3, '{"name": "Lúcia Santos", "email": "lucia@cliente.com.br", "phone": "(31) 96666-3333", "document": "111.222.333-96", "birthDate": null}', '{"name": "Lúcia Santos", "email": "lucia@cliente.com.br", "phone": "(31) 96666-3333", "document": "111.222.333-96"}', '[{"name": "Lúcia Santos", "document": "111.222.333-96"}]', 4857.10, 255.64, 5112.74, 269.09, 5381.83, 0.00, 0.00, 5381.83, 5958.62, 9.6800, 5958.62, 255.64, 269.09, '{"EUR": {"rate": "5.380000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.933Z"}, "USD": {"rate": "4.930000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.932Z"}}', '[]', 'mock', 'MOCK-XvtEX4lpV7M', '{"card": {"ref": "MOCK-XvtEX4lpV7M", "brand": "Visa", "last4": "1111", "holder": "LÚCIA SANTOS", "message": "Pagamento aprovado", "installments": 10}, "confirmedAt": "2026-10-07T18:00:00.000Z"}', '2026-10-07 18:00:00+00', NULL, '2026-10-22', '4d2379cd-68f9-4b72-b50a-c5f86a0b3b6a', NULL, 'seed', '2026-10-07 17:40:00+00'),
	('c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', 3, '38d9c8ef-dc1a-4e5f-b1aa-11ac9a992e1f', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', NULL, 'PAID', 'PIX', 1, '2026-10-17 22:30:00+00', 'CUSTOMER', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', 11, '{"name": "Maria Oliveira", "email": "maria@cliente.com.br", "phone": "(11) 98888-1111", "document": "123.456.789-09", "birthDate": "1988-04-12"}', '{"name": "Maria Oliveira", "email": "maria@cliente.com.br", "phone": "(11) 98888-1111", "document": "123.456.789-09"}', '[{"name": "Maria Oliveira", "document": "123.456.789-09"}]', 25344.60, 1421.43, 26766.03, 1769.49, 28535.52, 300.00, 200.00, 28035.52, 31040.21, 9.6800, 28035.52, 1121.43, 1569.49, '{"EUR": {"rate": "5.380000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.933Z"}, "USD": {"rate": "4.930000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.932Z"}}', '[{"id": "691cc700-87bc-4215-b388-35a0830302e6", "code": "BEMVINDO5", "rule": "5% de desconto", "layer": "SUBRINHO", "applied": "300.00", "amountOff": null, "requested": "300.00", "categories": ["LODGING"], "percentOff": "5.0000", "stepAmount": null, "discountType": "PERCENT", "limitedByMargin": false, "eligibleSubtotal": "22333.73"}, {"id": "ca6192a7-1b89-4e5f-8384-cb10626e4e52", "code": "ANA100", "rule": "R$ 100,00 a cada R$ 10.000,00", "layer": "AFFILIATE", "applied": "200.00", "amountOff": "100.00", "requested": "200.00", "categories": [], "percentOff": null, "stepAmount": "10000.00", "discountType": "CONDITIONAL", "limitedByMargin": false, "eligibleSubtotal": "28535.52"}]', 'mock', 'SUB3LHB45Li7', '{"pix": {"txid": "SUB3LHB45Li7", "brCode": "00020126480014br.gov.bcb.pix0126financeiro@subrinho.com.br520400005303986540828035.525802BR5908SUBRINHO6009SAO PAULO62160512SUB3LHB45Li763043DA4", "expiresAt": "2026-11-03T23:09:35.688Z"}, "confirmedAt": "2026-10-21T11:05:00.000Z"}', '2026-10-21 11:05:00+00', NULL, '2026-11-09', '744b8871-5173-4705-a232-c307d0fa7f91', NULL, 'seed', '2026-10-21 10:45:00+00'),
	('51f81517-b285-466c-a4fe-873be675fb7c', 5, '8321885b-e122-4219-85e3-033cae3efe08', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'e2d229c7-ef0e-4dfb-9658-a206debca10b', NULL, 'PAID', 'PIX', 1, '2026-11-01 22:39:35.747+00', 'CUSTOMER', 'e2d229c7-ef0e-4dfb-9658-a206debca10b', 2, '{"name": "João Pereira", "email": "joao@cliente.com.br", "phone": "(21) 97777-2222", "document": "987.654.321-00", "birthDate": null}', '{"name": "João Pereira", "email": "joao@cliente.com.br", "phone": "(21) 97777-2222", "document": "987.654.321-00"}', '[{"name": "João Pereira", "document": "987.654.321-00"}]', 462.80, 46.04, 508.84, 40.52, 549.36, 0.00, 0.00, 549.36, 608.24, 9.6800, 549.36, 46.04, 40.52, '{"EUR": {"rate": "5.380000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.933Z"}, "USD": {"rate": "4.930000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.932Z"}}', '[]', 'mock', 'SUB58ADiM2B', '{"pix": {"txid": "SUB58ADiM2B", "brCode": "00020126480014br.gov.bcb.pix0126financeiro@subrinho.com.br5204000053039865406549.365802BR5908SUBRINHO6009SAO PAULO62150511SUB58ADiM2B6304CCC7", "expiresAt": "2026-11-03T23:09:35.771Z"}, "confirmedAt": "2026-11-02T22:39:35.758Z"}', '2026-11-02 22:39:35.758+00', NULL, '2026-11-23', NULL, NULL, 'seed', '2026-11-02 22:19:35.758+00'),
	('0e2703d4-9aec-4e99-a7c8-d04e6b2b0673', 6, '36c5d579-5ee2-4b41-8c0b-f034a0d920b6', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', NULL, 'PENDING_PAYMENT', 'PIX', 1, '2026-11-03 21:39:35.778+00', 'CUSTOMER', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', 1, '{"name": "Maria Oliveira", "email": "maria@cliente.com.br", "phone": "(11) 98888-1111", "document": "123.456.789-09", "birthDate": "1988-04-12"}', '{"name": "Maria Oliveira", "email": "maria@cliente.com.br", "document": "123.456.789-09"}', '[]', 769.88, 36.28, 806.16, 70.10, 876.26, 0.00, 0.00, 876.26, 970.17, 9.6800, 876.26, 36.28, 70.10, '{"EUR": {"rate": "5.380000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.933Z"}, "USD": {"rate": "4.930000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.932Z"}}', '[]', 'mock', 'SUB6TYVzvjL', '{"pix": {"txid": "SUB6TYVzvjL", "brCode": "00020126480014br.gov.bcb.pix0126financeiro@subrinho.com.br5204000053039865406876.265802BR5908SUBRINHO6009SAO PAULO62150511SUB6TYVzvjL6304A67A", "expiresAt": "2026-11-03T23:09:35.790Z"}}', NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-03 22:39:35.787876+00'),
	('3cd626ca-4255-4e41-ba2b-ce85e1740aad', 1, '3ae3c866-c9b3-4294-893d-dd5d9775f623', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'e31cb832-3bff-4be3-8522-f45d1409aa2a', '73ba93f7-beb6-43bc-aa28-9054ef20b2a0', 'PAID', 'PIX', 1, '2026-10-02 13:15:00+00', 'AFFILIATE', '73ba93f7-beb6-43bc-aa28-9054ef20b2a0', 7, '{"name": "Maria Oliveira", "email": "maria@cliente.com.br", "phone": "(11) 98888-1111", "document": "123.456.789-09", "birthDate": "1988-04-12"}', '{"name": "Carlos Oliveira", "email": "carlos.oliveira@email.com", "phone": "(11) 98888-1111", "document": "321.654.987-91"}', '[{"name": "Maria Oliveira", "document": "123.456.789-09"}]', 6465.31, 366.92, 6832.23, 500.35, 7332.58, 0.00, 0.00, 7332.58, 8118.45, 9.6800, 7332.58, 366.92, 500.35, '{"EUR": {"rate": "5.380000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.933Z"}, "USD": {"rate": "4.930000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.932Z"}}', '[]', 'mock', 'SUB1DE49dVym', '{"pix": {"txid": "SUB1DE49dVym", "brCode": "00020126480014br.gov.bcb.pix0126financeiro@subrinho.com.br52040000530398654077332.585802BR5908SUBRINHO6009SAO PAULO62160512SUB1DE49dVym6304031B", "expiresAt": "2026-11-03T23:09:35.609Z"}, "confirmedAt": "2026-10-05T19:40:00.000Z"}', '2026-10-05 19:40:00+00', NULL, '2026-10-22', '0621aa28-c103-4be1-a946-9a6f44e3dfa2', NULL, 'seed', '2026-10-05 19:20:00+00'),
	('63be7a2a-6b8f-4761-8e5f-cf61f43b4618', 2, '4882a4e6-69c6-48fa-bf63-71d99bd6d2a7', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'e2d229c7-ef0e-4dfb-9658-a206debca10b', NULL, 'PAID', 'CARD', 10, '2026-10-08 12:00:00+00', 'CUSTOMER', 'e2d229c7-ef0e-4dfb-9658-a206debca10b', 4, '{"name": "João Pereira", "email": "joao@cliente.com.br", "phone": "(21) 97777-2222", "document": "987.654.321-00", "birthDate": null}', '{"name": "João Pereira", "email": "joao@cliente.com.br", "phone": "(21) 97777-2222", "document": "987.654.321-00"}', '[{"name": "João Pereira", "document": "987.654.321-00"}]', 22889.79, 1078.57, 23968.36, 1677.82, 25646.18, 0.00, 0.00, 25646.18, 28394.80, 9.6800, 28394.80, 1078.57, 1677.82, '{"EUR": {"rate": "5.380000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.933Z"}, "USD": {"rate": "4.930000", "source": "poolvo", "fetchedAt": "2026-11-03T22:39:34.932Z"}}', '[]', 'mock', 'MOCK-bggCNzIcsuA', '{"card": {"ref": "MOCK-bggCNzIcsuA", "brand": "Visa", "last4": "1111", "holder": "JOÃO PEREIRA", "message": "Pagamento aprovado", "installments": 10}, "confirmedAt": "2026-10-12T14:20:00.000Z"}', '2026-10-12 14:20:00+00', NULL, '2026-10-22', '0621aa28-c103-4be1-a946-9a6f44e3dfa2', NULL, 'seed', '2026-10-12 14:00:00+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: order_events; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.order_events (id, order_id, type, data, created_at) VALUES
	(1, '3cd626ca-4255-4e41-ba2b-ce85e1740aad', 'ORDER_CREATED', '{"installments": 1, "amountCharged": "7332.58", "paymentMethod": "PIX", "placedByAffiliateUserId": "73ba93f7-beb6-43bc-aa28-9054ef20b2a0"}', '2026-11-03 22:39:35.608713+00'),
	(2, '3cd626ca-4255-4e41-ba2b-ce85e1740aad', 'PIX_CREATED', '{"txid": "SUB1DE49dVym", "expiresAt": "2026-11-03T23:09:35.609Z"}', '2026-11-03 22:39:35.61094+00'),
	(3, '3cd626ca-4255-4e41-ba2b-ce85e1740aad', 'PAID', '{"ref": "SUB1DE49dVym", "paidAt": "2026-10-05T19:40:00.000Z", "payoutDate": "2026-10-22"}', '2026-11-03 22:39:35.61636+00'),
	(4, '63be7a2a-6b8f-4761-8e5f-cf61f43b4618', 'ORDER_CREATED', '{"installments": 10, "amountCharged": "28394.80", "paymentMethod": "CARD", "placedByAffiliateUserId": null}', '2026-11-03 22:39:35.638964+00'),
	(5, '63be7a2a-6b8f-4761-8e5f-cf61f43b4618', 'PAID', '{"ref": "MOCK-bggCNzIcsuA", "paidAt": "2026-10-12T14:20:00.000Z", "payoutDate": "2026-10-22"}', '2026-11-03 22:39:35.643443+00'),
	(6, 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', 'ORDER_CREATED', '{"installments": 1, "amountCharged": "28035.52", "paymentMethod": "PIX", "placedByAffiliateUserId": null}', '2026-11-03 22:39:35.688391+00'),
	(7, 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', 'PIX_CREATED', '{"txid": "SUB3LHB45Li7", "expiresAt": "2026-11-03T23:09:35.688Z"}', '2026-11-03 22:39:35.689889+00'),
	(8, 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', 'PAID', '{"ref": "SUB3LHB45Li7", "paidAt": "2026-10-21T11:05:00.000Z", "payoutDate": "2026-11-09"}', '2026-11-03 22:39:35.693689+00'),
	(9, 'bb9f6dd1-5bc1-4eb5-8355-69430cf3ffd2', 'ORDER_CREATED', '{"installments": 10, "amountCharged": "5958.62", "paymentMethod": "CARD", "placedByAffiliateUserId": null}', '2026-11-03 22:39:35.713012+00'),
	(10, 'bb9f6dd1-5bc1-4eb5-8355-69430cf3ffd2', 'PAID', '{"ref": "MOCK-XvtEX4lpV7M", "paidAt": "2026-10-07T18:00:00.000Z", "payoutDate": "2026-10-22"}', '2026-11-03 22:39:35.717859+00'),
	(11, '51f81517-b285-466c-a4fe-873be675fb7c', 'ORDER_CREATED', '{"installments": 1, "amountCharged": "549.36", "paymentMethod": "PIX", "placedByAffiliateUserId": null}', '2026-11-03 22:39:35.770701+00'),
	(12, '51f81517-b285-466c-a4fe-873be675fb7c', 'PIX_CREATED', '{"txid": "SUB58ADiM2B", "expiresAt": "2026-11-03T23:09:35.771Z"}', '2026-11-03 22:39:35.772245+00'),
	(13, '51f81517-b285-466c-a4fe-873be675fb7c', 'PAID', '{"ref": "SUB58ADiM2B", "paidAt": "2026-11-02T22:39:35.758Z", "payoutDate": "2026-11-23"}', '2026-11-03 22:39:35.775654+00'),
	(14, '0e2703d4-9aec-4e99-a7c8-d04e6b2b0673', 'ORDER_CREATED', '{"installments": 1, "amountCharged": "876.26", "paymentMethod": "PIX", "placedByAffiliateUserId": null}', '2026-11-03 22:39:35.789737+00'),
	(15, '0e2703d4-9aec-4e99-a7c8-d04e6b2b0673', 'PIX_CREATED', '{"txid": "SUB6TYVzvjL", "expiresAt": "2026-11-03T23:09:35.790Z"}', '2026-11-03 22:39:35.79113+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.order_items (id, order_id, cart_item_id, category, supplier_code, product_id, option_id, title, subtitle, location, service_date, service_end_date, pax, lines, details, cost_currency, cost_foreign, fx_rate, cost_brl, subrinho_margin_pct, subrinho_margin_rule_id, subrinho_margin_amount, net_subrinho, affiliate_margin_pct, affiliate_margin_source, affiliate_margin_rule_id, affiliate_margin_amount, net_affiliate, subrinho_discount, affiliate_discount, final_pix, installment_fee_pct, final_installment, charged_amount, effective_subrinho_margin_pct, effective_affiliate_margin_pct, affiliate_commission, subrinho_revenue, supplier_quote_ref, supplier_booking_ref, supplier_status, supplier_payload) VALUES
	('8f505e2b-2eae-4e8e-9555-d7b5e90d304c', '3cd626ca-4255-4e41-ba2b-ce85e1740aad', '7225a2ac-c8f9-48ad-8f1c-fbffa85b7202', 'TICKETS', 'TU_EXPERIENZA', 'colosseo', 'colosseo-vaticano', 'Coliseu, Fórum Romano e Palatino', 'Coliseu + Vaticano', 'Roma, Itália', '2026-12-13', NULL, '{"adults": 2, "children": 1}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "63.30"}, {"type": "CHILD", "label": "Criança (6 a 17 anos)", "quantity": 1, "unitCost": "30.63"}]', '{"duration": "3 horas", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 17 anos)"}], "optionDescription": "Combo Coliseu 1 dia + Museus Vaticanos e Capela Sistina."}', 'EUR', 157.2300, 5.380000, 845.90, 4.5000, '75f732c7-2e1c-49dd-8464-2ddd3b36f333', 39.86, 885.76, 12.0000, 'RULE', '2dd87ce4-2e91-4bda-aec3-aebd71eb745b', 120.79, 1006.55, 0.00, 0.00, 1006.55, 9.6800, 1114.43, 1006.55, 4.5001, 12.0004, 120.79, 39.86, 'TU_-T7TWT5-MW19SW47', 'TU16651648', 'CONFIRMED', '{"mock": true}'),
	('68320eb8-c9b0-4be1-8496-433b18f1e9c7', '3cd626ca-4255-4e41-ba2b-ce85e1740aad', '19b3f5b6-a307-4580-9b44-f7db4058e84d', 'LODGING', 'HOTELBEDS', 'hotelbeds-rom-trevi', 'dbl-bb', 'Palazzo Trevi Boutique Hotel', 'Duplo Clássico · Café da manhã · 5 noites', 'Centro Histórico, Roma', '2026-12-11', '2026-12-16', '{"rooms": 1, "adults": 2, "children": 0}', '[{"type": "NIGHT", "label": "Diária Duplo Clássico · Café da manhã", "quantity": 5, "unitCost": "208.90"}]', '{"beds": "1 casal", "room": "Duplo Clássico", "board": "Café da manhã", "stars": 4, "nights": 5, "hotelKey": "rom-trevi", "paxRules": [{"max": 5, "min": 1, "type": "ROOM", "label": "Quartos"}, {"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 8, "min": 0, "type": "CHILD", "label": "Crianças (até 11 anos)"}]}', 'EUR', 1044.5000, 5.380000, 5619.41, 5.5000, '2215acc0-8226-4c44-bd1c-72fa6ae7c445', 327.06, 5946.47, 6.0000, 'RULE', 'e4f119ba-6c6b-439f-8568-e355009a0b73', 379.56, 6326.03, 0.00, 0.00, 6326.03, 9.6800, 7004.02, 6326.03, 5.5001, 6.0000, 379.56, 327.06, 'HOT-1R8Z0JJ-MW19SW4A', 'HT19195724', 'CONFIRMED', '{"mock": true}'),
	('6185ae14-248f-404f-ad21-fa7a6273f0f4', '63be7a2a-6b8f-4761-8e5f-cf61f43b4618', '179f13b0-039b-4330-a03e-eb870dcfac78', 'TICKETS', 'NADIO', 'disney-mk', 'disney-4d', 'Walt Disney World — Ingresso de 1 parque', '4 dias — 1 parque por dia', 'Orlando, Flórida', '2027-01-02', NULL, '{"adults": 2, "children": 2}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "544.82"}, {"type": "CHILD", "label": "Criança (3 a 9 anos)", "quantity": 2, "unitCost": "524.22"}]', '{"duration": "1 dia", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (3 a 9 anos)"}], "optionDescription": "Quatro dias consecutivos."}', 'USD', 2138.0800, 4.930000, 10540.73, 4.5000, '75f732c7-2e1c-49dd-8464-2ddd3b36f333', 496.68, 11037.41, 6.0000, 'RULE', '589c5b90-5c88-402d-975d-ac96441ceb3a', 704.52, 11741.93, 0.00, 0.00, 11741.93, 9.6800, 13000.37, 13000.37, 4.5000, 6.0000, 704.52, 496.68, 'NAD-13ZPUY1-MW19SW5H', 'NA15383270', 'CONFIRMED', '{"mock": true}'),
	('e62361b7-713e-4ebb-81aa-5b3a6909686f', '63be7a2a-6b8f-4761-8e5f-cf61f43b4618', '16894bbf-5fbd-4d9b-b16c-77eb145e6d7e', 'HOUSES', 'MASTER_VACATION_HOME', 'windsor-hills-5', 'casa-inteira', 'Casa 5 quartos com piscina — Windsor Hills', '8 noites · 4 hóspedes', 'Windsor Hills, Kissimmee', '2026-12-31', '2027-01-08', '{"adults": 2, "children": 2}', '[{"type": "NIGHT", "label": "Diária da casa", "quantity": 8, "unitCost": "281.86"}, {"type": "FEE", "label": "Taxa de limpeza", "quantity": 1, "unitCost": "250.00"}]', '{"nights": 8, "bedrooms": 5, "paxRules": [{"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 11, "min": 0, "type": "CHILD", "label": "Crianças"}], "bathrooms": 4, "maxGuests": 12}', 'USD', 2504.8800, 4.930000, 12349.06, 4.5000, '75f732c7-2e1c-49dd-8464-2ddd3b36f333', 581.89, 12930.95, 7.0000, 'RULE', 'a857e2b8-a7a0-4412-9815-b4642a7e8c82', 973.30, 13904.25, 0.00, 0.00, 13904.25, 9.6800, 15394.43, 15394.43, 4.5000, 7.0000, 973.30, 581.89, 'MAS-1083MLE-MW19SW5J', 'CS12209833', 'CONFIRMED', '{"mock": true}'),
	('f0f3eb96-38b0-42cd-9501-28ce1eabc1cf', '51f81517-b285-466c-a4fe-873be675fb7c', '925952e0-8687-4587-bcc9-816da1a92807', 'CHIP', 'ESIMX', 'eu-10', 'eu-10', 'eSIM Europa — 10 GB', '15 dias · 2 chip(s)', 'Europa', NULL, NULL, '{"units": 2, "adults": 0, "children": 0}', '[{"type": "UNIT", "label": "eSIM Europa 10 GB · 15 dias", "quantity": 2, "unitCost": "19.00"}]', '{"data": "10 GB", "days": 15, "paxRules": [{"max": 20, "min": 1, "type": "UNIT", "label": "Quantidade de chips"}], "countries": ["Itália", "França", "Portugal", "Espanha", "Alemanha"]}', 'USD', 38.0000, 4.930000, 187.34, 15.0000, '79b184dc-b076-4b2e-8fb7-212ecb860ac0', 33.06, 220.40, 3.7000, 'RULE', '0fa575e9-f9b6-46a1-94d4-3db174a1db07', 8.47, 228.87, 0.00, 0.00, 228.87, 9.6800, 253.40, 228.87, 15.0000, 3.7008, 8.47, 33.06, 'ESX-RO9XWK-MW19SW90', 'ES43407835', 'ISSUED', '{"mock": true, "qrCode": "enviado por e-mail"}'),
	('57f8cd9b-6ed2-4feb-bf95-62e1738c2ff5', '51f81517-b285-466c-a4fe-873be675fb7c', '65f38364-1459-4615-8135-bd8703f20666', 'TICKETS', 'TU_EXPERIENZA', 'colosseo', 'colosseo-1d', 'Coliseu, Fórum Romano e Palatino', 'Coliseu 1 dia', 'Roma, Itália', '2026-11-23', NULL, '{"adults": 2, "children": 0}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "25.60"}]', '{"duration": "3 horas", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 17 anos)"}], "optionDescription": "Coliseu + Fórum Romano + Palatino, válido por 1 dia."}', 'EUR', 51.2000, 5.380000, 275.46, 4.5000, '75f732c7-2e1c-49dd-8464-2ddd3b36f333', 12.98, 288.44, 10.0000, 'RULE', '453158b5-440a-4a0b-bfa8-0e5c4792a950', 32.05, 320.49, 0.00, 0.00, 320.49, 9.6800, 354.84, 320.49, 4.5001, 10.0003, 32.05, 12.98, 'TU_-FWXR6I-MW19SW92', 'TU55519328', 'CONFIRMED', '{"mock": true}'),
	('fb5f52fa-0e94-4115-9bc6-f7ba95ba702e', 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', '026274c6-d18e-4c4d-8fc5-61cb4f8d82c4', 'LODGING', 'GGT_BEST_BUY', 'ggt_best_buy-orl-lakeside', 'fam-bb', 'Lakeside Resort Orlando', 'Suíte Família · Café da manhã · 14 noites', 'Lake Buena Vista, Orlando', '2027-01-12', '2027-01-26', '{"rooms": 1, "adults": 2, "children": 2}', '[{"type": "NIGHT", "label": "Diária Suíte Família · Café da manhã", "quantity": 14, "unitCost": "288.96"}]', '{"beds": "1 king + sofá-cama + beliche", "room": "Suíte Família", "board": "Café da manhã", "stars": 4, "nights": 14, "hotelKey": "orl-lakeside", "paxRules": [{"max": 5, "min": 1, "type": "ROOM", "label": "Quartos"}, {"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 8, "min": 0, "type": "CHILD", "label": "Crianças (até 11 anos)"}]}', 'USD', 4045.4400, 4.930000, 19944.02, 5.0000, 'b381d293-f455-4b75-94db-0f0d720b4ea4', 1049.69, 20993.71, 6.0000, 'RULE', 'e4f119ba-6c6b-439f-8568-e355009a0b73', 1340.02, 22333.73, 300.00, 156.53, 21877.20, 9.6800, 24221.88, 21877.20, 3.6228, 5.4097, 1183.49, 749.69, 'GGT-1VAM3II-MW19SW67', 'HT08761932', 'CONFIRMED', '{"mock": true}'),
	('67673def-bcdb-48a1-bb88-de7ce851b6f7', 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', 'fe4f5bd6-a423-4b8a-b3f5-d6dc93379e08', 'INSURANCE', 'INTERMAC', 'im-150', 'América do Norte', 'Seguro Viagem Intermac 150', 'América do Norte · 15 dias · 4 viajante(s)', 'América do Norte', '2027-01-12', '2027-01-26', '{"adults": 4, "seniors": 0, "children": 0}', '[{"type": "ADULT", "label": "Viajante até 64 anos · 15 dias", "quantity": 4, "unitCost": "328.50"}]', '{"days": 15, "region": "América do Norte", "luggage": "USD 1.500", "medical": "USD 150.000", "paxRules": [{"max": 15, "min": 0, "type": "ADULT", "label": "Viajantes até 64 anos"}, {"max": 10, "min": 0, "hint": "Tarifa com acréscimo de 80%", "type": "SENIOR", "label": "Viajantes de 65 a 85 anos"}]}', 'BRL', 1314.0000, 1.000000, 1314.00, 12.0000, '66466ee3-6323-4295-bdff-2eff92ab24b4', 179.18, 1493.18, 3.7000, 'RULE', '0fa575e9-f9b6-46a1-94d4-3db174a1db07', 57.37, 1550.55, 0.00, 10.87, 1539.68, 9.6800, 1704.69, 1539.68, 11.9999, 3.0201, 46.50, 179.18, 'INT-1OO59FJ-MW19SW69', 'SV82454167', 'ISSUED', '{"mock": true, "voucher": "emitido"}'),
	('bc500c08-299a-498f-b8be-78a273823082', 'c8c54dc6-f684-4bdd-8103-f76e4eb1ab52', 'a0e3face-1cb8-4f1e-ade9-14995065de81', 'TICKETS', 'NADIO', 'universal', 'universal-p2p', 'Universal Orlando Resort', '1 dia — Park-to-Park', 'Orlando, Flórida', '2027-01-17', NULL, '{"adults": 2, "children": 2}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "209.87"}, {"type": "CHILD", "label": "Criança (3 a 9 anos)", "quantity": 2, "unitCost": "204.59"}]', '{"duration": "1 dia", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (3 a 9 anos)"}], "optionDescription": "Universal Studios + Islands of Adventure."}', 'USD', 828.9200, 4.930000, 4086.58, 4.5000, '75f732c7-2e1c-49dd-8464-2ddd3b36f333', 192.56, 4279.14, 8.0000, 'RULE', 'c307a828-d328-472b-a6ce-c7b71291a3f7', 372.10, 4651.24, 0.00, 32.60, 4618.64, 9.6800, 5113.64, 4618.64, 4.5000, 7.3506, 339.50, 192.56, 'NAD-43LCDU-MW19SW6B', 'NA47008773', 'CONFIRMED', '{"mock": true}'),
	('6a8b3a1d-47fa-48dc-955c-fec1f6c36579', '0e2703d4-9aec-4e99-a7c8-d04e6b2b0673', 'da8c9aea-a387-44b8-8625-86daee0b2094', 'TICKETS', 'TU_EXPERIENZA', 'vaticano', 'vaticano-guiado', 'Museus Vaticanos e Capela Sistina', 'Tour guiado em português', 'Cidade do Vaticano', '2026-11-28', NULL, '{"adults": 2, "children": 0}', '[{"type": "ADULT", "label": "Adulto", "quantity": 2, "unitCost": "71.55"}]', '{"duration": "3 horas", "paxRules": [{"max": 20, "min": 0, "type": "ADULT", "label": "Adulto"}, {"max": 20, "min": 0, "type": "CHILD", "label": "Criança (6 a 17 anos)"}], "optionDescription": "Guia credenciado em português, grupos pequenos."}', 'EUR', 143.1000, 5.380000, 769.88, 4.5000, '75f732c7-2e1c-49dd-8464-2ddd3b36f333', 36.28, 806.16, 8.0000, 'RULE', 'c307a828-d328-472b-a6ce-c7b71291a3f7', 70.10, 876.26, 0.00, 0.00, 876.26, 9.6800, 970.17, 876.26, 4.5003, 7.9999, 70.10, 36.28, 'TU_-S8VCYL-MW19SW9V', NULL, NULL, NULL),
	('5c46a91e-d1d2-497f-86d6-7497595137d6', 'bb9f6dd1-5bc1-4eb5-8355-69430cf3ffd2', 'c9e33ed2-0a5a-4db6-bc4d-48bb940f6b7c', 'LODGING', 'RATEHAWK', 'ratehawk-lis-chiado', 'dbl-bb', 'Chiado Prime Lisboa', 'Duplo Deluxe · Café da manhã · 5 noites', 'Chiado, Lisboa', '2026-12-08', '2026-12-13', '{"rooms": 1, "adults": 2, "children": 0}', '[{"type": "NIGHT", "label": "Diária Duplo Deluxe · Café da manhã", "quantity": 5, "unitCost": "971.42"}]', '{"beds": "1 casal", "room": "Duplo Deluxe", "board": "Café da manhã", "stars": 4, "nights": 5, "hotelKey": "lis-chiado", "paxRules": [{"max": 5, "min": 1, "type": "ROOM", "label": "Quartos"}, {"max": 12, "min": 1, "type": "ADULT", "label": "Adultos"}, {"max": 8, "min": 0, "type": "CHILD", "label": "Crianças (até 11 anos)"}]}', 'BRL', 4857.1000, 1.000000, 4857.10, 5.0000, 'b381d293-f455-4b75-94db-0f0d720b4ea4', 255.64, 5112.74, 5.0000, 'RULE', '53828477-ee28-471e-846e-df18b821673a', 269.09, 5381.83, 0.00, 0.00, 5381.83, 9.6800, 5958.62, 5958.62, 5.0001, 5.0000, 269.09, 255.64, 'RAT-81WAF2-MW19SW7M', 'HT21733696', 'CONFIRMED', '{"mock": true}') ON CONFLICT DO NOTHING;

--
-- Data for Name: payouts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.payouts (id, affiliate_id, report_id, period_start, period_end, scheduled_date, orders_count, gross_sales, amount, status, paid_at, paid_by_id, notes, created_at) VALUES
	('744b8871-5173-4705-a232-c307d0fa7f91', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', 'fd477710-cf88-41a7-89de-6af9182a1459', '2026-10-16', '2026-10-31', '2026-11-09', 1, 28035.52, 1569.49, 'SCHEDULED', NULL, NULL, NULL, '2026-11-03 22:39:35.737578+00'),
	('0621aa28-c103-4be1-a946-9a6f44e3dfa2', '8097f2bf-61ff-4c0e-9a39-51df5f3b3ee9', '8018cec8-20e3-4824-9310-8a268bca4f3a', '2026-10-01', '2026-10-15', '2026-10-22', 2, 35727.38, 2178.17, 'PAID', '2026-11-03 22:39:35.74+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', 'Transferência via Pix', '2026-11-03 22:39:35.728104+00'),
	('4d2379cd-68f9-4b72-b50a-c5f86a0b3b6a', 'c6994c2f-43bc-4dfc-8414-6691817ef944', '8018cec8-20e3-4824-9310-8a268bca4f3a', '2026-10-01', '2026-10-15', '2026-10-22', 1, 5958.62, 269.09, 'PAID', '2026-11-03 22:39:35.744+00', 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', 'Transferência via Pix', '2026-11-03 22:39:35.730381+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: payout_proofs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.payout_proofs (id, payout_id, file_id, note, uploaded_by_id, created_at) VALUES
	('f02ca925-4aaf-45fd-8a9e-f30df364acfb', '0621aa28-c103-4be1-a946-9a6f44e3dfa2', '90d45419-a6a0-4d87-9bbb-4427e4174731', NULL, 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.743006+00'),
	('e4fef27e-b507-46d5-8d1b-3d4eca524a76', '4d2379cd-68f9-4b72-b50a-c5f86a0b3b6a', 'a2f9ffa0-2ee3-42a3-a91e-ad574ec53f65', NULL, 'edf42fd7-51cd-469a-8ebe-3b6736f6fb51', '2026-11-03 22:39:35.746698+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.settings (key, value, updated_at) VALUES
	('installmentFeePct', '"9.68"', '2026-11-03 22:39:34.931573+00'),
	('maxInstallments', '10', '2026-11-03 22:39:34.931573+00'),
	('fallbackSubrinhoMarginPct', '"4.5"', '2026-11-03 22:39:34.931573+00'),
	('fallbackAffiliateMarginPct', '"3.7"', '2026-11-03 22:39:34.931573+00'),
	('maxAffiliateMarginPct', '"60"', '2026-11-03 22:39:34.931573+00'),
	('payoutBusinessDays', '5', '2026-11-03 22:39:34.931573+00'),
	('pixExpirationMinutes', '30', '2026-11-03 22:39:34.931573+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: subrinho_users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.subrinho_users (id, name, email, password_hash, role, active, created_at) VALUES
	('edf42fd7-51cd-469a-8ebe-3b6736f6fb51', 'Equipe Subrinho', 'admin@subrinho.com.br', '$2b$10$DsuTXSnMEJ10JX7SjCObtun0s3uVyBr6iOaWGwJzOCByt7fBgtcbu', 'OWNER', true, '2026-11-03 22:39:35.007058+00'),
	('971c8ca9-5b86-431a-b1c1-200dbab84918', 'Financeiro Subrinho', 'financeiro@subrinho.com.br', '$2b$10$QPrZ/QR.lrHEeIlUXjPrUO7wAACY2Qe4G11qKeZH1iiEUDYBBHqci', 'FINANCE', true, '2026-11-03 22:39:35.074612+00') ON CONFLICT DO NOTHING;

--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.suppliers (code, name, category, default_currency, active, notes) VALUES
	('TU_EXPERIENZA', 'Tu Experienza', 'TICKETS', 'EUR', true, 'Ingressos e experiências na Itália'),
	('NADIO', 'Nadio', 'TICKETS', 'USD', true, 'Parques e atrações (EUA/Europa)'),
	('GGT_BEST_BUY', 'GGT | Best Buy Hotels', 'LODGING', 'USD', true, 'Hotéis'),
	('RATEHAWK', 'RateHawk', 'LODGING', 'BRL', true, 'Hotéis (tarifa em BRL)'),
	('HOTELBEDS', 'Hotelbeds', 'LODGING', 'EUR', true, 'Hotéis'),
	('MASTER_VACATION_HOME', 'Master Vacation Home', 'HOUSES', 'USD', true, 'Casas de temporada em Orlando'),
	('MAPRO', 'Mapro', 'HOUSES', 'USD', true, 'Casas de temporada'),
	('INTERMAC', 'Intermac Seguros', 'INSURANCE', 'BRL', true, 'Seguro viagem'),
	('HERO', 'Hero Seguro', 'INSURANCE', 'USD', true, 'Seguro viagem (tarifa em USD)'),
	('ESIMX', 'esimx', 'CHIP', 'USD', true, 'Chip eSIM internacional') ON CONFLICT DO NOTHING;

--
-- Name: cart_views_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

--
-- Name: fx_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

--
-- Name: order_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

--
-- Name: orders_number_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

--
-- PostgreSQL database dump complete
--

-- ───────── 4. Sequências ─────────
SELECT setval('public.cart_views_id_seq', COALESCE((SELECT max(id) FROM public.cart_views), 0) + 1, false);
SELECT setval('public.fx_rates_id_seq', COALESCE((SELECT max(id) FROM public.fx_rates), 0) + 1, false);
SELECT setval('public.order_events_id_seq', COALESCE((SELECT max(id) FROM public.order_events), 0) + 1, false);
SELECT setval('public.orders_number_seq', COALESCE((SELECT max(number) FROM public.orders), 0) + 1, false);

COMMIT;

-- ───────── Conferência ─────────
SELECT
  (SELECT count(*) FROM public.affiliates) AS lojas,
  (SELECT count(*) FROM public.subrinho_users) AS usuarios_subrinho,
  (SELECT count(*) FROM public.affiliate_users) AS usuarios_afiliados,
  (SELECT count(*) FROM public.orders) AS pedidos,
  (SELECT count(*) FROM public.suppliers) AS fornecedores,
  'instalado' AS status;
