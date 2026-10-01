// Presence: in-memory map per project, mirrored to the presence table on each heartbeat.
// Clients drop a user after 45 s silence. See docs/engineering.md, Presence.
import type { PresenceEntry, UserRef } from "@nkata/shared";

export const PRESENCE_TIMEOUT_MS = 45 * 1000;

type Entry = { user: UserRef; part_id: string | null; since: Date; last_seen: Date };

export type PresenceMap = {
  /** Returns true when the project's presence changed in a way others should see. */
  heartbeat(projectId: string, user: UserRef, partId: string | null, now: Date): boolean;
  leave(projectId: string, userId: string): boolean;
  /** Drops silent users. Returns the project ids whose presence changed. */
  sweep(now: Date): string[];
  list(projectId: string): PresenceEntry[];
};

export function createPresence(): PresenceMap {
  const projects = new Map<string, Map<string, Entry>>();
  const forProject = (id: string): Map<string, Entry> => {
    let m = projects.get(id);
    if (!m) {
      m = new Map();
      projects.set(id, m);
    }
    return m;
  };
  return {
    heartbeat(projectId, user, partId, now) {
      const m = forProject(projectId);
      const existing = m.get(user.id);
      if (!existing) {
        m.set(user.id, { user, part_id: partId, since: now, last_seen: now });
        return true;
      }
      const changed = existing.part_id !== partId;
      m.set(user.id, { user, part_id: partId, since: changed ? now : existing.since, last_seen: now });
      return changed;
    },
    leave(projectId, userId) {
      return forProject(projectId).delete(userId);
    },
    sweep(now) {
      const changed: string[] = [];
      for (const [projectId, m] of projects) {
        for (const [userId, entry] of m) {
          if (now.getTime() - entry.last_seen.getTime() > PRESENCE_TIMEOUT_MS) {
            m.delete(userId);
            if (!changed.includes(projectId)) changed.push(projectId);
          }
        }
      }
      return changed;
    },
    list(projectId) {
      return [...forProject(projectId).values()].map((e) => ({
        user: e.user,
        part_id: e.part_id,
        since: e.since.toISOString(),
        last_seen: e.last_seen.toISOString(),
      }));
    },
  };
}
