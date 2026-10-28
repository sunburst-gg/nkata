// What the installer ships. Tauri bundles the binary named after the Rust package as the app's
// main one, so the package must carry the window binary's name. Named nkata-agent, the 0.1.0
// installers shipped the CLI as Nkata.app and no window opened (docs/decisions.md, 2026-10-28).
import { readFileSync } from "node:fs";
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
});
