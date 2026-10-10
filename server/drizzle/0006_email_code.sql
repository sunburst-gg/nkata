ALTER TABLE "auth_token" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "auth_token" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;