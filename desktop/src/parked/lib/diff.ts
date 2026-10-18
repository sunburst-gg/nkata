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
  /** Textures by name. A removed and an added one of the same size reads as a rename. */
  textures: { added: string[]; removed: string[]; renamed: { from: string; to: string }[] };
  uvSets: { before: string[]; after: string[] };
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
  const ta = new Map((before.textures ?? []).map((t) => [t.name, t]));
  const tb = new Map((after.textures ?? []).map((t) => [t.name, t]));
  const gone = [...ta.keys()].filter((n) => !tb.has(n));
  const fresh = [...tb.keys()].filter((n) => !ta.has(n));
  const renamed: { from: string; to: string }[] = [];
  for (const from of [...gone]) {
    const size = ta.get(from)!;
    const to = fresh.find((n) => tb.get(n)!.width === size.width && tb.get(n)!.height === size.height && !renamed.some((r) => r.to === n));
    if (to) renamed.push({ from, to });
  }
  const uv = (m: VersionManifest) => [...new Set(m.objects.flatMap((o) => o.uvSets ?? []))].sort();
  return {
    added, removed, touched, same,
    triangles: { before: sum(before), after: sum(after) },
    materials: { added: [...mb].filter((x) => !ma.has(x)), removed: [...ma].filter((x) => !mb.has(x)) },
    bones: { before: before.bones, after: after.bones },
    textures: { added: fresh.filter((n) => !renamed.some((r) => r.to === n)), removed: gone.filter((n) => !renamed.some((r) => r.from === n)), renamed },
    uvSets: { before: uv(before), after: uv(after) },
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
  for (const r of d.textures.renamed) out.push({ text: `Texture ${r.from} renamed to ${r.to}`, tone: "touched" });
  for (const t of d.textures.added) out.push({ text: `Texture ${t} added`, tone: "added" });
  for (const t of d.textures.removed) out.push({ text: `Texture ${t} removed`, tone: "removed" });
  if (d.uvSets.before.join() !== d.uvSets.after.join()) out.push({ text: `UV sets ${d.uvSets.before.join(", ") || "none"} to ${d.uvSets.after.join(", ") || "none"}`, tone: "touched" });
  if (out.length === 0) out.push({ text: `Nothing changed. ${d.same} object${d.same === 1 ? "" : "s"} are the same.`, tone: "same" });
  else if (d.same > 0) out.push({ text: `${d.same} object${d.same === 1 ? "" : "s"} unchanged`, tone: "same" });
  return out;
}
