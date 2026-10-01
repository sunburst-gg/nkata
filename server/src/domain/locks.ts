// Lock grant rules. A lock is granted by the server, never by the client.
// Stale after 2 minutes with no heartbeat. Expires after 12 hours idle.
// See docs/engineering.md, Lock grant.

export const STALE_AFTER_MS = 2 * 60 * 1000;
export const EXPIRES_AFTER_MS = 12 * 60 * 60 * 1000;

export type LockRow = { holder_id: string; granted_at: Date; heartbeat_at: Date; expires_at: Date };

export type GrantDecision = { kind: "grant" } | { kind: "refresh" } | { kind: "held"; holder_id: string };

/** Decides what a lock request does, given the current row (or none). Pure. */
export function decideGrant(existing: LockRow | null, requester: string, now: Date): GrantDecision {
  if (!existing) return { kind: "grant" };
  if (existing.expires_at.getTime() <= now.getTime()) return { kind: "grant" };
  if (existing.holder_id === requester) return { kind: "refresh" };
  return { kind: "held", holder_id: existing.holder_id };
}

export function isStale(row: LockRow, now: Date): boolean {
  return now.getTime() - row.heartbeat_at.getTime() > STALE_AFTER_MS;
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + EXPIRES_AFTER_MS);
}
