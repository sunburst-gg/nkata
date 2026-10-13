// Short-lived links to files the app loads cross-origin, signed by this server and served by it.
// The store's own signed URLs work for <img> but not for a fetch from the desktop window: a
// fetch needs CORS headers, and the stores differ (MinIO answers any origin, RustFS 1.0.1
// answers none, R2 needs bucket configuration). Serving the bytes from here puts the CORS
// policy in one place (docs/decisions.md, 2026-10-13).
// HMAC: https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const LINK_TTL_SECONDS = 60 * 60;

export type Links = {
  /** An absolute link to `path` that `verify` accepts until it expires. */
  sign(path: string, now: Date): string;
  /** True when `sig` matches `path` and `exp`, and `exp` is still ahead. */
  verify(path: string, exp: string, sig: string, now: Date): boolean;
};

export function createLinks(publicUrl: string, secret?: string): Links {
  // Without LINK_SECRET the key lasts for this process: a restart ends every link, and the app
  // asks for fresh ones on its next load. Set it when more than one server answers.
  const key = secret ?? randomBytes(32).toString("hex");
  const mac = (path: string, exp: string) => createHmac("sha256", key).update(`${path}\n${exp}`).digest("hex");
  return {
    sign(path, now) {
      const exp = String(Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS);
      return `${publicUrl}${path}?exp=${exp}&sig=${mac(path, exp)}`;
    },
    verify(path, exp, sig, now) {
      if (!/^\d{1,12}$/.test(exp) || Number(exp) <= Math.floor(now.getTime() / 1000)) return false;
      const expected = Buffer.from(mac(path, exp), "hex");
      const given = Buffer.from(sig, "hex");
      return given.length === expected.length && given.length > 0 && timingSafeEqual(given, expected);
    },
  };
}
