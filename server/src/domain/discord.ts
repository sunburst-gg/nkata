// One Discord message per review decision, nothing else. docs/product.md, R7.
// The webhook URL is encrypted at rest with AES-256-GCM under DISCORD_SECRET.
// Webhooks: https://discord.com/developers/docs/resources/webhook#execute-webhook
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ReviewDecision } from "@nkata/shared";
import type { Db } from "../db/client.js";
import { project } from "../db/schema.js";
import { AppError } from "./errors.js";

const ALGO = "aes-256-gcm";

function keyOf(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptWebhook(url: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyOf(secret), iv);
  const ct = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function decryptWebhook(stored: string, secret: string): string {
  const [iv, tag, ct] = stored.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ct) throw new AppError("bad_request", "stored webhook is not readable");
  const decipher = createDecipheriv(ALGO, keyOf(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function isWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type ReviewMessage = { reviewer: string; owner: string | null; asset: string; part: string; decision: ReviewDecision; score: number; note: string };

/** The one line Discord gets. Product words only: Approved, Sent back. */
export function reviewLine(m: ReviewMessage): string {
  const verb = m.decision === "approve" ? "approved" : "sent back";
  const who = m.owner ? ` for ${m.owner}` : "";
  const note = m.note.trim() ? ` ${m.note.trim()}` : "";
  return `${m.reviewer} ${verb} ${m.asset} / ${m.part}${who}. Score ${m.score} of 5.${note}`;
}

export type DiscordPoster = (projectId: string, message: ReviewMessage) => Promise<boolean>;

/**
 * Posts the review line to the project's webhook. Returns false when no webhook is set or the
 * post failed. A failed post is logged by the caller and never fails the review.
 */
export function createDiscordPoster(db: Db, secret: string | undefined, fetchImpl: typeof fetch = fetch): DiscordPoster {
  return async (projectId, message) => {
    if (!secret) return false;
    const rows = await db.select({ webhook: project.discord_webhook }).from(project).where(eq(project.id, projectId)).limit(1);
    const stored = rows[0]?.webhook;
    if (!stored) return false;
    const url = decryptWebhook(stored, secret);
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: reviewLine(message), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  };
}
