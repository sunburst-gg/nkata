-- v8 step 21: a lead's accepted check per part, a lead's Publish past a blocking check on the
-- version, and the pivot rule on every Object template that predates it, as a note at the base.
CREATE TABLE "check_exception" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"part_id" varchar(26) NOT NULL,
	"check_id" text NOT NULL,
	"reason" text NOT NULL,
	"accepted_by" varchar(26) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "override_by" varchar(26);--> statement-breakpoint
ALTER TABLE "check_exception" ADD CONSTRAINT "check_exception_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_exception" ADD CONSTRAINT "check_exception_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_exception" ADD CONSTRAINT "check_exception_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_exception_part_check_idx" ON "check_exception" USING btree ("part_id","check_id");--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_override_by_user_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE "template" SET "schema" = jsonb_set(jsonb_set(jsonb_set("schema",
  '{parts,0,checks}', ("schema"->'parts'->0->'checks') || '["pivot_at_base"]'::jsonb),
  '{parts,0,params}', COALESCE("schema"->'parts'->0->'params', '{}'::jsonb) || '{"pivot_at_base":{"convention":"base"}}'::jsonb),
  '{parts,0,severity}', COALESCE("schema"->'parts'->0->'severity', '{}'::jsonb) || '{"pivot_at_base":"note"}'::jsonb)
WHERE "name" = 'Object' AND NOT (("schema"->'parts'->0->'checks') ? 'pivot_at_base');
