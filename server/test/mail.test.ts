import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { codeText, createMailer } from "../src/domain/mail.js";

const base = { DATABASE_URL: "postgres://x", S3_ENDPOINT: "http://localhost:9000", S3_ACCESS_KEY: "a", S3_SECRET_KEY: "b" };

describe("mailer", () => {
  it("is off without a key and a sender, and says so", async () => {
    const m = createMailer(loadConfig(base));
    expect(m.configured).toBe(false);
    await expect(m.sendCode("a@b.c", "123456", "http://x")).rejects.toThrow("RESEND_API_KEY");
  });

  it("posts the code to Resend with the sender", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return new Response("{}", { status: 200 }); }) as typeof fetch;
    const m = createMailer(loadConfig({ ...base, RESEND_API_KEY: "re_x", MAIL_FROM: "Nkata <code@nkata.gg>" }), fetchImpl);
    expect(m.configured).toBe(true);
    await m.sendCode("ada@sunburst.gg", "482910", "http://x/auth/callback?token=t");
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0]!.init.body)) as { from: string; to: string[]; subject: string; text: string };
    expect(body).toMatchObject({ from: "Nkata <code@nkata.gg>", to: ["ada@sunburst.gg"], subject: "482910 is your Nkata code" });
    expect(body.text).toBe(codeText("482910", "http://x/auth/callback?token=t"));
    expect(body.text).toContain("15 minutes");
    const failing = createMailer(loadConfig({ ...base, RESEND_API_KEY: "re_x", MAIL_FROM: "x@y.z" }), (async () => new Response("no", { status: 422 })) as typeof fetch);
    await expect(failing.sendCode("a@b.c", "1", "l")).rejects.toThrow("422");
  });
});
