ALTER TABLE "asset" ADD COLUMN "folder" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "note_engineering" text DEFAULT '' NOT NULL;