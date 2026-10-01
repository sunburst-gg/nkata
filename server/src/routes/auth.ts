// Magic link sign in. Dev mode prints the link and returns it in the response.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { issueToken, redeemMagicToken } from "../auth/tokens.js";
import { membership, user } from "../db/schema.js";
import type { TypedApp } from "./_shared.js";

export async function authRoutes(app: TypedApp): Promise<void> {
  app.post("/auth/magic-link", { schema: { body: z.object({ email: z.email() }) } }, async (req) => {
    const now = app.now();
    const rows = await app.db.select().from(user).where(eq(user.email, req.body.email.toLowerCase())).limit(1);
    const row = rows[0];
    if (!row) {
      // Same answer as success so the endpoint does not reveal who is a member.
      req.log.info({ email: req.body.email }, "magic link requested for unknown email");
      return { v: 1, sent: true };
    }
    const token = await issueToken(app.db, { user_id: row.id, studio_id: row.studio_id, kind: "magic", now });
    const link = `${app.config.PUBLIC_URL}/auth/callback?token=${token}`;
    if (app.config.NKATA_DEV) {
      req.log.info({ studio_id: row.studio_id, user_id: row.id, link }, "magic link (dev mode)");
      return { v: 1, sent: true, link };
    }
    // Email delivery is a later step. Until then the link is only in the dev log.
    req.log.info({ studio_id: row.studio_id, user_id: row.id }, "magic link issued");
    return { v: 1, sent: true };
  });

  app.post("/auth/callback", { schema: { body: z.object({ token: z.string().min(1) }) } }, async (req) => {
    const now = app.now();
    const { user_id, studio_id } = await redeemMagicToken(app.db, req.body.token, now);
    const session = await issueToken(app.db, { user_id, studio_id, kind: "session", now });
    const [u] = await app.db.select().from(user).where(eq(user.id, user_id)).limit(1);
    const [m] = await app.db.select().from(membership).where(eq(membership.user_id, user_id)).limit(1);
    if (!u || !m) throw new Error("user vanished between redeem and lookup");
    return { v: 1, token: session, user: { id: u.id, name: u.name, avatar_url: u.avatar_url }, studio_id, roles: m.roles };
  });

  app.get("/auth/me", async (req) => {
    const p = req.principal;
    return { v: 1, user: { id: p.user_id, name: p.name, avatar_url: p.avatar_url }, email: p.email, studio_id: p.studio_id, roles: p.roles };
  });
}
