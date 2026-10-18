// The eight swatches as a radio group: a 28 px circle inside a 32 px hit target, the picked one
// ringed in its own color. Zero state, New project and Project settings share it.
import { SWATCHES } from "./swatches";

export function Swatches({ value, onPick, gap = 8 }: { value: string; onPick: (c: string) => void; gap?: number }) {
  return (
    <div role="radiogroup" aria-label="Project color" style={{ display: "flex", gap, margin: "-2px" }}>
      {SWATCHES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c.replace("var(--p-", "").replace(")", "")} onClick={() => onPick(c)} style={{ width: 32, height: 32, border: 0, padding: 2, background: "transparent", cursor: "pointer", borderRadius: "50%", display: "inline-flex" }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: c, boxShadow: value === c ? `0 0 0 2px var(--canvas), 0 0 0 3.5px ${c}` : "none", transition: "box-shadow var(--t-fast) var(--ease)" }} />
        </button>
      ))}
    </div>
  );
}
