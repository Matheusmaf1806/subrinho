CREATE TYPE "public"."affiliate_role" AS ENUM('ADMIN', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."cart_item_status" AS ENUM('ACTIVE', 'EXPIRED', 'REMOVED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('OPEN', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('TICKETS', 'LODGING', 'HOUSES', 'INSURANCE', 'CHIP', 'CAR_RENTAL', 'REMOTE_GUIDE', 'CRUISE', 'TRANSFER', 'ITINERARY');--> statement-breakpoint
CREATE TYPE "public"."coupon_issuer" AS ENUM('SUBRINHO', 'AFFILIATE');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('BRL', 'USD', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'FIXED', 'CONDITIONAL');--> statement-breakpoint
CREATE TYPE "public"."margin_owner" AS ENUM('SUBRINHO', 'AFFILIATE');--> statement-breakpoint
CREATE TYPE "public"."margin_scope" AS ENUM('DEFAULT', 'CATEGORY', 'SUPPLIER', 'PRODUCT', 'PRODUCT_OPTION');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('PIX', 'CARD');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('SCHEDULED', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."subrinho_role" AS ENUM('OWNER', 'ADMIN', 'FINANCE', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('SUBRINHO', 'AFFILIATE', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "affiliate_users" (
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
--> statement-breakpoint
CREATE TABLE "affiliates" (
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
--> statement-breakpoint
CREATE TABLE "cart_coupons" (
	"cart_id" uuid NOT NULL,
	"coupon_id" uuid NOT NULL,
	"layer" "coupon_issuer" NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_coupons_cart_id_layer_pk" PRIMARY KEY("cart_id","layer")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
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
--> statement-breakpoint
CREATE TABLE "cart_views" (
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
--> statement-breakpoint
CREATE TABLE "carts" (
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
--> statement-breakpoint
CREATE TABLE "coupons" (
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
--> statement-breakpoint
CREATE TABLE "customers" (
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
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_type" "user_type",
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fortnight_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payout_date" date NOT NULL,
	"summary" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by_type" text NOT NULL,
	"generated_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" "currency" NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "margin_rules" (
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
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
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
--> statement-breakpoint
CREATE TABLE "orders" (
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
--> statement-breakpoint
CREATE TABLE "payout_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"note" text,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
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
--> statement-breakpoint
CREATE TABLE "sessions" (
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
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subrinho_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "subrinho_role" DEFAULT 'ADMIN' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subrinho_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"default_currency" "currency" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "affiliate_users" ADD CONSTRAINT "affiliate_users_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_coupons" ADD CONSTRAINT "cart_coupons_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_coupons" ADD CONSTRAINT "cart_coupons_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_views" ADD CONSTRAINT "cart_views_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_created_by_customer_id_customers_id_fk" FOREIGN KEY ("created_by_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_created_by_affiliate_user_id_affiliate_users_id_fk" FOREIGN KEY ("created_by_affiliate_user_id") REFERENCES "public"."affiliate_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "margin_rules" ADD CONSTRAINT "margin_rules_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_affiliate_user_id_affiliate_users_id_fk" FOREIGN KEY ("placed_by_affiliate_user_id") REFERENCES "public"."affiliate_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_proofs" ADD CONSTRAINT "payout_proofs_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_proofs" ADD CONSTRAINT "payout_proofs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_report_id_fortnight_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fortnight_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_users_affiliate_idx" ON "affiliate_users" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_views_cart_idx" ON "cart_views" USING btree ("cart_id","viewed_at");--> statement-breakpoint
CREATE INDEX "carts_affiliate_idx" ON "carts" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_scope_code_uq" ON "coupons" USING btree ("scope_key","code");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_affiliate_email_uq" ON "customers" USING btree ("affiliate_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "fortnight_reports_period_uq" ON "fortnight_reports" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "fx_rates_currency_idx" ON "fx_rates" USING btree ("currency","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "margin_rules_scope_uq" ON "margin_rules" USING btree ("scope_key");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_affiliate_idx" ON "orders" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_paid_idx" ON "orders" USING btree ("status","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_affiliate_period_uq" ON "payouts" USING btree ("affiliate_id","period_start");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_type","user_id");