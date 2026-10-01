// GET /events?project_id=&since=<event id>. Cursor is the last event id seen; ids are ULIDs and sort by time.
// Only ServerEvent kinds are returned. Audit rows stay in the table for the board and the log.
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { ServerEventKind, Ulid } from "@nkata/shared";
import { event } from "../db/schema.js";
import { loadProject, type TypedApp } from "./_shared.js";

const EventsQuery = z.object({
  project_id: Ulid,
  since: Ulid.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export async function eventRoutes(app: TypedApp): Promise<void> {
  app.get("/events", { schema: { querystring: EventsQuery } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.query.project_id);
    const conditions = [eq(event.project_id, proj.id), inArray(event.kind, ServerEventKind.options)];
    if (req.query.since) conditions.push(gt(event.id, req.query.since));
    const rows = await app.db.select({ id: event.id, payload: event.payload }).from(event).where(and(...conditions)).orderBy(asc(event.id)).limit(req.query.limit);
    const last = rows.at(-1);
    return { v: 1, events: rows.map((r) => ({ id: r.id, event: r.payload })), next: last ? last.id : (req.query.since ?? null), more: rows.length === req.query.limit };
  });
}
