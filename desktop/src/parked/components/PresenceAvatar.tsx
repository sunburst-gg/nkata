// shadcn Avatar (Radix) restyled. 20, 24, 32. Dot 8: amber online, neutral idle, none offline.
// AvatarStack overlaps by 6 and counts the rest in mono.
import * as RadixAvatar from "@radix-ui/react-avatar";
import type { AvatarTone, Person, Presence } from "@/data/types";
import { cn } from "@/lib/cn";

export type AvatarSize = 16 | 18 | 20 | 22 | 24 | 26 | 28 | 32 | 36 | 48 | 56 | 64;

export interface PresenceAvatarProps {
  initial: string;
  tone: AvatarTone;
  name?: string;
  size?: AvatarSize;
  presence?: Presence | "none";
  /** Ring color behind the avatar, the surface it sits on. */
  ring?: string;
  className?: string;
}

export function PresenceAvatar({ initial, tone, name, size = 24, presence = "none", ring, className }: PresenceAvatarProps) {
  const dot = size >= 32 ? 10 : 8;
  return (
    <RadixAvatar.Root
      title={name}
      aria-label={name}
      role={name ? "img" : undefined}
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[var(--avatar-fg)]", presence === "offline" && "opacity-60", className)}
      style={{ width: size, height: size, background: `var(--avatar-${tone})`, fontSize: Math.round(size * 0.4), boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      <RadixAvatar.Fallback delayMs={0}>{initial}</RadixAvatar.Fallback>
      {presence === "online" || presence === "idle" ? (
        <span aria-hidden="true" className="absolute -bottom-px -right-px rounded-full border-2" style={{ width: dot, height: dot, background: presence === "online" ? "var(--accent)" : "var(--fg-muted)", borderColor: ring ?? "var(--bg-canvas)" }} />
      ) : null}
    </RadixAvatar.Root>
  );
}

export function PersonAvatar({ person, ...rest }: { person: Person } & Omit<PresenceAvatarProps, "initial" | "tone" | "name">) {
  return <PresenceAvatar initial={person.initial} tone={person.tone} name={person.name} {...rest} />;
}

export interface AvatarStackProps {
  people: Person[];
  size?: AvatarSize;
  max?: number;
  ring?: string;
  className?: string;
}

export function AvatarStack({ people, size = 24, max = 3, ring = "var(--bg-canvas)", className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  if (people.length === 0) return null;
  return (
    <span className={cn("inline-flex", className)} aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <PresenceAvatar key={p.id} initial={p.initial} tone={p.tone} name={p.name} size={size} ring={ring} className={cn(i > 0 && "-ml-1.5")} />
      ))}
      {rest > 0 ? (
        <span className="role-mono -ml-1.5 inline-flex items-center justify-center rounded-full bg-active text-secondary" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }}>+{rest}</span>
      ) : null}
    </span>
  );
}
