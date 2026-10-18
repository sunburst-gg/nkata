import { useStore } from "@/app/store";
import { filterCounts, type Filter } from "@/app/selectors";

export function FilterChips() {
  const assets = useStore((s) => s.assets);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  if (!me) return null;
  return (
    <div role="group" aria-label="Show" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {filterCounts(assets, me).map((f) => {
        const active = filter === f.name;
        return (
          <button key={f.name} type="button" className="nk-chip" aria-pressed={active} onClick={() => setFilter(f.name as Filter)} style={{ height: 32, padding: "0 12px", borderRadius: "var(--r-6)", border: 0, background: active ? "var(--raised)" : "transparent", color: active ? "var(--ink)" : "var(--ink60)", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: active ? 500 : 400, transition: "background var(--t-fast)", boxShadow: active ? "var(--shadow)" : undefined }}>
            {f.name}{f.hasCount ? <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>{f.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
