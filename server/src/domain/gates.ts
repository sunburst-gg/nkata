// Gate evaluation. A gate is {after: [part_name, ...]} on the part. The server evaluates
// on every review.decided and on gate removal: if all named parts of the same asset are
// Approved, the part moves Locked to Draft. A name with no part in this asset is met: an asset
// can be created with one part (docs/decisions.md, 2026-10-10). See docs/engineering.md, Gates.
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
    if (waits.every((p) => p.state === "approved")) {
      openings.push({ part_id: part.id, opened_by: waits.map((p) => p.id) });
    }
  }
  return openings;
}

/** Parts a locked part still waits on, for the panel. */
export function waitingOn(part: GatedPart, parts: GatedPart[]): string[] {
  const byName = new Map(parts.map((p) => [p.name, p]));
  return part.gate.after.filter((name) => byName.has(name) && byName.get(name)?.state !== "approved");
}

/** Locked at creation only when a named part exists in this asset. */
export function initialState(gate: Gate, partNames: Iterable<string>): PartState {
  const names = new Set(partNames);
  return gate.after.some((name) => names.has(name)) ? "locked" : "draft";
}
