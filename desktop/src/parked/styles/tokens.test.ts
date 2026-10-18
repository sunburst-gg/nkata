import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateTokens } from "../../scripts/tokens";
import { stateVar, tokens } from "./tokens";

describe("tokens", () => {
  it("tokens.ts matches tokens.json (run pnpm tokens)", () => {
    const json = readFileSync(fileURLToPath(new URL("./tokens/tokens.json", import.meta.url)), "utf8");
    const onDisk = readFileSync(fileURLToPath(new URL("./tokens.ts", import.meta.url)), "utf8");
    expect(onDisk).toBe(generateTokens(json));
  });

  it("exposes the one accent and the seven state colors", () => {
    expect(tokens.color.accent.base).toBe("#E9A23B");
    expect(Object.keys(tokens.color.state)).toEqual(["locked", "draft", "ready", "approved", "failed", "synced", "syncing", "syncFailed", "onState"]);
    expect(stateVar("syncFailed")).toBe("var(--state-sync-failed)");
  });

  it("the css copies in src/styles/tokens are the handoff files with no runtime font import", () => {
    const typography = readFileSync(fileURLToPath(new URL("./tokens/typography.css", import.meta.url)), "utf8");
    expect(typography).not.toContain("googleapis");
    const colors = readFileSync(fileURLToPath(new URL("./tokens/colors.css", import.meta.url)), "utf8");
    expect(colors).toContain(":root,[data-theme]{");
  });
});
