// Tables exactly as docs/engineering.md, Data model. Every table has id (ULID),
// studio_id, created_at, updated_at. No soft delete. Foreign keys everywhere.
// Drizzle pg-core: https://orm.drizzle.team/docs/column-types/pg
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { Gate, PartMapping, PartState, Role } from "@nkata/shared";

const ulid = (name: string) => varchar(name, { length: 26 });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// Shared columns. created_at and updated_at are set by the server in UTC.
const base = {
  id: ulid("id").primaryKey(),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow(),
};

export const studio = pgTable("studio", {
  ...base,
  name: text("name").notNull(),
});

export const user = pgTable(
  "user",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatar_url: text("avatar_url"),
  },
  (t) => [uniqueIndex("user_email_idx").on(t.email)],
);

export const membership = pgTable(
  "membership",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    user_id: ulid("user_id").notNull().references(() => user.id),
    roles: jsonb("roles").$type<Role[]>().notNull(),
  },
  (t) => [uniqueIndex("membership_user_studio_idx").on(t.user_id, t.studio_id)],
);

export const project = pgTable("project", {
  ...base,
  studio_id: ulid("studio_id").notNull().references(() => studio.id),
  name: text("name").notNull(),
  folder_name: text("folder_name").notNull(),
  blender_version: text("blender_version").notNull(),
  ue_version: text("ue_version").notNull(),
  package_version: text("package_version").notNull(),
});

export const template = pgTable(
  "template",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    project_id: ulid("project_id").notNull().references(() => project.id),
    name: text("name").notNull(),
    file_path: text("file_path").notNull(),
    // The file in the project folder is the truth; this row is the cache.
    schema: jsonb("schema").notNull(),
  },
  (t) => [uniqueIndex("template_project_name_idx").on(t.project_id, t.name)],
);

export const asset = pgTable(
  "asset",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    project_id: ulid("project_id").notNull().references(() => project.id),
    template_id: ulid("template_id").notNull().references(() => template.id),
    name: text("name").notNull(),
    reference_files: jsonb("reference_files").$type<string[]>().notNull(),
  },
  (t) => [uniqueIndex("asset_project_name_idx").on(t.project_id, t.name)],
);

export const part = pgTable(
  "part",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    asset_id: ulid("asset_id").notNull().references(() => asset.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    owner_id: ulid("owner_id").references(() => user.id),
    state: text("state").$type<PartState>().notNull(),
    gate: jsonb("gate").$type<Gate>().notNull(),
    mapping: jsonb("mapping").$type<PartMapping>().notNull(),
  },
  (t) => [uniqueIndex("part_asset_name_idx").on(t.asset_id, t.name)],
);

export const file_version = pgTable(
  "file_version",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    project_id: ulid("project_id").notNull().references(() => project.id),
    path: text("path").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    blake3: text("blake3").notNull(),
    chunk_hashes: jsonb("chunk_hashes").$type<string[]>().notNull(),
  },
  (t) => [index("file_version_project_path_idx").on(t.project_id, t.path, t.created_at)],
);

export const version = pgTable(
  "version",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    part_id: ulid("part_id").notNull().references(() => part.id),
    author_id: ulid("author_id").notNull().references(() => user.id),
    file_version_id: ulid("file_version_id").references(() => file_version.id),
    manifest: jsonb("manifest"),
    mirror_status: text("mirror_status").notNull(),
    mirror_ms: integer("mirror_ms"),
    // Where a static mesh is placed after this mirror: [{level, actors}]. Null for other kinds.
    refs: jsonb("refs"),
    published: boolean("published").notNull().default(false),
    note: text("note").notNull().default(""),
  },
  (t) => [index("version_part_created_idx").on(t.part_id, sql`${t.created_at} desc`)],
);

export const chunk = pgTable(
  "chunk",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    blake3: text("blake3").notNull(),
    size: integer("size").notNull(),
    store_key: text("store_key").notNull(),
  },
  // Dedupe is per studio. See docs/engineering.md, Storage and sync, Chunking.
  (t) => [uniqueIndex("chunk_studio_blake3_idx").on(t.studio_id, t.blake3)],
);

export const lock = pgTable(
  "lock",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    part_id: ulid("part_id").notNull().references(() => part.id),
    holder_id: ulid("holder_id").notNull().references(() => user.id),
    granted_at: ts("granted_at").notNull(),
    heartbeat_at: ts("heartbeat_at").notNull(),
    expires_at: ts("expires_at").notNull(),
  },
  (t) => [uniqueIndex("lock_part_idx").on(t.part_id)],
);

export const presence = pgTable(
  "presence",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    user_id: ulid("user_id").notNull().references(() => user.id),
    project_id: ulid("project_id").notNull().references(() => project.id),
    part_id: ulid("part_id").references(() => part.id),
    since: ts("since").notNull(),
    last_seen: ts("last_seen").notNull(),
  },
  (t) => [index("presence_project_idx").on(t.project_id), uniqueIndex("presence_user_project_idx").on(t.user_id, t.project_id)],
);

export const comment = pgTable("comment", {
  ...base,
  studio_id: ulid("studio_id").notNull().references(() => studio.id),
  part_id: ulid("part_id").notNull().references(() => part.id),
  version_id: ulid("version_id").notNull().references(() => version.id),
  author_id: ulid("author_id").notNull().references(() => user.id),
  point: real("point").array().notNull(),
  normal: real("normal").array().notNull(),
  body: text("body").notNull(),
  resolved_at: ts("resolved_at"),
});

export const review = pgTable("review", {
  ...base,
  studio_id: ulid("studio_id").notNull().references(() => studio.id),
  part_id: ulid("part_id").notNull().references(() => part.id),
  version_id: ulid("version_id").notNull().references(() => version.id),
  reviewer_id: ulid("reviewer_id").notNull().references(() => user.id),
  score: integer("score").notNull(),
  decision: text("decision").notNull(),
  note: text("note").notNull().default(""),
});

export const check_run = pgTable("check_run", {
  ...base,
  studio_id: ulid("studio_id").notNull().references(() => studio.id),
  version_id: ulid("version_id").notNull().references(() => version.id),
  check_id: text("check_id").notNull(),
  severity: text("severity").notNull(),
  passed: boolean("passed").notNull(),
  auto_fixed: boolean("auto_fixed").notNull(),
  message: text("message").notNull().default(""),
});

export const event = pgTable(
  "event",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    project_id: ulid("project_id").references(() => project.id),
    actor_id: ulid("actor_id").notNull().references(() => user.id),
    kind: text("kind").notNull(),
    target_kind: text("target_kind").notNull(),
    target_id: ulid("target_id").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("event_project_created_idx").on(t.project_id, sql`${t.created_at} desc`)],
);

// Magic link and session tokens. Not in the data model table; see docs/decisions.md.
export const auth_token = pgTable(
  "auth_token",
  {
    ...base,
    studio_id: ulid("studio_id").notNull().references(() => studio.id),
    user_id: ulid("user_id").notNull().references(() => user.id),
    kind: text("kind").$type<"magic" | "session">().notNull(),
    token_hash: text("token_hash").notNull(),
    expires_at: ts("expires_at").notNull(),
    used_at: ts("used_at"),
  },
  (t) => [uniqueIndex("auth_token_hash_idx").on(t.token_hash)],
);
