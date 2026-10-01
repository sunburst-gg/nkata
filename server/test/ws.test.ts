// WebSocket: presence heartbeat fans out presence.changed, lock events reach the project, bad tokens are closed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServerEvent } from "@nkata/shared";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ARTIST = "artist@sunburst.gg";
const AD = "director@sunburst.gg";

function connect(url: string): Promise<{ ws: WebSocket; events: ServerEvent[]; next: (kind: string) => Promise<ServerEvent> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const events: ServerEvent[] = [];
    const waiters: { kind: string; resolve: (e: ServerEvent) => void }[] = [];
    ws.addEventListener("message", (m) => {
      const e = JSON.parse(String(m.data)) as ServerEvent;
      events.push(e);
      const i = waiters.findIndex((w) => w.kind === e.kind);
      if (i >= 0) waiters.splice(i, 1)[0]!.resolve(e);
    });
    ws.addEventListener("open", () =>
      resolve({
        ws, events,
        next: (kind) => {
          const found = events.find((e) => e.kind === kind);
          if (found) return Promise.resolve(found);
          return new Promise((r) => waiters.push({ kind, resolve: r }));
        },
      }),
    );
    ws.addEventListener("error", () => reject(new Error("websocket failed")));
  });
}

describe.skipIf(!hasInfra)("websocket", () => {
  let h: Harness;
  let base: string;
  beforeAll(async () => {
    h = await startHarness();
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const addr = h.app.server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    base = `ws://127.0.0.1:${addr.port}/ws?project=${h.seeded.project_id}`;
  });
  afterAll(async () => h?.close());

  it("closes a socket with a bad token", async () => {
    const ws = new WebSocket(`${base}&token=nope`);
    const code = await new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
    expect(code).toBe(4001);
  });

  it("fans out presence and lock events to the project", async () => {
    const artist = await connect(`${base}&token=${h.tokens[ARTIST]}`);
    const ad = await connect(`${base}&token=${h.tokens[AD]}`);
    const parts = (await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) })).json() as { parts: { name: string; id: string }[] };
    const face = parts.parts.find((p) => p.name === "face")!.id;

    artist.ws.send(JSON.stringify({ v: 1, kind: "presence.heartbeat", part_id: face }));
    const presence = await ad.next("presence.changed");
    if (presence.kind !== "presence.changed") throw new Error("wrong kind");
    expect(presence.online.map((o) => o.user.name)).toEqual(["Rising Sun artist"]);
    expect(presence.online[0]?.part_id).toBe(face);

    await h.app.inject({ method: "POST", url: `/parts/${face}/lock`, ...h.as(ARTIST) });
    const granted = await ad.next("lock.granted");
    expect(granted.kind === "lock.granted" && granted.part_id).toBe(face);

    ad.ws.send(JSON.stringify({ v: 1, kind: "lock.request", part_id: face }));
    const requested = await artist.next("lock.requested");
    expect(requested.kind === "lock.requested" && requested.requester.name).toBe("Art director");

    artist.ws.send(JSON.stringify({ v: 1, kind: "lock.release", part_id: face }));
    const released = await ad.next("lock.released");
    expect(released.kind === "lock.released" && released.reason).toBe("closed");

    artist.ws.close();
    const gone = await new Promise<ServerEvent>((resolve) => {
      const check = (): void => {
        const e = ad.events.filter((x) => x.kind === "presence.changed").at(-1);
        if (e && e.kind === "presence.changed" && e.online.length === 0) resolve(e);
        else setTimeout(check, 20);
      };
      check();
    });
    expect(gone.kind).toBe("presence.changed");
    ad.ws.close();
  });
});
