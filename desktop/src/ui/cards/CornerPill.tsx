// The corner pill on a card: "Live", "Needs your eyes" (amber outline), or the Approved seal.
import { ApprovedSeal } from "@/ui/asset/ApprovedSeal";

export type Corner = "live" | "needsMe" | "approved" | null;

export function CornerPill({ kind }: { kind: Corner }) {
  if (kind === "live") return <span style={{ position: "absolute", left: 12, top: 12, fontSize: 12, color: "var(--ink)", background: "var(--raised)", padding: "3px 9px", borderRadius: "var(--r-6)", boxShadow: "var(--shadow)" }}>Live</span>;
  if (kind === "needsMe") return <span style={{ position: "absolute", left: 12, top: 12, fontSize: 12, color: "var(--ink)", border: "1.5px solid var(--amber)", padding: "2px 9px", borderRadius: "var(--r-6)", background: "var(--raised)" }}>Needs your eyes</span>;
  if (kind === "approved") return <ApprovedSeal size={28} style={{ position: "absolute", left: 12, top: 12 }} />;
  return null;
}
