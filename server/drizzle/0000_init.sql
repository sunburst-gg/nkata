CREATE TABLE "asset" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"project_id" varchar(26) NOT NULL,
	"template_id" varchar(26) NOT NULL,
	"name" text NOT NULL,
	"reference_files" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_token" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_run" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"version_id" varchar(26) NOT NULL,
	"check_id" text NOT NULL,
	"severity" text NOT NULL,
	"passed" boolean NOT NULL,
	"auto_fixed" boolean NOT NULL,
	"message" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"blake3" text NOT NULL,
	"size" integer NOT NULL,
	"store_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"part_id" varchar(26) NOT NULL,
	"version_id" varchar(26) NOT NULL,
	"author_id" varchar(26) NOT NULL,
	"point" real[] NOT NULL,
	"normal" real[] NOT NULL,
	"body" text NOT NULL,
	"linear_issue" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"project_id" varchar(26),
	"actor_id" varchar(26) NOT NULL,
	"kind" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" varchar(26) NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_version" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"project_id" varchar(26) NOT NULL,
	"path" text NOT NULL,
	"size" bigint NOT NULL,
	"blake3" text NOT NULL,
	"chunk_hashes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lock" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"part_id" varchar(26) NOT NULL,
	"holder_id" varchar(26) NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"roles" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"asset_id" varchar(26) NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"owner_id" varchar(26),
	"state" text NOT NULL,
	"gate" jsonb NOT NULL,
	"mapping" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"project_id" varchar(26) NOT NULL,
	"part_id" varchar(26),
	"since" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"name" text NOT NULL,
	"folder_name" text NOT NULL,
	"blender_version" text NOT NULL,
	"ue_version" text NOT NULL,
	"package_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"part_id" varchar(26) NOT NULL,
	"version_id" varchar(26) NOT NULL,
	"reviewer_id" varchar(26) NOT NULL,
	"score" integer NOT NULL,
	"decision" text NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"project_id" varchar(26) NOT NULL,
	"name" text NOT NULL,
	"file_path" text NOT NULL,
	"schema" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "version" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" varchar(26) NOT NULL,
	"part_id" varchar(26) NOT NULL,
	"author_id" varchar(26) NOT NULL,
	"file_version_id" varchar(26),
	"manifest" jsonb,
	"mirror_status" text NOT NULL,
	"mirror_ms" integer,
	"published" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_run" ADD CONSTRAINT "check_run_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_run" ADD CONSTRAINT "check_run_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock" ADD CONSTRAINT "lock_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock" ADD CONSTRAINT "lock_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock" ADD CONSTRAINT "lock_holder_id_user_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part" ADD CONSTRAINT "part_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_studio_id_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_part_id_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_file_version_id_file_version_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_project_name_idx" ON "asset" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_token_hash_idx" ON "auth_token" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "chunk_studio_blake3_idx" ON "chunk" USING btree ("studio_id","blake3");--> statement-breakpoint
CREATE INDEX "event_project_created_idx" ON "event" USING btree ("project_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "file_version_project_path_idx" ON "file_version" USING btree ("project_id","path","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lock_part_idx" ON "lock" USING btree ("part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_studio_idx" ON "membership" USING btree ("user_id","studio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "part_asset_name_idx" ON "part" USING btree ("asset_id","name");--> statement-breakpoint
CREATE INDEX "presence_project_idx" ON "presence" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presence_user_project_idx" ON "presence" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_project_name_idx" ON "template" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "version_part_created_idx" ON "version" USING btree ("part_id","created_at" desc);