// The team strip beside the wall title: a face per member in their color, the state under it,
// Invited at 45%, In Blender with the breathing dot. Leads get a dashed + that opens Invite.
import { useStore } from "@/app/store";
import { stripLabel } from "@/app/selectors";
import { useCan } from "@/auth/useCan";
import { Avatar } from "./Avatar";

export function TeamStrip() {
  const members = useStore((s) => s.members);
  const journeys = useStore((s) => s.journeys);
  const me = useStore((s) => s.me);
  const canInvite = useCan("invite");
  if (!me) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
      {members.map((m) => {
        const member = journeys[m.person.id] ? { ...m, journey: journeys[m.person.id]! } : m;
        const label = stripLabel(member, me);
        const artist = m.person.role === "artist";
        const step = ["invited", "joined", "blender", "inBlender"].indexOf(member.journey);
        return (
          <div key={m.person.id} title={`${m.person.first} · ${label}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: 72 }}>
            <Avatar person={m.person} size={32} ring={step >= 2 || !artist} presence={label === "In Blender"} opacity={step === 0 ? .45 : 1} style={{ transition: "opacity var(--t-panel), box-shadow var(--t-panel)" }} />
            <span style={{ font: "400 10px var(--mono)", color: "var(--ink40)", whiteSpace: "nowrap" }}>{label}</span>
          </div>
        );
      })}
      {canInvite ? (
        <button type="button" className="nk-plus" title="Invite people" aria-label="Invite people" onClick={() => useStore.setState({ inviteOpen: true })} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px dashed var(--ink40)", background: "transparent", color: "var(--ink60)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", margin: "0 6px 20px", padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
        </button>
      ) : null}
    </div>
  );
}
