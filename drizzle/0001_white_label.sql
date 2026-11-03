ALTER TABLE "affiliates" ADD COLUMN "logo_on_dark_url" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "dark_color" text DEFAULT '#0A0A0B' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "font_family" text DEFAULT 'inter-tight' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "hero_title" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "hero_subtitle" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "hero_image_url" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "hero_image2_url" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN "show_powered_by" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;