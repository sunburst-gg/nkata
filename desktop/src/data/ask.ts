// Ask (Cmd K). One question in, one answer with the gate, the owner, the last comment, and a
// link. v1 answers from the loaded snapshot with no model behind it: the words come from the
// data, so the answer is right for the assets on screen. Shared by the mock and the server source.
import type { AskAnswer, Asset } from "./types";

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function askAbout(question: string, assets: Asset[]): AskAnswer {
  const q = question.toLowerCase();
  const named = assets.find((a) => q.includes(a.name.toLowerCase()));
  if (named) {
    const waiting = named.parts.find((p) => p.state === "draft" || p.state === "waiting" || p.state === "locked");
    const gated = named.parts.find((p) => p.gate.length > 0 && (p.state === "locked" || p.state === "waiting"));
    const last = named.parts.flatMap((p) => p.comments).at(-1);
    const part = waiting ?? named.parts[0];
    const answer = part
      ? `${named.name} is waiting on ${part.name}. ${part.ownerId ? `${cap(part.ownerId)} owns it, ` : ""}${cap(part.state)}${gated ? `. The gate to ${gated.name} opens when ${gated.gate.join(" and ")} ${gated.gate.length > 1 ? "are" : "is"} Approved` : ""}.`
      : `${named.name} has no parts yet.`;
    return { answer, note: last ? `Last comment, ${cap(last.authorId)}, ${last.when}: "${last.text}"` : "", link: part ? { label: `Open ${named.name} / ${part.name}`, assetSlug: named.slug, partName: part.name } : { label: `Open ${named.name}`, assetSlug: named.slug } };
  }
  const ready = assets.filter((a) => a.state === "ready");
  if (ready.length) return { answer: `${ready.length} asset${ready.length > 1 ? "s are" : " is"} Ready for review: ${ready.map((a) => a.name).join(", ")}.`, note: "Open the activity rail and press Review to see them.", link: { label: `Open ${ready[0]!.name}`, assetSlug: ready[0]!.slug } };
  return { answer: "Nothing is blocked. Save a part in Blender and ask again.", note: "", link: null };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
