// The Nkata mark: the arch in ink with the amber dot.
export function Mark({ size = 24 }: { size?: 24 | 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ color: "var(--ink)" }} aria-label="Nkata" role="img">
      <path d="M16 50V26Q16 14 32 14Q48 14 48 26V50" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="56" cy="10" r="6" fill="var(--amber)" />
    </svg>
  );
}
