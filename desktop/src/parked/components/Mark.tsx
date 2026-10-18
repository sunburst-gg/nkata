// The Nkata mark: an arch and a dot. Inlined so the dot can take the accent or currentColor.
// Source: src/assets/brand/nkata-mark-currentcolor.svg
export interface MarkProps {
  size?: number;
  /** accent: amber dot. mono: the whole mark in currentColor. */
  tone?: "accent" | "mono";
  className?: string;
}

export function Mark({ size = 18, tone = "accent", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <path d="M16 50V26Q16 14 32 14Q48 14 48 26V50" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="56" cy="10" r="6" fill={tone === "accent" ? "var(--accent)" : "currentColor"} />
    </svg>
  );
}

/** Mark plus the wordmark, for sign in and join screens. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Mark size={size} />
      <span className="text-24 font-semibold tracking-[-0.02em]">nkata</span>
    </div>
  );
}
