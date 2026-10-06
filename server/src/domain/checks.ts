// Check contracts from shared/checks/<id>.json, read once. The server needs only the severity,
// so a part summary can say which failed checks block Publish. See docs/engineering.md, Checks.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CheckContract, type CheckSeverity } from "@nkata/shared";

export const CHECKS_DIR = fileURLToPath(new URL("../../../shared/checks/", import.meta.url));

let cache: Map<string, CheckSeverity> | null = null;

export function contractSeverities(dir: string = CHECKS_DIR): Map<string, CheckSeverity> {
  if (cache) return cache;
  const out = new Map<string, CheckSeverity>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const c = CheckContract.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    out.set(c.id, c.severity);
  }
  cache = out;
  return out;
}

/** A check a template names with no contract blocks: an unknown check must not pass by accident. */
export function checkSeverity(id: string): CheckSeverity {
  return contractSeverities().get(id) ?? "block";
}
