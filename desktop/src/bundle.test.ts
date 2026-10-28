// What the installer ships. Tauri bundles the binary named after the Rust package as the app's
// main one, so the package must carry the window binary's name. Named nkata-agent, the 0.1.0
// installers shipped the CLI as Nkata.app and no window opened (docs/decisions.md, 2026-10-28).
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the bundle", () => {
  const conf = JSON.parse(read("../src-tauri/tauri.conf.json")) as { mainBinaryName: string; version: string };
  const cargo = read("../src-tauri/Cargo.toml");

  it("names the Rust package after the window binary", () => {
    const pkg = /\[package\][^[]*?\nname = "([^"]+)"/.exec(cargo)?.[1];
    expect(pkg).toBe(conf.mainBinaryName);
    // The window binary is the one built with the desktop feature, from desktop.rs.
    expect(cargo).toMatch(new RegExp(`\\[\\[bin\\]\\]\\nname = "${conf.mainBinaryName}"\\npath = "src/desktop.rs"`));
  });

  it("carries the workspace's version", () => {
    const workspace = readFileSync(new URL("../../Cargo.toml", import.meta.url), "utf8");
    expect(/\[workspace\.package\]\nversion = "([^"]+)"/.exec(workspace)?.[1]).toBe(conf.version);
  });

  // The fixtures are dev only and stay out of the build (vite.config.ts). Whatever a live screen
  // loads must ship: the 0.1.3 Sign in had no ghost, since its model was a fixture.
  it("ships the ghost model, small, outside the fixtures", () => {
    // Read from the source: importing GhostStage loads the viewer, which needs a browser.
    const GHOST_MODEL = /export const GHOST_MODEL = "([^"]+)"/.exec(read("./ui/stage/GhostStage.tsx"))?.[1] ?? "";
    expect(GHOST_MODEL.startsWith("/fixtures/")).toBe(false);
    const file = new URL(`../public${GHOST_MODEL}`, import.meta.url);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(1024 * 1024);
    expect(read("../vite.config.ts")).toContain("dropFixtures()");
  });

  // Updates: the app reads the manifest the release writes, under the key the release uses.
  it("reads the update manifest the release writes", () => {
    const updater = (JSON.parse(read("../src-tauri/tauri.conf.json")) as { plugins: { updater: { pubkey: string; endpoints: string[] } }; bundle: { createUpdaterArtifacts: boolean } });
    expect(updater.bundle.createUpdaterArtifacts).toBe(true);
    expect(updater.plugins.updater.pubkey.length).toBeGreaterThan(40);
    const workflow = read("../../.github/workflows/desktop-build.yml");
    const [endpoint] = updater.plugins.updater.endpoints;
    expect(endpoint).toMatch(/\/latest\/latest\.json$/);
    expect(workflow).toContain('"s3://$BUCKET/latest/latest.json"');
    const key = /Some\("([a-z0-9-]+)"\)/.exec(read("../src-tauri/src/updates.rs"))?.[1];
    expect(key).toBe("darwin-universal");
    expect(read("../../scripts/updater-manifest.sh")).toContain(`"${key}"`);
  });
});
