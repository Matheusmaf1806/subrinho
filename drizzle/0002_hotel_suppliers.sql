CREATE TABLE "hotel_destinations" (
	"supplier_code" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"region" text,
	"country_code" text,
	"country_name" text,
	"search_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_destinations_supplier_code_code_pk" PRIMARY KEY("supplier_code","code")
);
--> statement-breakpoint
CREATE TABLE "supplier_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hotel_destinations_search_idx" ON "hotel_destinations" USING btree ("search_key" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "hotel_destinations_country_idx" ON "hotel_destinations" USING btree ("country_code","search_key");--> statement-breakpoint
CREATE INDEX "supplier_cache_expires_idx" ON "supplier_cache" USING btree ("expires_at");