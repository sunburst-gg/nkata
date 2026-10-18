// Every person in the app renders through this: the initial on the person color, a 2 px canvas
// ring plus a 2 px color ring, and an optional presence dot outside the edge that breathes.
import type { CSSProperties } from "react";
import type { Person } from "@/data/types";

export interface AvatarProps {
  person: Pick<Person, "initial" | "color" | "name">;
  size?: 24 | 28 | 32 | 36;
  /** Draw the color ring. The prototype rings members who reached Blender, and me. */
  ring?: boolean;
  /** The breathing presence dot: in Blender now. */
  presence?: boolean;
  opacity?: number;
  title?: string;
  style?: CSSProperties;
}

export function Avatar({ person, size = 28, ring = true, presence = false, opacity, title, style }: AvatarProps) {
  const font = size <= 24 ? 11 : 12;
  return (
    <span title={title ?? person.name} aria-label={person.name} style={{ position: "relative", display: "inline-flex", flexShrink: 0, opacity, ...style }}>
      <span style={{ width: size, height: size, borderRadius: "50%", background: person.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: font, fontWeight: 600, boxShadow: ring ? `0 0 0 2px var(--canvas), 0 0 0 4px ${person.color}` : "none" }}>{person.initial}</span>
      {presence ? <span aria-label="In Blender now" style={{ position: "absolute", right: -3, bottom: -3, width: 10, height: 10, borderRadius: "50%", background: person.color, boxShadow: "0 0 0 2px var(--canvas)", animation: "nk-breathe 2.4s var(--ease) infinite" }} /> : null}
    </span>
  );
}
