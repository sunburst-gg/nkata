// One Discord message per review decision, nothing else. A fake webhook on a local port records
// every post; Mark Ready and gate open post nothing. docs/product.md, R7.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ARTIST = "artist@sunburst.gg";
const AD = "director@sunburst.gg";
const PRODUCER = "producer@sunburst.gg";

describe.skipIf(!hasInfra)("discord", () => {
  let h: Harness;
  let hook: Server;
  let url = "";
  const posts: { content: string }[] = [];
  beforeAll(async () => {
    h = await startHarness();
    hook = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString(); });
      req.on("end", () => { posts.push(JSON.parse(body) as { content: string }); res.writeHead(204); res.end(); });
    });
    await new Promise<void>((r) => hook.listen(0, "127.0.0.1", r));
    const addr = hook.address();
    url = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}/hook` : "";
  });
  afterAll(async () => { hook.close(); await h?.close(); });

  it("posts once on approve and once on send back, nothing on mark ready or gate open", async () => {
    const pid = h.seeded.project_id;
    expect((await h.app.inject({ method: "PUT", url: `/projects/${pid}/discord`, ...h.as(PRODUCER), payload: { webhook_url: url } })).statusCode).toBe(200);
    const asset = (await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) })).json() as { parts: { name: string; id: string }[] };
    const parts = Object.fromEntries(asset.parts.map((p) => [p.name, p.id]));
    const v = (await h.app.inject({ method: "POST", url: `/parts/${parts["face"]}/versions`, ...h.as(ARTIST), payload: {} })).json() as { version: { id: string } };
    await h.app.inject({ method: "POST", url: `/parts/${parts["face"]}/state`, ...h.as(ARTIST), payload: { action: "mark_ready" } });
    expect(posts).toHaveLength(0);

    const back = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(AD), payload: { part_id: parts["face"], version_id: v.version.id, score: 2, decision: "send_back", note: "Ears too big." } });
    expect(back.statusCode).toBe(201);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.content).toBe("Art director sent back Ojukwu / face for Rising Sun artist. Score 2 of 5. Ears too big.");

    await h.app.inject({ method: "POST", url: `/parts/${parts["face"]}/state`, ...h.as(ARTIST), payload: { action: "mark_ready" } });
    const ok = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(AD), payload: { part_id: parts["face"], version_id: v.version.id, score: 5, decision: "approve" } });
    expect(ok.statusCode).toBe(201);
    expect(posts).toHaveLength(2);
    expect(posts[1]!.content).toBe("Art director approved Ojukwu / face for Rising Sun artist. Score 5 of 5.");

    // Removing a gate opens a part and posts nothing.
    await h.app.inject({ method: "POST", url: `/parts/${parts["rig"]}/gate/remove`, ...h.as(AD) });
    expect(posts).toHaveLength(2);
  });

  it("a dead webhook never fails the review", async () => {
    const pid = h.seeded.project_id;
    await h.app.inject({ method: "PUT", url: `/projects/${pid}/discord`, ...h.as(PRODUCER), payload: { webhook_url: "http://127.0.0.1:9/nowhere" } });
    const asset = (await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) })).json() as { parts: { name: string; id: string }[] };
    const cloth = asset.parts.find((p) => p.name === "cloth")!.id;
    const v = (await h.app.inject({ method: "POST", url: `/parts/${cloth}/versions`, ...h.as(ARTIST), payload: {} })).json() as { version: { id: string } };
    await h.app.inject({ method: "POST", url: `/parts/${cloth}/state`, ...h.as(ARTIST), payload: { action: "mark_ready" } });
    const r = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(AD), payload: { part_id: cloth, version_id: v.version.id, score: 4, decision: "approve" } });
    expect(r.statusCode).toBe(201);
  });
});
