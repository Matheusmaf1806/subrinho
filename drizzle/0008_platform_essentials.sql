-- E-mails automáticos, nova senha, limite de tentativas, 2FA, auditoria, monitoramento, notas fiscais,
-- dados legais da agência, pixel/GA4 e lembrete de carrinho abandonado.
ALTER TABLE "subrinho_users" ADD COLUMN IF NOT EXISTS "totp_secret" text;--> statement-breakpoint
ALTER TABLE "subrinho_users" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "cadastur" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "policy_notes" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "meta_pixel_id" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ga4_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "affiliate_id" uuid REFERENCES "affiliates"("id"),
  "order_id" uuid,
  "to_email" text NOT NULL,
  "to_name" text,
  "from_name" text,
  "reply_to" text,
  "subject" text NOT NULL,
  "html" text NOT NULL,
  "text" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "provider_id" text,
  "dedupe_key" text CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_status_idx" ON "email_outbox" ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_order_idx" ON "email_outbox" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_created_idx" ON "email_outbox" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "purpose" text NOT NULL,
  "user_type" "user_type" NOT NULL,
  "user_id" uuid NOT NULL,
  "store_affiliate_id" uuid,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" ("user_type","user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "identifier" text NOT NULL,
  "ip" text,
  "success" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_id_idx" ON "login_attempts" ("scope","identifier","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_ip_idx" ON "login_attempts" ("ip","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" uuid,
  "actor_name" text,
  "affiliate_id" uuid,
  "action" text NOT NULL,
  "entity" text,
  "entity_id" text,
  "summary" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_affiliate_idx" ON "audit_log" ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" ("entity","entity_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "key" text NOT NULL,
  "message" text NOT NULL,
  "code" text,
  "path" text,
  "digest" text,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_key_idx" ON "error_events" ("source","key","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_created_idx" ON "error_events" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_state" (
  "key" text PRIMARY KEY NOT NULL,
  "last_sent_at" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "affiliate_id" uuid NOT NULL REFERENCES "affiliates"("id"),
  "order_id" uuid REFERENCES "orders"("id") ON DELETE cascade,
  "payout_id" uuid REFERENCES "payouts"("id") ON DELETE cascade,
  "issuer" text NOT NULL,
  "number" text NOT NULL,
  "series" text,
  "issued_at" date NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "file_id" uuid REFERENCES "files"("id"),
  "xml_file_id" uuid REFERENCES "files"("id"),
  "url" text,
  "status" text DEFAULT 'ISSUED' NOT NULL,
  "notes" text,
  "created_by_type" text,
  "created_by_id" uuid,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_order_idx" ON "invoices" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_payout_idx" ON "invoices" ("payout_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_affiliate_idx" ON "invoices" ("affiliate_id","created_at");
