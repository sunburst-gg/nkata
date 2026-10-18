import { describe, expect, it } from "vitest";
import { reasonOf } from "./reason";

describe("reasonOf", () => {
  it("keeps the string a Tauri command rejected with", () => {
    expect(reasonOf("Blender could not install the add-on: Error: cannot import name 'nkata_shared'", "Blender did not connect.")).toBe(
      "Blender could not install the add-on: Error: cannot import name 'nkata_shared'",
    );
  });
  it("keeps an Error's message", () => {
    expect(reasonOf(new Error("Put your Unreal project inside the project folder first."), "x")).toBe("Put your Unreal project inside the project folder first.");
  });
  it("falls back for anything else", () => {
    expect(reasonOf(undefined, "Blender did not connect.")).toBe("Blender did not connect.");
    expect(reasonOf("", "Blender did not connect.")).toBe("Blender did not connect.");
    expect(reasonOf(new Error(""), "Blender did not connect.")).toBe("Blender did not connect.");
    expect(reasonOf({ code: 1 }, "Blender did not connect.")).toBe("Blender did not connect.");
  });
});
