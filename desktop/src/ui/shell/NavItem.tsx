import type { ReactNode } from "react";

export function NavItem({ active, onClick, children, muted, height = 36, style }: { active?: boolean; onClick: () => void; children: ReactNode; muted?: boolean; height?: number; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} className="nk-nav" style={{ height, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", borderRadius: "var(--r-6)", border: 0, width: "100%", textAlign: "left", background: active ? "var(--raised)" : "transparent", color: muted ? "var(--ink60)" : "var(--ink)", font: "400 var(--t-15) var(--sans)", ...style }}>
      {children}
    </button>
  );
}
