// Event bus. Every event is one row in the event table and one fan-out to the
// project's WebSocket clients. The agent re-syncs with GET /events?since= after a
// reconnect, so a missed socket message is never lost. See docs/engineering.md, Protocols.
import { ServerEvent, ServerEventKind } from "@nkata/shared";
import type { Db } from "./db/client.js";
import { event } from "./db/schema.js";
import { newId } from "./domain/ids.js";

export type Subscriber = (projectId: string, message: ServerEvent) => void;

export type EventBus = {
  /** Validates against the shared schema, writes the row, fans out. Returns the event id. */
  emit(params: { studio_id: string; target_kind: string; target_id: string; message: ServerEvent }): Promise<string>;
  /** Writes a privileged action to the log without fanning out. */
  audit(params: { studio_id: string; project_id: string | null; actor_id: string; kind: string; target_kind: string; target_id: string; payload: Record<string, unknown> }): Promise<string>;
  subscribe(fn: Subscriber): () => void;
};

export function isServerEventKind(kind: string): boolean {
  return ServerEventKind.safeParse(kind).success;
}

export function createEventBus(db: Db): EventBus {
  const subscribers = new Set<Subscriber>();
  return {
    async emit({ studio_id, target_kind, target_id, message }) {
      const parsed = ServerEvent.parse(message);
      const id = newId();
      await db.insert(event).values({
        id,
        studio_id,
        project_id: parsed.project_id,
        actor_id: parsed.actor_id,
        kind: parsed.kind,
        target_kind,
        target_id,
        payload: parsed,
        created_at: new Date(parsed.at),
        updated_at: new Date(parsed.at),
      });
      for (const fn of subscribers) fn(parsed.project_id, parsed);
      return id;
    },
    async audit({ studio_id, project_id, actor_id, kind, target_kind, target_id, payload }) {
      const id = newId();
      await db.insert(event).values({ id, studio_id, project_id, actor_id, kind, target_kind, target_id, payload });
      return id;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
