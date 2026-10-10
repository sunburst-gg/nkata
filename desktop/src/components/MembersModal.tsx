// Members: search or email, a role, Add; then everyone with access and their role on the right.
// Producers manage from here (the studio menu and the sidebar open it).
import { useState } from "react";
import { ROLE_WORDS, ROLES, type Role } from "@/auth/permissions";
import { useCan, useStore } from "@/store";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { CONTROL, Select } from "./Field";
import { PresenceAvatar } from "./PresenceAvatar";

export function MembersModal() {
  const open = useStore((s) => s.membersOpen);
  const setMembers = useStore((s) => s.setMembers);
  const can = useCan();
  if (!can("manageMembers")) return null;
  return (
    <Dialog open={open} onOpenChange={setMembers} title="Members" width={560} closeButton>
      <MembersPanel />
    </Dialog>
  );
}

/** The members list with the add row, also the Settings, Members tab. */
export function MembersPanel({ compact = false }: { compact?: boolean }) {
  const people = useStore((s) => s.db.people);
  const me = useStore((s) => s.db.session.user);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const can = useCan();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("artist");
  const add = () => {
    const value = email.trim();
    if (!value.includes("@")) { toast("Enter an email.", "failed"); return; }
    source.invite(value, role);
    setEmail("");
    toast("Invite sent.");
  };
  const manage = can("manageMembers");
  return (
    <div className="flex flex-col gap-4">
      {manage ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Search by name or enter an email" aria-label="Search by name or enter an email" className={`${CONTROL} h-10 flex-1 px-3`} />
          <span className="w-36"><Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 px-2.5">{ROLES.map((r) => <option key={r} value={r}>{ROLE_WORDS[r]}</option>)}</Select></span>
          <Button type="submit" variant="primary" className="h-10">Add</Button>
        </form>
      ) : null}
      <span className="pt-2 text-13 text-secondary">People with access</span>
      <div className="flex flex-col">
        {people.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 border-b border-hairline ${compact ? "py-2.5" : "py-2"}`}>
            <PresenceAvatar initial={p.initial} tone={p.tone} name={p.name} size={32} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-14 text-heading">{p.name} {p.id === me.id ? <span className="text-muted">(You)</span> : null}</span>
              <span className="truncate text-13 text-secondary">{p.email}</span>
            </div>
            {manage && p.id !== me.id ? (
              <span className="w-34"><Select aria-label={`${p.name} role`} value={p.role} onChange={(e) => { const v = e.target.value; if (v === "remove") { source.removeMember(p.id); toast(`${p.name} removed.`, "muted"); } else source.setMemberRole(p.id, v as Role); }} className="h-7.5 rounded-lg px-2 text-13">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_WORDS[r]}</option>)}
                <option value="remove">Remove</option>
              </Select></span>
            ) : <span className="text-13 text-secondary">{ROLE_WORDS[p.role]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
