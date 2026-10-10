// Magic link auth. A token is 32 random bytes, base64url, stored as a SHA-256 hash.
// Magic tokens are single use and live 15 minutes. Session tokens live 30 days.
// A session acts in one studio. An account with no studio yet has a session with none, which
// only the account routes accept (app.ts, ACCOUNT_ROUTES).
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
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

export const CODE_ATTEMPTS = 5;

/** Six digits, zero padded, from the system random source. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueToken(db: Db, params: { user_id: string; studio_id: string | null; kind: "magic" | "session"; now: Date; code?: string }): Promise<string> {
  const token = newToken();
  const ttl = params.kind === "magic" ? MAGIC_TTL_MS : SESSION_TTL_MS;
  await db.insert(auth_token).values({
    id: newId(),
    studio_id: params.studio_id,
    user_id: params.user_id,
    kind: params.kind,
    token_hash: hashToken(token),
    code_hash: params.code ? hashToken(`${params.user_id}:${params.code}`) : null,
    expires_at: new Date(params.now.getTime() + ttl),
  });
  return token;
}

/**
 * Redeems the newest open code for an email. A wrong code counts a try; after five the code is
 * dead and the person asks for a new one. A used or expired code is as wrong as any other.
 */
export async function redeemCode(db: Db, email: string, code: string, now: Date): Promise<{ user_id: string; studio_id: string | null }> {
  const u = (await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())).limit(1))[0];
  const wrong = new AppError("unauthorized", "that code is not right, or it expired. Ask for a new one.");
  if (!u) throw wrong;
  const row = (await db
    .select()
    .from(auth_token)
    .where(and(eq(auth_token.user_id, u.id), eq(auth_token.kind, "magic"), isNull(auth_token.used_at), gt(auth_token.expires_at, now), isNotNull(auth_token.code_hash)))
    .orderBy(desc(auth_token.created_at))
    .limit(1))[0];
  if (!row || row.attempts >= CODE_ATTEMPTS) throw wrong;
  if (row.code_hash !== hashToken(`${u.id}:${code}`)) {
    await db.update(auth_token).set({ attempts: row.attempts + 1, updated_at: now }).where(eq(auth_token.id, row.id));
    throw wrong;
  }
  await db.update(auth_token).set({ used_at: now, updated_at: now }).where(eq(auth_token.id, row.id));
  return { user_id: row.user_id, studio_id: row.studio_id };
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
