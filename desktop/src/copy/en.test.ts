import { describe, expect, it } from "vitest";
import { en, t } from "./en";

describe("copy", () => {
  it("fills placeholders and repeats in order", () => {
    expect(t("mirror.synced", { s: 4 })).toBe("In Unreal · 4 s");
    expect(t("project.status", { n: [6, 14, 4] })).toBe("6 online · 14 changed today · 4 ready for review");
    expect(t("lock.other", { name: "Ada", t: "12 min" })).toBe("Ada has this part. Opened 12 min ago.");
    expect(t("setup.done")).toBe("Ready.");
  });

  it("keeps the handoff keys and the writing rules", () => {
    const keys = ["auth.signin.title", "mirror.synced", "lock.other", "rollback.confirm", "conflict"];
    for (const k of keys) expect(k in en).toBe(true);
    for (const [k, v] of Object.entries(en)) {
      expect(v, k).not.toMatch(/[!—]/);
      expect(v.toLowerCase(), k).not.toMatch(/\b(commit|branch|merge|checkout|changelist|push|pull|seamless|powerful|supercharge)\b/);
    }
  });
});
