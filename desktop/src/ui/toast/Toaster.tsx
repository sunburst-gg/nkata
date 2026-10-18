import { useStore } from "@/app/store";

export function Toaster() {
  const t = useStore((s) => s.toast);
  const clear = useStore((s) => s.clearToast);
  if (!t) return null;
  return (
    <div role="status" onClick={() => { t.go?.(); clear(); }} style={{ position: "fixed", left: 272, bottom: 56, background: "var(--toast-bg)", color: "var(--toast-fg)", padding: "8px 14px 8px 8px", borderRadius: "var(--r-12)", boxShadow: "var(--shadow-lift)", display: "flex", alignItems: "center", gap: 12, fontSize: 14, maxWidth: 520, zIndex: 50, cursor: "pointer", animation: "nk-rise var(--t-panel) var(--ease)" }}>
      {t.thumb ? <span aria-hidden="true" style={{ width: 40, height: 30, borderRadius: "var(--r-6)", background: `linear-gradient(180deg, var(--stage-top), var(--stage-bot))`, backgroundImage: `url(${t.thumb})`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center bottom", flexShrink: 0 }} /> : null}
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
      {t.text}
    </div>
  );
}
