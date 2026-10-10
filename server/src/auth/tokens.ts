// Magic link auth. A token is 32 random bytes, base64url, stored as a SHA-256 hash.
// Magic tokens are single use and live 15 minutes. Session tokens live 30 days.
// A session acts in one studio. An account with no studio yet has a session with none, which
// only the account routes accept (app.ts, ACCOUNT_ROUTES).
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Role } from "@nkata/shared";
import type { Db } from "../db/client.js";
import { auth_token, membership, studio, user } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import { newId } from "../domain/ids.js";

export const MAGIC_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A session inside a studio. Every project route reads this. */
export type Principal = {
  user_id: string;
  studio_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  roles: Role[];
};

/** A session as resolved: the studio may be missing before the account has one. */
export type Session = Omit<Principal, "studio_id"> & { studio_id: string | null };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueToken(db: Db, params: { user_id: string; studio_id: string | null; kind: "magic" | "session"; now: Date }): Promise<string> {
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
export async function redeemMagicToken(db: Db, token: string, now: Date): Promise<{ user_id: string; studio_id: string | null }> {
  const rows = await db
    .update(auth_token)
    .set({ used_at: now, updated_at: now })
    .where(and(eq(auth_token.token_hash, hashToken(token)), eq(auth_token.kind, "magic"), isNull(auth_token.used_at), gt(auth_token.expires_at, now)))
    .returning({ user_id: auth_token.user_id, studio_id: auth_token.studio_id });
  const row = rows[0];
  if (!row) throw new AppError("unauthorized", "magic link is invalid, used, or expired");
  return row;
}

export async function resolveSession(db: Db, token: string, now: Date): Promise<Session> {
  const rows = await db
    .select({
      user_id: user.id,
      studio_id: auth_token.studio_id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      roles: membership.roles,
    })
    .from(auth_token)
    .innerJoin(user, eq(user.id, auth_token.user_id))
    .leftJoin(membership, and(eq(membership.user_id, user.id), eq(membership.studio_id, auth_token.studio_id)))
    .where(and(eq(auth_token.token_hash, hashToken(token)), eq(auth_token.kind, "session"), gt(auth_token.expires_at, now)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("unauthorized", "session token is invalid or expired");
  // A membership removed after the token was issued leaves a studio the person can no longer act in.
  if (row.studio_id && !row.roles) throw new AppError("unauthorized", "you are no longer a member of that studio");
  return { ...row, roles: row.roles ?? [] };
}

/** The studios an account belongs to, oldest membership first. */
export async function studiosOf(db: Db, userId: string): Promise<{ id: string; name: string; roles: Role[] }[]> {
  const rows = await db
    .select({ id: studio.id, name: studio.name, roles: membership.roles, joined: membership.created_at })
    .from(membership)
    .innerJoin(studio, eq(studio.id, membership.studio_id))
    .where(eq(membership.user_id, userId))
    .orderBy(membership.created_at);
  return rows.map((r) => ({ id: r.id, name: r.name, roles: r.roles }));
}
