ALTER TABLE "user" DROP CONSTRAINT "user_studio_id_studio_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_token" ALTER COLUMN "studio_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "studio_id";