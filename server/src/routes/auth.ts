// Magic link sign in. Any email gets an account: the link creates the user when none exists, so
// nobody learns who is a member from the answer. Dev mode returns the link in the response.
// A session acts in one studio; /auth/switch issues a session for another of the account's studios.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Training, Ulid } from "@nkata/shared";
import { issueToken, newCode, redeemCode, redeemMagicToken, studiosOf } from "../auth/tokens.js";
import { membership, studio, user } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import type { TypedApp } from "./_shared.js";

export async function authRoutes(app: TypedApp): Promise<void> {
  app.post("/auth/magic-link", { schema: { body: z.object({ email: z.email() }) } }, async (req) => {
    const now = app.now();
    const email = req.body.email.toLowerCase();
    let row = (await app.db.select().from(user).where(eq(user.email, email)).limit(1))[0];
    if (!row) {
      // Sign up: an account with no name and no studio. Name and Create studio come next in the app.
      [row] = await app.db.insert(user).values({ id: newId(), email, name: "", avatar_url: null, created_at: now, updated_at: now }).returning();
      req.log.info({ user_id: row!.id }, "account created");
    }
    const studios = await studiosOf(app.db, row!.id);
    const code = newCode();
    const token = await issueToken(app.db, { user_id: row!.id, studio_id: studios[0]?.id ?? null, kind: "magic", now, code });
    const link = `${app.config.PUBLIC_URL}/auth/callback?token=${token}`;
    if (app.mailer.configured) {
      await app.mailer.sendCode(email, code, link);
      req.log.info({ user_id: row!.id }, "sign-in code sent");
    } else if (!app.config.NKATA_DEV) {
      throw new AppError("bad_request", "this server cannot send email yet. Set RESEND_API_KEY and MAIL_FROM, or run with NKATA_DEV=1.");
    }
    if (app.config.NKATA_DEV) {
      // Dev mode hands the code and the link back so a test or a laptop with no inbox can sign in.
      req.log.info({ user_id: row!.id, link, code }, "sign-in code (dev mode)");
      return { v: 1, sent: true, link, code };
    }
    return { v: 1, sent: true };
  });

  // The code from the email, typed into the app.
  app.post("/auth/code", { schema: { body: z.object({ email: z.email(), code: z.string().regex(/^\d{6}$/) }) } }, async (req) => {
    const now = app.now();
    const { user_id, studio_id } = await redeemCode(app.db, req.body.email, req.body.code, now);
    const session = await issueToken(app.db, { user_id, studio_id, kind: "session", now });
    return account(user_id, studio_id, session);
  });

  const account = async (userId: string, studioId: string | null, token: string) => {
    const [u] = await app.db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!u) throw new Error("user vanished between redeem and lookup");
    const studios = await studiosOf(app.db, userId);
    const current = studios.find((s) => s.id === studioId) ?? null;
    return { v: 1, token, user: { id: u.id, name: u.name, avatar_url: u.avatar_url }, email: u.email, studio_id: current?.id ?? null, roles: current?.roles ?? [], studios: studios.map((s) => ({ id: s.id, name: s.name, roles: s.roles })) };
  };

  app.post("/auth/callback", { schema: { body: z.object({ token: z.string().min(1) }) } }, async (req) => {
    const now = app.now();
    const { user_id, studio_id } = await redeemMagicToken(app.db, req.body.token, now);
    const session = await issueToken(app.db, { user_id, studio_id, kind: "session", now });
    return account(user_id, studio_id, session);
  });

  app.get("/auth/me", async (req) => {
    const p = req.account;
    return account(p.user_id, p.studio_id, "");
  });

  // A session for another studio of the same account.
  app.post("/auth/switch", { schema: { body: z.object({ studio_id: Ulid }) } }, async (req) => {
    const now = app.now();
    const studios = await studiosOf(app.db, req.account.user_id);
    if (!studios.some((s) => s.id === req.body.studio_id)) throw new AppError("not_found", "you are not a member of that studio");
    const session = await issueToken(app.db, { user_id: req.account.user_id, studio_id: req.body.studio_id, kind: "session", now });
    return account(req.account.user_id, req.body.studio_id, session);
  });

  app.get("/studios", async (req) => {
    return { v: 1, studios: await studiosOf(app.db, req.account.user_id) };
  });

  // Create your studio. The creator is its first producer and gets a session inside it.
  app.post("/studios", { schema: { body: z.object({ name: z.string().trim().min(1), training: Training.default("on") }) } }, async (req, reply) => {
    const now = app.now();
    const [st] = await app.db.insert(studio).values({ id: newId(), name: req.body.name, training: req.body.training, created_at: now, updated_at: now }).returning();
    await app.db.insert(membership).values({ id: newId(), studio_id: st!.id, user_id: req.account.user_id, roles: ["producer"], created_at: now, updated_at: now });
    await app.bus.audit({ studio_id: st!.id, project_id: null, actor_id: req.account.user_id, kind: "audit.studio_created", target_kind: "studio", target_id: st!.id, payload: { name: st!.name, training: st!.training } });
    const session = await issueToken(app.db, { user_id: req.account.user_id, studio_id: st!.id, kind: "session", now });
    req.log.info({ studio_id: st!.id }, "studio created");
    return reply.status(201).send(await account(req.account.user_id, st!.id, session));
  });

  // The person's own name and email. Email must stay unique: it is how they sign in.
  app.put("/me", { schema: { body: z.object({ name: z.string().trim().min(1), email: z.email().optional() }) } }, async (req) => {
    const now = app.now();
    const patch: { name: string; email?: string; updated_at: Date } = { name: req.body.name, updated_at: now };
    if (req.body.email) {
      const email = req.body.email.toLowerCase();
      const taken = (await app.db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1))[0];
      if (taken && taken.id !== req.account.user_id) throw new AppError("conflict", "that email belongs to another account");
      patch.email = email;
    }
    await app.db.update(user).set(patch).where(eq(user.id, req.account.user_id));
    return account(req.account.user_id, req.account.studio_id, "");
  });
}
