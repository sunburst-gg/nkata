import { describe, expect, it } from "vitest";
import { stageGradient } from "./Stage";

describe("the lit stage", () => {
  it("tints the cyclorama toward the project color, 10% at the top and 14% at the floor", () => {
    expect(stageGradient("var(--swatch-1)")).toEqual({ top: "color-mix(in oklab, var(--stage-top) 90%, var(--swatch-1))", bot: "color-mix(in oklab, var(--stage-bot) 86%, var(--swatch-1))" });
  });
  it("uses the plain stage tokens with no project", () => {
    expect(stageGradient()).toEqual({ top: "var(--stage-top)", bot: "var(--stage-bot)" });
  });
});
