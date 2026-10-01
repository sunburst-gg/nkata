// GET /export/:asset_id: the JSON manifest of parts, owners, states, versions, and comments.
// The agent writes the plain files next to it from local data. See docs/engineering.md, Export.
import { eq, inArray } from "drizzle-orm";
import { comment, part, version } from "../db/schema.js";
import { z } from "zod";
import { Ulid } from "@nkata/shared";
import { assetState, loadAsset, userRefs, type TypedApp } from "./_shared.js";
import { commentWire } from "./comments.js";

export async function exportRoutes(app: TypedApp): Promise<void> {
  app.get("/export/:asset_id", { schema: { params: z.object({ asset_id: Ulid }) } }, async (req) => {
    const a = await loadAsset(app.db, req.principal, req.params.asset_id);
    const parts = await app.db.select().from(part).where(eq(part.asset_id, a.id)).orderBy(part.position);
    const ids = parts.map((p) => p.id);
    const versions = ids.length ? await app.db.select().from(version).where(inArray(version.part_id, ids)).orderBy(version.created_at) : [];
    const comments = ids.length ? await app.db.select().from(comment).where(inArray(comment.part_id, ids)).orderBy(comment.created_at) : [];
    const owners = await userRefs(app.db, parts.map((p) => p.owner_id).filter((x): x is string => x !== null));
    const pins = await commentWire(app, comments);
    return {
      v: 1,
      exported_at: app.now().toISOString(),
      asset: { id: a.id, name: a.name, state: assetState(parts.map((p) => p.state)), reference_files: a.reference_files },
      parts: parts.map((p) => ({
        id: p.id, name: p.name, state: p.state, owner: p.owner_id ? owners.get(p.owner_id) ?? null : null, gate: p.gate, mapping: p.mapping,
        versions: versions.filter((v) => v.part_id === p.id).map((v) => ({ id: v.id, author_id: v.author_id, file_version_id: v.file_version_id, published: v.published, mirror_status: v.mirror_status, note: v.note, created_at: v.created_at.toISOString() })),
        comments: pins.filter((c) => c.part_id === p.id),
      })),
    };
  });
}
