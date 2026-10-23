// Chunk store routes. The server never proxies bytes: it signs URLs and records what exists.
// Upload: POST /files/upload-urls (missing hashes get PUT URLs), PUT bytes to the store,
// POST /files/uploaded (server HEADs each object and records the chunk row), then
// POST /projects/:id/file-versions. Download: POST /files/download-urls for GET URLs.
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { Ulid } from "@nkata/shared";
import { asset, chunk, file_version, part } from "../db/schema.js";
import { AppError, notFound } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { URL_TTL_SECONDS } from "../store/s3.js";
import { IdParam, isReviewer, loadProject, requireNotHeldByOther, type TypedApp } from "./_shared.js";

const Blake3 = z.string().regex(/^[0-9a-f]{64}$/);
const ChunkRef = z.object({ blake3: Blake3, size: z.number().int().min(1) });
const MAX_BATCH = 2000;

const UploadUrlsBody = z.object({ project_id: Ulid, chunks: z.array(ChunkRef).max(MAX_BATCH) });
const UploadedBody = z.object({ project_id: Ulid, chunks: z.array(ChunkRef).max(MAX_BATCH) });
const DownloadUrlsBody = z.object({ project_id: Ulid, hashes: z.array(Blake3).max(MAX_BATCH) });
const FileVersionBody = z.object({
  id: Ulid.optional(),
  path: z.string().min(1).refine((p) => !p.startsWith("/") && !p.includes("..") && !p.includes("\\"), "path must be relative with forward slashes"),
  size: z.number().int().min(0),
  blake3: Blake3,
  chunk_hashes: z.array(Blake3),
});
const FileVersionsQuery = z.object({ since: Ulid.optional(), limit: z.coerce.number().int().min(1).max(5000).default(1000) });

async function knownHashes(app: TypedApp, studioId: string, hashes: string[]): Promise<Map<string, { size: number; store_key: string }>> {
  const out = new Map<string, { size: number; store_key: string }>();
  for (let i = 0; i < hashes.length; i += 500) {
    const batch = hashes.slice(i, i + 500);
    if (batch.length === 0) continue;
    const rows = await app.db.select({ blake3: chunk.blake3, size: chunk.size, store_key: chunk.store_key }).from(chunk).where(and(eq(chunk.studio_id, studioId), inArray(chunk.blake3, batch)));
    for (const r of rows) out.set(r.blake3, { size: r.size, store_key: r.store_key });
  }
  return out;
}

/** Runs fn over items with at most n in flight. */
async function parallel<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

export async function fileRoutes(app: TypedApp): Promise<void> {
  app.post("/files/upload-urls", { schema: { body: UploadUrlsBody } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.body.project_id);
    const known = await knownHashes(app, proj.studio_id, req.body.chunks.map((c) => c.blake3));
    const missing = req.body.chunks.filter((c) => !known.has(c.blake3));
    const urls = await parallel(missing, 16, async (c) => ({ blake3: c.blake3, url: await app.store.signPut(app.store.chunkKey(proj.studio_id, c.blake3), c.size) }));
    req.log.info({ project_id: proj.id, asked: req.body.chunks.length, missing: missing.length }, "upload urls");
    return { v: 1, missing: urls, expires_in: URL_TTL_SECONDS };
  });

  app.post("/files/uploaded", { schema: { body: UploadedBody } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.body.project_id);
    const known = await knownHashes(app, proj.studio_id, req.body.chunks.map((c) => c.blake3));
    const fresh = req.body.chunks.filter((c) => !known.has(c.blake3));
    const checked = await parallel(fresh, 16, async (c) => {
      const key = app.store.chunkKey(proj.studio_id, c.blake3);
      const size = await app.store.head(key);
      return { c, key, ok: size !== null && size === c.size };
    });
    const now = app.now();
    const rows = checked.filter((x) => x.ok).map((x) => ({ id: newId(), studio_id: proj.studio_id, blake3: x.c.blake3, size: x.c.size, store_key: x.key, created_at: now, updated_at: now }));
    for (let i = 0; i < rows.length; i += 500) {
      await app.db.insert(chunk).values(rows.slice(i, i + 500)).onConflictDoNothing({ target: [chunk.studio_id, chunk.blake3] });
    }
    const confirmed = [...known.keys(), ...rows.map((r) => r.blake3)];
    const missing = checked.filter((x) => !x.ok).map((x) => x.c.blake3);
    req.log.info({ project_id: proj.id, confirmed: confirmed.length, missing: missing.length }, "uploads confirmed");
    return { v: 1, confirmed, missing };
  });

  app.post("/files/download-urls", { schema: { body: DownloadUrlsBody } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.body.project_id);
    const known = await knownHashes(app, proj.studio_id, req.body.hashes);
    const missing = req.body.hashes.filter((h) => !known.has(h));
    if (missing.length > 0) throw new AppError("chunks_missing", `${missing.length} chunks are not in the store`, { missing: missing.slice(0, 20) });
    const urls = await parallel(req.body.hashes, 16, async (h) => {
      const k = known.get(h)!;
      return { blake3: h, size: k.size, url: await app.store.signGet(k.store_key) };
    });
    return { v: 1, urls, expires_in: URL_TTL_SECONDS };
  });

  app.post("/projects/:id/file-versions", { schema: { params: IdParam, body: FileVersionBody } }, async (req, reply) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const id = req.body.id ?? newId();
    const existing = (await app.db.select().from(file_version).where(eq(file_version.id, id)).limit(1))[0];
    if (existing) return { v: 1, file_version: existing };
    // No overwrite (v8 step 16): a file that is an asset's .blend takes a new copy only from its
    // owner or a lead, and never while someone else has it open. Without this, a second artist's
    // save travelled to the owner's computer and replaced their file on the next pull. The refused
    // copy stays on the sender's computer; the agent keeps it as not sent.
    const owners = await app.db
      .select({ id: part.id, owner_id: part.owner_id })
      .from(part)
      .innerJoin(asset, eq(asset.id, part.asset_id))
      .where(and(eq(asset.project_id, proj.id), sql`${part.mapping}->>'file' = ${req.body.path}`));
    for (const row of owners) {
      if (row.owner_id && row.owner_id !== req.principal.user_id && !isReviewer(req.principal)) {
        throw new AppError("forbidden", "only the owner or a lead can change this asset's file", { part_id: row.id, path: req.body.path });
      }
      await requireNotHeldByOther(app.db, req.principal, row.id, app.now());
    }
    const known = await knownHashes(app, proj.studio_id, req.body.chunk_hashes);
    const missing = req.body.chunk_hashes.filter((h) => !known.has(h));
    if (missing.length > 0) throw new AppError("chunks_missing", `${missing.length} chunks are not in the store`, { missing: missing.slice(0, 20) });
    const total = req.body.chunk_hashes.reduce((n, h) => n + (known.get(h)?.size ?? 0), 0);
    if (total !== req.body.size) throw new AppError("bad_request", "chunk sizes do not add up to the file size", { size: req.body.size, total });
    const now = app.now();
    const [saved] = await app.db
      .insert(file_version)
      .values({ id, studio_id: proj.studio_id, project_id: proj.id, path: req.body.path, size: req.body.size, blake3: req.body.blake3, chunk_hashes: req.body.chunk_hashes, created_at: now, updated_at: now })
      .returning();
    req.log.info({ project_id: proj.id, path: req.body.path, size: req.body.size, chunks: req.body.chunk_hashes.length }, "file version recorded");
    return reply.status(201).send({ v: 1, file_version: saved });
  });

  // One file version by id, for a viewer in stream mode fetching a file on demand.
  app.get("/projects/:id/file-versions/:fvid", { schema: { params: z.object({ id: Ulid, fvid: Ulid }) } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const row = (await app.db.select().from(file_version).where(and(eq(file_version.id, req.params.fvid), eq(file_version.project_id, proj.id))).limit(1))[0];
    if (!row) throw notFound("file_version", req.params.fvid);
    return { v: 1, file_version: row };
  });

  // Ordered by id (ULID, time sorted). The agent folds the stream to the newest version per path.
  app.get("/projects/:id/file-versions", { schema: { params: IdParam, querystring: FileVersionsQuery } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const conditions = [eq(file_version.project_id, proj.id)];
    if (req.query.since) conditions.push(gt(file_version.id, req.query.since));
    const rows = await app.db.select().from(file_version).where(and(...conditions)).orderBy(asc(file_version.id)).limit(req.query.limit);
    const last = rows.at(-1);
    return { v: 1, file_versions: rows, next: last ? last.id : (req.query.since ?? null), more: rows.length === req.query.limit };
  });
}
