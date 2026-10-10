// Every setting comes from the environment. Never from code or the repo.
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("nkata"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // Dev mode prints magic links and returns them in the API response.
  NKATA_DEV: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  PORT: z.coerce.number().int().min(1).max(65535).default(7400),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_URL: z.url().default("http://localhost:7400"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  // Encrypts the Discord webhook URL at rest. Without it no webhook can be stored.
  DISCORD_SECRET: z.string().min(16).optional(),
  // Sends the sign-in code. Resend's HTTPS API (https://resend.com/docs/api-reference/emails/send-email).
  // Without both, only dev mode can sign anyone in.
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid environment: ${missing}`);
  }
  return parsed.data;
}
