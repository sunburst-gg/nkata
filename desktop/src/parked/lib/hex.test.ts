// No hex values in components or screens. Colors come from tokens.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : []; });
}

describe("no hex in components", () => {
  it("components, screens, and store use token variables only", () => {
    const src = fileURLToPath(new URL("../", import.meta.url));
    const files = [...walk(join(src, "components")), ...walk(join(src, "screens")), ...walk(join(src, "store"))];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
