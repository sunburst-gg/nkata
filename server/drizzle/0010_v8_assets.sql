-- v8 step 11: the wall's nouns on the existing rows. Nothing is dropped.
-- asset.kind: object or environment, from the template kind. asset."group": the first subfolder
-- under the project folder, or null. asset.budget: a lead's triangle override for one asset.
-- project.budgets: triangle budgets per kind and an optional texture limit (Decisions 12).
-- project.color: the swatch picked at New project, as a token name; null means the app picks one.
ALTER TABLE "asset" ADD COLUMN "kind" text DEFAULT 'object' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "group" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "budget" integer;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "budgets" jsonb DEFAULT '{"prop":30000,"vehicle":60000,"character":80000,"environment":2000000,"max_texture":null}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "asset" SET "kind" = 'environment' FROM "template" WHERE "asset"."template_id" = "template"."id" AND "template"."schema"->>'kind' = 'level_area';--> statement-breakpoint
UPDATE "asset" SET "group" = NULLIF("folder", '');
