// The Approved seal: amber, a check, turned -6 degrees. nk-stamp once when it appears (step 6
// wires the stamp on Approve); on the wall it sits still.
import type { CSSProperties } from "react";

export function ApprovedSeal({ size = 28, stamp = false, style }: { size?: 28 | 36; stamp?: boolean; style?: CSSProperties }) {
  return (
    <span aria-label="Approved" title="Approved" style={{ width: size, height: size, borderRadius: "50%", background: "var(--amber)", color: "var(--amber-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", transform: "rotate(-6deg)", boxShadow: "var(--shadow)", animation: stamp ? "nk-stamp 600ms var(--ease) both" : undefined, ...style }}>
      <svg width={size === 28 ? 14 : 18} height={size === 28 ? 14 : 18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
    </span>
  );
}
