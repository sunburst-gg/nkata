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
  // Unreal is Coming soon in v1 (docs/tasks/07-blender-first.md). Off: the agent does not mirror,
  // Mark Ready renders from Blender, and the app shows Unreal as Coming soon. The code stays.
  UNREAL_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  // Signs the model links the app loads. Optional: without it each server process makes its own
  // key at start. Set it when more than one process answers for PUBLIC_URL.
  LINK_SECRET: z.string().min(16).optional(),
  // Encrypts the Discord webhook URL at rest. Without it no webhook can be stored.
  DISCORD_SECRET: z.string().min(16).optional(),
  // Sends the sign-in code. Resend's HTTPS API (https://resend.com/docs/api-reference/emails/send-email).
  // Without both, only dev mode can sign anyone in.
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(),
  // Where the installers are, as the latest/ folder of the downloads bucket (infra/aws/downloads.yaml).
  // The invite page links to the files inside it.
  DOWNLOADS_URL: z.url().default("https://nkata-downloads-445567075963.s3.ap-northeast-1.amazonaws.com/latest"),
  // Extra origins the desktop window may call from, comma separated. The Tauri origins and the
  // Vite dev server are always allowed.
  CORS_ORIGINS: z.string().optional().transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
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
