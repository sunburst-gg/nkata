// Magic link auth. A token is 32 random bytes, base64url, stored as a SHA-256 hash.
// Magic tokens are single use and live 15 minutes. Session tokens live 30 days.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Role } from "@nkata/shared";
import type { Db } from "../db/client.js";
import { auth_token, membership, user } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import { newId } from "../domain/ids.js";

export const MAGIC_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Principal = {
  user_id: string;
  studio_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  roles: Role[];
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueToken(db: Db, params: { user_id: string; studio_id: string; kind: "magic" | "session"; now: Date }): Promise<string> {
  const token = newToken();
  const ttl = params.kind === "magic" ? MAGIC_TTL_MS : SESSION_TTL_MS;
  await db.insert(auth_token).values({
    id: newId(),
    studio_id: params.studio_id,
    user_id: params.user_id,
    kind: params.kind,
    token_hash: hashToken(token),
    expires_at: new Date(params.now.getTime() + ttl),
  });
  return token;
}

/** Marks a magic token used and returns its user. Throws on unknown, used, or expired. */
export async function redeemMagicToken(db: Db, token: string, now: Date): Promise<{ user_id: string; studio_id: string }> {
  const rows = await db
    .update(auth_token)
    .set({ used_at: now, updated_at: now })
    .where(and(eq(auth_token.token_hash, hashToken(token)), eq(auth_token.kind, "magic"), isNull(auth_token.used_at), gt(auth_token.expires_at, now)))
    .returning({ user_id: auth_token.user_id, studio_id: auth_token.studio_id });
  const row = rows[0];
  if (!row) throw new AppError("unauthorized", "magic link is invalid, used, or expired");
  return row;
}

export async function resolveSession(db: Db, token: string, now: Date): Promise<Principal> {
  const rows = await db
    .select({
      user_id: user.id,
      studio_id: user.studio_id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      roles: membership.roles,
    })
    .from(auth_token)
    .innerJoin(user, eq(user.id, auth_token.user_id))
    .innerJoin(membership, and(eq(membership.user_id, user.id), eq(membership.studio_id, auth_token.studio_id)))
    .where(and(eq(auth_token.token_hash, hashToken(token)), eq(auth_token.kind, "session"), gt(auth_token.expires_at, now)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("unauthorized", "session token is invalid or expired");
  return row;
}
