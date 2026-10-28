// The invite page: the download for the visitor's computer first, the other one click away, then
// the email to sign in with, escaped.
import { describe, expect, it } from "vitest";
import { joinPage, platformOf } from "../src/domain/joinPage.js";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const BASE = "https://downloads.example/latest/";

const order = (html: string) => [...html.matchAll(/data-platform="(\w+)"/g)].map((m) => m[1]);

describe("the invite page", () => {
  it("reads the platform from the browser", () => {
    expect(platformOf(MAC)).toBe("mac");
    expect(platformOf(WINDOWS)).toBe("windows");
    expect(platformOf(undefined)).toBe("mac");
  });

  it("puts this computer's download first and links both", () => {
    const mac = joinPage({ email: "ada@sunburst.studio", userAgent: MAC, downloadsUrl: BASE });
    expect(order(mac)).toEqual(["mac", "windows"]);
    expect(mac).toContain('href="https://downloads.example/latest/Nkata-mac.dmg"');
    expect(mac).toContain('href="https://downloads.example/latest/Nkata-windows-setup.exe"');
    expect(mac).toContain("Open Anyway");
    const win = joinPage({ email: "ada@sunburst.studio", userAgent: WINDOWS, downloadsUrl: BASE });
    expect(order(win)).toEqual(["windows", "mac"]);
    expect(win).toContain("Run anyway");
  });

  it("names the email to sign in with, escaped, and reads without one", () => {
    expect(joinPage({ email: "ada@sunburst.studio", userAgent: MAC, downloadsUrl: BASE })).toContain("sign in as <b");
    const odd = joinPage({ email: '<script>"x"</script>@a.b', userAgent: MAC, downloadsUrl: BASE });
    expect(odd).not.toContain("<script>");
    expect(odd).toContain("&lt;script&gt;");
    expect(joinPage({ email: "", userAgent: MAC, downloadsUrl: BASE })).toContain("Open Nkata and sign in. A six digit code");
  });

  it("keeps the product's words", () => {
    const text = joinPage({ email: "a@b.c", userAgent: WINDOWS, downloadsUrl: BASE }).replace(/<[^>]*>/g, " ");
    expect(text).toContain("You are in.");
    expect(text).not.toMatch(/—|!|\b(just|simply|seamless|commit|repository)\b/i);
  });
});
