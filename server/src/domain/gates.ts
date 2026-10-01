// Gate evaluation. A gate is {after: [part_name, ...]} on the part. The server evaluates
// on every review.decided and on gate removal: if all named parts of the same asset are
// Approved, the part moves Locked to Draft. See docs/engineering.md, Gates.
import type { Gate, PartState } from "@nkata/shared";

export type GatedPart = { id: string; name: string; state: PartState; gate: Gate };

export type GateOpening = { part_id: string; opened_by: string[] };

/** Parts of one asset whose gate is now met. Pure. */
export function evaluateGates(parts: GatedPart[]): GateOpening[] {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const openings: GateOpening[] = [];
  for (const part of parts) {
    if (part.state !== "locked") continue;
    const waits = part.gate.after.map((name) => byName.get(name)).filter((p): p is GatedPart => p !== undefined);
    // A name that matches no part cannot be met. Keep the gate closed and let the template check catch it.
    if (waits.length !== part.gate.after.length) continue;
    if (waits.every((p) => p.state === "approved")) {
      openings.push({ part_id: part.id, opened_by: waits.map((p) => p.id) });
    }
  }
  return openings;
}

/** Parts a locked part still waits on, for the panel. */
export function waitingOn(part: GatedPart, parts: GatedPart[]): string[] {
  const byName = new Map(parts.map((p) => [p.name, p]));
  return part.gate.after.filter((name) => byName.get(name)?.state !== "approved");
}
