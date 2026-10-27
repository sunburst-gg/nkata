// On live data the first run and the empty wall name the real project and offer no sample: the
// sample project exists only in the mock, so a link to it made the server answer 400
// (/events?project_id=try-nkata) and showed the prototype's words to a real studio.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StateCreator } from "zustand";

vi.stubGlobal("document", { documentElement: { setAttribute() { /* static markup */ }, dataset: {} } });
vi.stubGlobal("location", { search: "" });
vi.mock("@/viewer/nk-viewer.js", () => ({}));
// The same server snapshot fix as viewer.test.tsx: the store is seeded after create().
vi.mock("zustand", async (importOriginal) => {
  const z = await importOriginal<typeof import("zustand")>();
  const create = (init: StateCreator<unknown>) => {
    const api = z.createStore(init);
    api.getInitialState = api.getState;
    const hook = (selector: (s: unknown) => unknown) => z.useStore(api, selector);
    return Object.assign(hook, api);
  };
  return { ...z, create };
});

const { useStore } = await import("@/app/store");
const { MockDataSource } = await import("@/data/mock");
const { LiveDataSource } = await import("@/data/live/LiveDataSource");
const { Arrival } = await import("@/screens/Arrival");
const { Zero } = await import("@/screens/Zero");
const { LeadEmpty } = await import("@/ui/wall/LeadEmpty");

const PROJECT = { id: "01COD0000000000000000000000", name: "Call of Duty", color: "var(--swatch-1)" };
const PROTOTYPE = [/sample/i, /Rising Sun/, /Market stall/, /Njoku wants/];

function live(role: "lead" | "viewer") {
  const me = new MockDataSource({ stage: "empty", role }).me;
  const source = new LiveDataSource({ serverUrl: "http://server", token: "tok", folder: null, fetch: () => Promise.reject(new Error("no fetch in static markup")), now: () => new Date(), pollMs: 0 });
  useStore.setState({ source, me, studio: { id: "st1", name: "Activision", training: false }, projects: [PROJECT], projectId: PROJECT.id, members: [], setupDone: [] } as never);
}

describe("live data shows no prototype sample", () => {
  it("the lead's empty wall", () => {
    live("lead");
    const html = renderToStaticMarkup(<LeadEmpty />);
    for (const w of PROTOTYPE) expect(html).not.toMatch(w);
  });
  it("the first project step", () => {
    live("lead");
    const html = renderToStaticMarkup(<Zero which="project" />);
    for (const w of PROTOTYPE) expect(html).not.toMatch(w);
  });
  it("Arrival, for a lead and for a viewer", () => {
    for (const role of ["lead", "viewer"] as const) {
      live(role);
      const html = renderToStaticMarkup(<Arrival />);
      for (const w of PROTOTYPE) expect(html).not.toMatch(w);
      expect(html).toMatch(/Call of Duty/);
    }
  });
});
