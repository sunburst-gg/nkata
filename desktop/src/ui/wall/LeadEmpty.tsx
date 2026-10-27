// Lead, empty: "Bring your artists.", the inline invite, the one role line, the Stage with the
// ghost and "Your team's first save lands here.", and, on the mock, the quiet link to the sample.
// The sample project lives in the mock alone, so live data has no link to it.
import { useState } from "react";
import { useStore } from "@/app/store";
import { invitableRoles, ROLE_LINE, ROLE_WORD } from "@/auth/permissions";
import type { Role } from "@/data/types";
import { LiveDataSource } from "@/data/live/LiveDataSource";
import { GhostStage } from "@/ui/stage/GhostStage";
import { toast } from "@/ui/toast/toast";

const field: React.CSSProperties = { height: 44, borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", padding: "0 14px", fontSize: 15, color: "var(--ink)", outline: "none" };

export function LeadEmpty() {
  const me = useStore((s) => s.me);
  const source = useStore((s) => s.source);
  const projectId = useStore((s) => s.projectId);
  const refresh = useStore((s) => s.refresh);
  const go = useStore((s) => s.go);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("artist");
  const roles = me ? invitableRoles(me.role) : [];
  const invite = async () => {
    const e = email.trim();
    if (!e || !source || !projectId || !me) return;
    await source.invite(projectId, e, role);
    setEmail("");
    await refresh();
    toast(`${e} invited as ${role === "artist" ? "an artist" : `a ${ROLE_WORD[role].toLowerCase()}`}.`, me.color);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: 48, alignItems: "start", marginTop: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ font: "400 28px/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Bring your artists.</span>
        <form onSubmit={(e) => { e.preventDefault(); void invite(); }} style={{ display: "flex", gap: 8 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@sunburst.studio" aria-label="Email" style={{ ...field, flex: 1, minWidth: 0 }} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" style={{ ...field, padding: "0 10px" }}>{roles.map((r) => <option key={r} value={r}>{ROLE_WORD[r]}</option>)}</select>
          <button type="submit" style={{ flexShrink: 0, height: 44, padding: "0 18px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer" }}>Invite</button>
        </form>
        <span style={{ fontSize: 13, color: "var(--ink60)" }}>{ROLE_LINE[role]}</span>
        {source instanceof LiveDataSource ? null : <span style={{ fontSize: 13, color: "var(--ink60)", paddingTop: 8 }}>While you wait, <button type="button" onClick={() => go("asset", { projectId: "try-nkata", assetId: "try-nkata/market-stall" })} style={{ border: 0, background: "transparent", padding: 0, font: "inherit", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>leave a comment on a sample</button>.</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <GhostStage radius={16} aspect="4/3" shadow grid={40} style={{ maxHeight: "calc(100vh - 360px)" }} />
        <span style={{ fontSize: 13, color: "var(--ink60)", textAlign: "center" }}>Your team's first save lands here.</span>
      </div>
    </div>
  );
}
