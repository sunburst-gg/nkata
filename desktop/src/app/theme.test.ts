// theme.ts touches document and localStorage; a tiny stand-in for both is enough here.
import { beforeEach, describe, expect, it, vi } from "vitest";

const attrs = new Map<string, string>();
const store = new Map<string, string>();
vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } });
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {} }));
const theme = await import("./theme");

describe("theme", () => {
  beforeEach(() => { attrs.clear(); store.clear(); });
  it("opens light for a new person, whatever the OS says", () => {
    expect(theme.setPerson("ada")).toBe("light");
    expect(attrs.get("data-theme")).toBe("light");
  });
  it("keeps a person's choice and resolves Match system from the OS", () => {
    theme.setPerson("ada");
    expect(theme.setTheme("dark")).toBe("dark");
    expect(theme.setTheme("system")).toBe("dark");
    expect(theme.storedTheme("ada")).toBe("system");
    expect(theme.setPerson("chidi")).toBe("light");
    expect(theme.setPerson("ada")).toBe("dark");
  });
});
