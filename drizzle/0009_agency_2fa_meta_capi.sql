-- Duas etapas para as agências e API de conversões da Meta (compra enviada pelo servidor).
ALTER TABLE "affiliate_users" ADD COLUMN IF NOT EXISTS "totp_secret" text;--> statement-breakpoint
ALTER TABLE "affiliate_users" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "meta_capi_token" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "meta_test_event_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversion_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "event" text NOT NULL,
  "affiliate_id" uuid NOT NULL REFERENCES "affiliates"("id"),
  "order_id" uuid REFERENCES "orders"("id") ON DELETE cascade,
  "event_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "response" jsonb,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversion_events_uq" ON "conversion_events" ("provider","event","event_id","affiliate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversion_events_status_idx" ON "conversion_events" ("status","next_attempt_at");
