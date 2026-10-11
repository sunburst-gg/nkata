// What changed between two versions of a part, from the manifests the add-on wrote: objects
// added, removed, and touched (by their hash), triangles, materials. Pure, tested in diff.test.ts.
import type { VersionManifest } from "@/data/types";

export interface ManifestDiff {
  added: string[];
  removed: string[];
  touched: string[];
  /** Objects present in both with the same hash. */
  same: number;
  triangles: { before: number; after: number };
  materials: { added: string[]; removed: string[] };
  bones: { before: number | null; after: number | null };
}

export function diffManifests(before: VersionManifest | undefined, after: VersionManifest | undefined): ManifestDiff | null {
  if (!before || !after) return null;
  const a = new Map(before.objects.map((o) => [o.name, o]));
  const b = new Map(after.objects.map((o) => [o.name, o]));
  const added = [...b.keys()].filter((n) => !a.has(n));
  const removed = [...a.keys()].filter((n) => !b.has(n));
  const touched = [...b.keys()].filter((n) => a.has(n) && a.get(n)!.hash !== b.get(n)!.hash);
  const same = [...b.keys()].filter((n) => a.has(n) && a.get(n)!.hash === b.get(n)!.hash).length;
  const sum = (m: VersionManifest) => m.objects.reduce((t, o) => t + o.triangles, 0);
  const mats = (m: VersionManifest) => new Set(m.objects.flatMap((o) => o.materials));
  const ma = mats(before);
  const mb = mats(after);
  return {
    added, removed, touched, same,
    triangles: { before: sum(before), after: sum(after) },
    materials: { added: [...mb].filter((x) => !ma.has(x)), removed: [...ma].filter((x) => !mb.has(x)) },
    bones: { before: before.bones, after: after.bones },
  };
}

/** The lines the What changed list shows. Empty when nothing differs. */
export function diffLines(d: ManifestDiff): { text: string; tone: "added" | "removed" | "touched" | "same" }[] {
  const out: { text: string; tone: "added" | "removed" | "touched" | "same" }[] = [];
  for (const n of d.added) out.push({ text: `${n} added`, tone: "added" });
  for (const n of d.removed) out.push({ text: `${n} removed`, tone: "removed" });
  for (const n of d.touched) out.push({ text: `${n} changed`, tone: "touched" });
  const dt = d.triangles.after - d.triangles.before;
  if (dt !== 0) out.push({ text: `Triangles ${d.triangles.before.toLocaleString()} to ${d.triangles.after.toLocaleString()} (${dt > 0 ? "+" : ""}${dt.toLocaleString()})`, tone: "touched" });
  for (const m of d.materials.added) out.push({ text: `Material ${m} added`, tone: "added" });
  for (const m of d.materials.removed) out.push({ text: `Material ${m} removed`, tone: "removed" });
  if (d.bones.before !== d.bones.after && (d.bones.before !== null || d.bones.after !== null)) out.push({ text: `Bones ${d.bones.before ?? 0} to ${d.bones.after ?? 0}`, tone: "touched" });
  if (out.length === 0) out.push({ text: `Nothing changed. ${d.same} object${d.same === 1 ? "" : "s"} are the same.`, tone: "same" });
  else if (d.same > 0) out.push({ text: `${d.same} object${d.same === 1 ? "" : "s"} unchanged`, tone: "same" });
  return out;
}
