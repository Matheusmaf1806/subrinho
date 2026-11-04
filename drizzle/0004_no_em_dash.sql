-- O site não usa mais travessão (—): limpa os textos já gravados (marca da agência, regras e itens).
UPDATE "affiliates" SET "hero_title" = replace(replace("hero_title", ' — ', ', '), '—', '-') WHERE "hero_title" LIKE '%—%';
--> statement-breakpoint
UPDATE "affiliates" SET "hero_subtitle" = replace(replace("hero_subtitle", ' — ', ', '), '—', '-') WHERE "hero_subtitle" LIKE '%—%';
--> statement-breakpoint
UPDATE "affiliates" SET "tagline" = replace(replace("tagline", ' — ', ', '), '—', '-') WHERE "tagline" LIKE '%—%';
--> statement-breakpoint
UPDATE "margin_rules" SET "label" = replace(replace("label", ' — ', ' · '), '—', '-') WHERE "label" LIKE '%—%';
--> statement-breakpoint
UPDATE "cart_items" SET "title" = replace(replace("title", ' — ', ' · '), '—', '-') WHERE "title" LIKE '%—%';
--> statement-breakpoint
UPDATE "cart_items" SET "subtitle" = replace(replace("subtitle", ' — ', ' · '), '—', '-') WHERE "subtitle" LIKE '%—%';
--> statement-breakpoint
UPDATE "order_items" SET "title" = replace(replace("title", ' — ', ' · '), '—', '-') WHERE "title" LIKE '%—%';
--> statement-breakpoint
UPDATE "order_items" SET "subtitle" = replace(replace("subtitle", ' — ', ' · '), '—', '-') WHERE "subtitle" LIKE '%—%';
