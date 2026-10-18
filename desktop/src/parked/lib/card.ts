// The publish card: what the next person reads before opening the file. Every number comes
// from the manifest the add-on wrote on save, never typed. Beside each value, the delta from
// the previous publish (docs/tasks/07-blender-first.md, slice 4). Pure, tested in card.test.ts.
import type { VersionManifest } from "@/data/types";
import { diffManifests } from "./diff";

export interface CardRow {
  label: "Triangles" | "Textures" | "Scale" | "UV sets";
  value: string;
  /** "+2,000", "1 renamed", "UVMap to UVMap, Lightmap". Absent when nothing changed or no previous publish. */
  delta?: string;
  tone?: "up" | "down" | "changed";
}

export interface PublishCard {
  rows: CardRow[];
  textureNames: string[];
}

const n = (x: number) => x.toLocaleString("en-US");
const signed = (d: number) => `${d > 0 ? "+" : "−"}${n(Math.abs(d))}`;

export function publishCard(current: VersionManifest | undefined, previous?: VersionManifest): PublishCard | null {
  if (!current) return null;
  const triangles = current.objects.reduce((t, o) => t + o.triangles, 0);
  const textures = current.textures ?? [];
  const uvSets = [...new Set(current.objects.flatMap((o) => o.uvSets ?? []))].sort();
  const scale = current.unitScale;
  const d = previous ? diffManifests(previous, current) : null;
  const rows: CardRow[] = [
    { label: "Triangles", value: n(triangles) },
    { label: "Textures", value: n(textures.length) },
    { label: "Scale", value: scale === null ? "—" : scale.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 }) },
    { label: "UV sets", value: uvSets.length === 0 ? "none" : uvSets.join(", ") },
  ];
  if (d) {
    const dt = d.triangles.after - d.triangles.before;
    if (dt !== 0) rows[0] = { ...rows[0]!, delta: signed(dt), tone: dt > 0 ? "up" : "down" };
    const parts: string[] = [];
    if (d.textures.renamed.length) parts.push(`${d.textures.renamed.length} renamed`);
    if (d.textures.added.length) parts.push(`+${d.textures.added.length}`);
    if (d.textures.removed.length) parts.push(`−${d.textures.removed.length}`);
    if (parts.length) rows[1] = { ...rows[1]!, delta: parts.join(", "), tone: "changed" };
    if (previous && previous.unitScale !== null && scale !== null && previous.unitScale !== scale) rows[2] = { ...rows[2]!, delta: `was ${previous.unitScale.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3 })}`, tone: "changed" };
    if (d.uvSets.before.join() !== d.uvSets.after.join()) rows[3] = { ...rows[3]!, delta: `was ${d.uvSets.before.join(", ") || "none"}`, tone: "changed" };
  }
  return { rows, textureNames: textures.map((t) => t.name) };
}
