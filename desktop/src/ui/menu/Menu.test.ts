// The assistive press that opens a menu (Menu.tsx).
import { describe, expect, it } from "vitest";
import { isAssistivePress } from "./Menu";

describe("a menu opens on an assistive press", () => {
  it("a click with no count is a press; a mouse click is not", () => {
    expect(isAssistivePress(0)).toBe(true);
    expect(isAssistivePress(1)).toBe(false);
    expect(isAssistivePress(2)).toBe(false);
  });
});
