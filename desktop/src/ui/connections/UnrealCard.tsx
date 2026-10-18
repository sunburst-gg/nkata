// Unreal Engine: one card, "Coming soon". Everything else stays behind UNREAL_ENABLED=false
// (Decisions 19). Markup from the prototype's CONNECTIONS block.
export function UnrealCard() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 0", borderTop: "1px solid var(--line)", opacity: .6 }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", flexShrink: 0 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 1.6c4.9 0 8.9 4 8.9 8.9s-4 8.9-8.9 8.9-8.9-4-8.9-8.9S7.1 3.1 12 3.1zM10.2 6.3c-2.3.9-4.1 3-4.6 5.5.6-.6 1.3-1 2-1.3v3.3c0 1.6 1 2.6 2.5 3.2 1.1.4 2.3.5 3.5.2l1.5 1.4 3.1-3.6-1.1-.4c-.4.7-1 1.2-1.7 1.5V8.5c0-.6.3-1 .8-1.3-1.3-.4-2.7-.3-3.9.3v7.1c-.4.1-.9 0-1.3-.1V7.6c-.3-.5-.6-.9-.8-1.3z" /></svg>
      </span>
      <span style={{ fontWeight: 500, color: "var(--ink)", flex: 1 }}>Unreal Engine</span>
      <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--r-6)", background: "var(--hover)", color: "var(--ink60)" }}>Coming soon</span>
    </div>
  );
}
