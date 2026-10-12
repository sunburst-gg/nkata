import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { projectInviteEmail, signInCodeEmail, studioInviteEmail } from "../src/domain/emails.js";
import { createMailer } from "../src/domain/mail.js";

const base = { DATABASE_URL: "postgres://x", S3_ENDPOINT: "http://localhost:9000", S3_ACCESS_KEY: "a", S3_SECRET_KEY: "b" };

describe("emails", () => {
  it("renders the sign in code with the engine's copy", () => {
    const e = signInCodeEmail({ to: "ada@sunburst.studio", code: "482915" });
    expect(e.subject).toBe("482915 is your Nkata code");
    expect(e.html).toContain("482915");
    expect(e.html).toContain("ada@sunburst.studio");
    expect(e.html).toContain("15 minutes and once only");
    expect(e.html).toContain("prefers-color-scheme: dark");
    expect(e.text).toContain("482915");
  });

  it("renders the studio invite with the role's line and escapes what it is given", () => {
    const e = studioInviteEmail({ to: "ada@sunburst.studio", studio: "Sunburst <Games>", role: "artist", inviter: { name: "Emmanuel Njoku", email: "nj@njokuscript.com" }, href: "https://api.nkata.app/join?email=ada%40sunburst.studio" });
    expect(e.subject).toBe("Emmanuel added you to Sunburst <Games> on Nkata");
    expect(e.html).toContain("Join Sunburst &lt;Games&gt; on Nkata");
    expect(e.html).not.toContain("<Games>");
    expect(e.html).toContain("as an <span");
    expect(e.html).toContain("Artist");
    expect(e.html).toContain("open parts in Blender and Unreal");
    expect(e.html).toContain('href="https://api.nkata.app/join?email=ada%40sunburst.studio"');
    expect(e.text).toContain("as an Artist");
  });

  it("renders the project invite with the note, or without one", () => {
    const e = projectInviteEmail({ to: "funmi@lagosinteractive.com", project: { name: "Rising Sun", studio: "Sunburst", assets: 14, people: 6 }, role: "viewer", inviter: { name: "Emmanuel Njoku" }, note: "Start with Ojukwu.", href: "https://x/join" });
    expect(e.subject).toBe("Emmanuel shared Rising Sun with you on Nkata");
    expect(e.html).toContain("Sunburst · 14 assets · 6 people");
    expect(e.html).toContain("A note from Emmanuel");
    expect(e.html).toContain("Start with Ojukwu.");
    expect(e.html).toContain("You do not need Blender or Unreal");
    const bare = projectInviteEmail({ to: "a@b.c", project: { name: "Side", studio: "S", assets: 1, people: 1 }, role: "artist", inviter: { name: "Ada" }, note: null, href: "https://x/join" });
    expect(bare.html).not.toContain("A note from");
    expect(bare.html).toContain("1 asset · 1 person");
  });
});

describe("mailer", () => {
  it("is off without a key and a sender, and says so", async () => {
    const m = createMailer(loadConfig(base));
    expect(m.configured).toBe(false);
    await expect(m.send(signInCodeEmail({ to: "a@b.c", code: "123456" }))).rejects.toThrow("RESEND_API_KEY");
  });

  it("posts the email to Resend with the sender", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return new Response("{}", { status: 200 }); }) as typeof fetch;
    const m = createMailer(loadConfig({ ...base, RESEND_API_KEY: "re_x", MAIL_FROM: "Nkata <code@nkata.app>" }), fetchImpl);
    expect(m.configured).toBe(true);
    await m.send(signInCodeEmail({ to: "ada@sunburst.gg", code: "482910" }));
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0]!.init.body)) as { from: string; to: string[]; subject: string; html: string; text: string };
    expect(body).toMatchObject({ from: "Nkata <code@nkata.app>", to: ["ada@sunburst.gg"], subject: "482910 is your Nkata code" });
    expect(body.html).toContain("482910");
    const failing = createMailer(loadConfig({ ...base, RESEND_API_KEY: "re_x", MAIL_FROM: "x@y.z" }), (async () => new Response(JSON.stringify({ message: "The nkata.app domain is not verified." }), { status: 403 })) as typeof fetch);
    await expect(failing.send(signInCodeEmail({ to: "a@b.c", code: "1" }))).rejects.toThrow("403: The nkata.app domain is not verified.");
  });
});
