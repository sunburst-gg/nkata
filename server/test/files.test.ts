// Signed URL flow against the real store: upload-urls, PUT, uploaded, file-versions, download-urls, GET.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ARTIST = "artist@sunburst.gg";

// The server only checks that a hash is 64 hex chars and that bytes exist at the key. Blake3 is the agent's job.
const fakeBlake3 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

describe.skipIf(!hasInfra)("files", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => h?.close());

  it("round trips chunks through the store and dedupes them", async () => {
    const a = Buffer.alloc(1024, 1);
    const b = Buffer.alloc(2048, 2);
    const chunks = [{ blake3: fakeBlake3(a), size: a.length }, { blake3: fakeBlake3(b), size: b.length }];
    const pid = h.seeded.project_id;

    const urls = await h.app.inject({ method: "POST", url: "/files/upload-urls", ...h.as(ARTIST), payload: { project_id: pid, chunks } });
    const missing = (urls.json() as { missing: { blake3: string; url: string }[] }).missing;
    expect(missing).toHaveLength(2);
    for (const m of missing) {
      const data = m.blake3 === chunks[0]!.blake3 ? a : b;
      const put = await fetch(m.url, { method: "PUT", body: data, headers: { "content-length": String(data.length) } });
      expect(put.status, await put.text()).toBe(200);
    }

    // Confirming before upload of a third chunk reports it missing.
    const c = Buffer.alloc(100, 3);
    const confirmed = await h.app.inject({ method: "POST", url: "/files/uploaded", ...h.as(ARTIST), payload: { project_id: pid, chunks: [...chunks, { blake3: fakeBlake3(c), size: c.length }] } });
    expect(confirmed.json()).toMatchObject({ confirmed: expect.arrayContaining(chunks.map((x) => x.blake3)), missing: [fakeBlake3(c)] });

    // A file version over known chunks is accepted; over an unknown one, refused.
    const fv = await h.app.inject({ method: "POST", url: `/projects/${pid}/file-versions`, ...h.as(ARTIST), payload: { path: "Ojukwu/face.blend", size: 3072, blake3: fakeBlake3(Buffer.concat([a, b])), chunk_hashes: chunks.map((x) => x.blake3) } });
    expect(fv.statusCode).toBe(201);
    const bad = await h.app.inject({ method: "POST", url: `/projects/${pid}/file-versions`, ...h.as(ARTIST), payload: { path: "x", size: 100, blake3: fakeBlake3(c), chunk_hashes: [fakeBlake3(c)] } });
    expect(bad.statusCode).toBe(422);
    const wrongSize = await h.app.inject({ method: "POST", url: `/projects/${pid}/file-versions`, ...h.as(ARTIST), payload: { path: "x", size: 1, blake3: fakeBlake3(a), chunk_hashes: [chunks[0]!.blake3] } });
    expect(wrongSize.statusCode).toBe(400);

    // Dedupe: asking again returns no missing chunks.
    const again = await h.app.inject({ method: "POST", url: "/files/upload-urls", ...h.as(ARTIST), payload: { project_id: pid, chunks } });
    expect((again.json() as { missing: unknown[] }).missing).toHaveLength(0);

    // Download URLs serve the bytes back.
    const dl = await h.app.inject({ method: "POST", url: "/files/download-urls", ...h.as(ARTIST), payload: { project_id: pid, hashes: chunks.map((x) => x.blake3) } });
    const got = (dl.json() as { urls: { blake3: string; url: string; size: number }[] }).urls;
    const res = await fetch(got[1]!.url);
    expect(Buffer.from(await res.arrayBuffer()).equals(b)).toBe(true);

    // The version stream lists it with a cursor.
    const list = await h.app.inject({ method: "GET", url: `/projects/${pid}/file-versions`, ...h.as(ARTIST) });
    const body = list.json() as { file_versions: { path: string }[]; next: string };
    expect(body.file_versions.map((f) => f.path)).toEqual(["Ojukwu/face.blend"]);
    const after = await h.app.inject({ method: "GET", url: `/projects/${pid}/file-versions?since=${body.next}`, ...h.as(ARTIST) });
    expect((after.json() as { file_versions: unknown[] }).file_versions).toHaveLength(0);

    // One version by id, for stream mode. Unknown ids are 404.
    const one = await h.app.inject({ method: "GET", url: `/projects/${pid}/file-versions/${body.next}`, ...h.as(ARTIST) });
    expect((one.json() as { file_versions: never; file_version: { path: string } }).file_version.path).toBe("Ojukwu/face.blend");
    expect((await h.app.inject({ method: "GET", url: `/projects/${pid}/file-versions/01ARZ3NDEKTSV4RRFFQ69G5FAV`, ...h.as(ARTIST) })).statusCode).toBe(404);
  });

  it("rejects paths that escape the project folder", async () => {
    const res = await h.app.inject({ method: "POST", url: `/projects/${h.seeded.project_id}/file-versions`, ...h.as(ARTIST), payload: { path: "../etc/passwd", size: 0, blake3: "0".repeat(64), chunk_hashes: [] } });
    expect(res.statusCode).toBe(400);
  });
});
