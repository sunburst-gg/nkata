// The one email the server sends: the sign-in code with the link. Resend's HTTPS API, no SDK.
// https://resend.com/docs/api-reference/emails/send-email
import type { Config } from "../config.js";

export type Mailer = {
  /** True when the server can send. Dev mode works without it. */
  configured: boolean;
  sendCode(to: string, code: string, link: string): Promise<void>;
};

export function createMailer(config: Config, fetchImpl: typeof fetch = fetch): Mailer {
  const key = config.RESEND_API_KEY;
  const from = config.MAIL_FROM;
  return {
    configured: Boolean(key && from),
    async sendCode(to, code, link) {
      if (!key || !from) throw new Error("the server has no RESEND_API_KEY and MAIL_FROM, so it cannot send the code");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: `${code} is your Nkata code`, text: codeText(code, link) }),
      });
      if (!res.ok) throw new Error(`the mail service answered ${res.status}`);
    },
  };
}

export function codeText(code: string, link: string): string {
  return [`Your Nkata sign-in code is ${code}.`, "", "It works for 15 minutes. Enter it in the app, or open this link on this computer:", link, "", "If you did not ask for it, ignore this email."].join("\n");
}
