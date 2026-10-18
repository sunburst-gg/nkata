// The ghost placeholder for a card with no live context and no still yet: an amber wireframe
// silhouette on the lit stage, turning slowly. Never gray, never empty (PROMPTS.md rule 3).
export function Ghost() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 75" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .35, animation: "nk-ghost-turn 14s linear infinite" }} fill="none" stroke="var(--amber)" strokeWidth=".8">
      <path d="M50 14 L74 26 L74 50 L50 62 L26 50 L26 26 Z" />
      <path d="M50 14 L50 38 L74 50 M50 38 L26 50 M26 26 L50 38 L74 26" />
      <path d="M38 20 L62 32 M62 20 L38 32 M38 44 L62 56 M62 44 L38 56" strokeDasharray="2 3" />
    </svg>
  );
}
