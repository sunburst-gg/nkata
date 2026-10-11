// Sending email. Resend's HTTPS API, no SDK: https://resend.com/docs/api-reference/emails/send-email
// The emails themselves are in emails.ts. Without a key and a sender nothing sends, and only dev
// mode can sign anyone in.
import type { Config } from "../config.js";
import type { Email } from "./emails.js";

export type Mailer = {
  /** True when the server can send. Dev mode works without it. */
  configured: boolean;
  send(email: Email): Promise<void>;
};

export function createMailer(config: Config, fetchImpl: typeof fetch = fetch): Mailer {
  const key = config.RESEND_API_KEY;
  const from = config.MAIL_FROM;
  return {
    configured: Boolean(key && from),
    async send(email) {
      if (!key || !from) throw new Error("the server has no RESEND_API_KEY and MAIL_FROM, so it cannot send email");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      });
      if (!res.ok) throw new Error(`the mail service answered ${res.status}`);
    },
  };
}
