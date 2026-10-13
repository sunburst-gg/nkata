import { describe, expect, it } from "vitest";
import { createLinks, LINK_TTL_SECONDS } from "../src/domain/links.js";

describe("signed links", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const links = createLinks("http://localhost:7400", "a-secret-of-sixteen-plus");
  const parse = (url: string) => { const u = new URL(url); return { path: u.pathname, exp: u.searchParams.get("exp")!, sig: u.searchParams.get("sig")! }; };

  it("signs a path for one hour and verifies it", () => {
    const url = links.sign("/models/01ARZ3NDEKTSV4RRFFQ69G5FAV.glb", now);
    expect(url.startsWith("http://localhost:7400/models/01ARZ3NDEKTSV4RRFFQ69G5FAV.glb?exp=")).toBe(true);
    const { path, exp, sig } = parse(url);
    expect(Number(exp)).toBe(Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS);
    expect(links.verify(path, exp, sig, now)).toBe(true);
    expect(links.verify(path, exp, sig, new Date(now.getTime() + (LINK_TTL_SECONDS + 1) * 1000))).toBe(false);
  });

  it("refuses another path, a changed expiry, a bad signature, and another secret", () => {
    const { path, exp, sig } = parse(links.sign("/models/a.glb", now));
    expect(links.verify("/models/b.glb", exp, sig, now)).toBe(false);
    expect(links.verify(path, String(Number(exp) + 1), sig, now)).toBe(false);
    expect(links.verify(path, exp, sig.replace(/^./, sig[0] === "0" ? "1" : "0"), now)).toBe(false);
    expect(links.verify(path, exp, "zz", now)).toBe(false);
    expect(links.verify(path, exp, "", now)).toBe(false);
    expect(createLinks("http://localhost:7400", "another-secret-sixteen").verify(path, exp, sig, now)).toBe(false);
  });

  it("makes a key for the process when none is given", () => {
    const a = createLinks("http://x");
    const b = createLinks("http://x");
    const { path, exp, sig } = parse(a.sign("/models/a.glb", now));
    expect(a.verify(path, exp, sig, now)).toBe(true);
    expect(b.verify(path, exp, sig, now)).toBe(false);
  });
});
