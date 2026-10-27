// Invite people: email, the role select, one line for the picked role, Enter sends. The person
// appears in the team list and the strip at once as Invited. Art directors hand out artist and
// viewer only (invitableRoles). Markup from the prototype's INVITE block.
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useStore } from "@/app/store";
import { stripLabel } from "@/app/selectors";
import { invitableRoles, ROLE_LINE, ROLE_WORD } from "@/auth/permissions";
import type { Role } from "@/data/types";
import { Avatar } from "@/ui/people/Avatar";
import { toast } from "@/ui/toast/toast";

const field: React.CSSProperties = { height: 44, borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: "0 14px", fontSize: 15, color: "var(--ink)", outline: "none" };

export function InviteDialog() {
  const open = useStore((s) => s.inviteOpen);
  const me = useStore((s) => s.me);
  const members = useStore((s) => s.members);
  const journeys = useStore((s) => s.journeys);
  const projectId = useStore((s) => s.projectId);
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("artist");
  if (!me) return null;
  const roles = invitableRoles(me.role);
  const close = () => useStore.setState({ inviteOpen: false });
  const send = async () => {
    const e = email.trim();
    if (!e || !source || !projectId) return;
    if (!e.includes("@")) { toast("That needs an @ to be an email.", "var(--bad)"); return; }
    try {
      await source.invite(projectId, e, role);
      setEmail("");
      await refresh();
      toast(`${e} invited as ${role === "artist" ? "an artist" : role === "artDirector" ? "an art director" : `a ${ROLE_WORD[role].toLowerCase()}`}.`, me.color);
    } catch (err) { toast(err instanceof Error ? err.message : "That invite did not go out.", "var(--bad)"); }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40 }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 480, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 20, zIndex: 41, outline: "none", animation: "nk-rise var(--t-panel) var(--ease)" }}>
          <Dialog.Title style={{ margin: 0, font: "400 var(--t-28) var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Invite people</Dialog.Title>
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "flex", gap: 8 }}>
            <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" aria-label="Email" style={{ ...field, flex: 1, minWidth: 0 }} />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" style={{ ...field, padding: "0 10px" }}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_WORD[r]}</option>)}
            </select>
            <button type="submit" style={{ height: 44, padding: "0 18px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer" }}>Invite</button>
          </form>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>{ROLE_LINE[role]}</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {members.map((m) => {
              const member = journeys[m.person.id] ? { ...m, journey: journeys[m.person.id]! } : m;
              const label = stripLabel(member, me);
              return (
                <div key={m.person.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                  <Avatar person={m.person} size={28} ring={false} opacity={member.journey === "invited" ? .45 : 1} />
                  <span style={{ flex: 1, color: "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.person.name}</span>
                  <span style={{ fontSize: 13, color: "var(--ink60)" }}>{ROLE_WORD[m.person.role]}</span>
                  <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", width: 110, textAlign: "right" }}>{label}</span>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
