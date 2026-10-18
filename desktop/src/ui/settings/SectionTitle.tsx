export function SectionTitle({ children, line }: { children: string; line?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8 }}>
      <span style={{ font: "400 20px var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{children}</span>
      {line ? <span style={{ fontSize: 13, color: "var(--ink60)" }}>{line}</span> : null}
    </div>
  );
}
export const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)" };
export const field: React.CSSProperties = { height: 40, borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", padding: "0 12px", fontSize: 15, color: "var(--ink)", outline: "none" };
export const button: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", color: "var(--ink)", font: "500 13px var(--sans)", cursor: "pointer" };
export const primary: React.CSSProperties = { ...button, background: "var(--amber)", color: "var(--amber-fg)" };
