ALTER TABLE "asset" ADD COLUMN "rights" jsonb;--> statement-breakpoint
ALTER TABLE "check_run" ADD COLUMN "capture_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "kind" text DEFAULT 'pin' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "capture_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "capture_ack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "capture_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studio" ADD COLUMN "training" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "training_id" varchar(26);--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "capture_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "render_key" text;