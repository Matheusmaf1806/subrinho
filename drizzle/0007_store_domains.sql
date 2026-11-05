-- Cada loja no próprio endereço: subdomínio da plataforma (<sub>.subrinho.com.br) ou domínio próprio.
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "subdomain" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "custom_domain" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_subdomain_unique" UNIQUE ("subdomain");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_custom_domain_unique" UNIQUE ("custom_domain");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
-- subdomínio inicial = o slug atual (já é um nome válido de DNS: letras, números e hífen)
UPDATE "affiliates" SET "subdomain" = left(regexp_replace(lower("slug"), '[^a-z0-9-]', '', 'g'), 40) WHERE "subdomain" IS NULL;
