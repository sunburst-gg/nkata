// Settings, one screen with sections: You (name, theme), Members (producer: role select and
// Remove; the last producer cannot leave; others see roles as text), Project (rename, delete,
// deleted projects with Restore), Billing (producer: "Nothing to pay" with Training on, seats
// and price with it off). Light first; the same visual system as the wall.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import { ROLE_WORD } from "@/auth/permissions";
import type { DeletedProject, Member, Role } from "@/data/types";
import { Avatar } from "@/ui/people/Avatar";
import { button, field, primary, row, SectionTitle } from "@/ui/settings/SectionTitle";
import { toast } from "@/ui/toast/toast";

const h1: React.CSSProperties = { margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" };

export function SettingsScreen() {
  const me = useStore((s) => s.me);
  const canMembers = useCan("manageMembers");
  const canBilling = useCan("billing");
  if (!me) return null;
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={h1}>Settings</h1>
      <You />
      <Members manage={canMembers} />
      <ProjectSection />
      {canBilling ? <Billing /> : null}
    </div>
  );
}

function You() {
  const me = useStore((s) => s.me)!;
  const source = useStore((s) => s.source);
  const choice = useStore((s) => s.themeChoice);
  const setTheme = useStore((s) => s.setTheme);
  const [name, setName] = useState(me.name);
  const save = async () => { if (!source || !name.trim() || name.trim() === me.name) return; const next = await source.setMe(name); useStore.setState({ me: next }); toast(`Saved. The team sees ${next.first}.`, next.color); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle>You</SectionTitle>
      <div style={row}><span style={{ width: 120, fontSize: 13, color: "var(--ink60)" }}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} aria-label="Name" style={{ ...field, flex: 1 }} /></div>
      <div style={row}><span style={{ width: 120, fontSize: 13, color: "var(--ink60)" }}>Theme</span>
        <div role="radiogroup" aria-label="Theme" style={{ display: "flex", gap: 8 }}>
          {(["light", "dark", "system"] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={choice === c} onClick={() => setTheme(c)} style={{ ...button, boxShadow: choice === c ? "0 0 0 1.5px var(--amber), var(--shadow)" : "var(--shadow)" }}>{c === "light" ? "Light" : c === "dark" ? "Dark" : "Match system"}</button>)}
        </div>
      </div>
    </div>
  );
}

function Members({ manage }: { manage: boolean }) {
  const source = useStore((s) => s.source);
  const studio = useStore((s) => s.studio);
  const me = useStore((s) => s.me)!;
  const [members, setMembers] = useState<Member[]>([]);
  const load = async () => { if (source) setMembers(await source.listStudioMembers()); };
  useEffect(() => { void load(); }, [source]);
  const setRole = async (m: Member, role: Role | "remove") => {
    if (!source) return;
    try {
      if (role === "remove") { await source.removeMember(m.person.id); toast(`${m.person.name} removed from ${studio?.name ?? "the studio"}.`, me.color); }
      else { await source.setMemberRole(m.person.id, role); toast(`${m.person.first} is now ${role === "artist" ? "an artist" : role === "artDirector" ? "an art director" : `a ${ROLE_WORD[role].toLowerCase()}`}.`, me.color); }
      await load(); await useStore.getState().refresh();
    } catch (err) { toast(err instanceof Error ? err.message : "That did not go through.", "var(--bad)"); await load(); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle line={manage ? "Producers do everything. Art directors review and invite artists and viewers. Artists save and publish. Viewers look and comment." : undefined}>Members</SectionTitle>
      {members.map((m) => (
        <div key={m.person.id} style={row}>
          <Avatar person={m.person} size={28} ring={false} opacity={m.journey === "invited" ? .45 : 1} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span style={{ color: "var(--ink)" }}>{m.person.name}</span>
            {m.journey === "invited" ? <span style={{ fontSize: 12, color: "var(--ink60)" }}>Not signed in yet</span> : null}
          </div>
          {m.journey === "invited" ? <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--r-6)", background: "var(--hover)", color: "var(--ink60)" }}>Invite sent</span> : null}
          {manage ? (
            <select aria-label={`Role of ${m.person.name}`} value={m.person.role} onChange={(e) => void setRole(m, e.target.value as Role | "remove")} style={{ ...field, height: 32, padding: "0 8px", fontSize: 13 }}>
              {(["artist", "artDirector", "producer", "viewer"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_WORD[r]}</option>)}
              <option value="remove">Remove</option>
            </select>
          ) : <span style={{ fontSize: 13, color: "var(--ink60)" }}>{ROLE_WORD[m.person.role]}</span>}
        </div>
      ))}
    </div>
  );
}

function ProjectSection() {
  const source = useStore((s) => s.source);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const refresh = useStore((s) => s.refresh);
  const me = useStore((s) => s.me)!;
  const canRename = useCan("renameProject");
  const canDelete = useCan("deleteProject");
  const [name, setName] = useState(project?.name ?? "");
  const [deleted, setDeleted] = useState<DeletedProject[]>([]);
  useEffect(() => { setName(project?.name ?? ""); }, [project?.id, project?.name]);
  useEffect(() => { if (source && canDelete) void source.listDeletedProjects().then(setDeleted); }, [source, canDelete, project?.id]);
  if (!project) return null;
  const rename = async () => { if (!source || !name.trim() || name.trim() === project.name) return; await source.renameProject(project.id, name); await refresh(); toast(`Renamed to ${name.trim()}.`, me.color); };
  const del = async () => { if (!source) return; await source.deleteProject(project.id); await refresh(); setDeleted(await source.listDeletedProjects()); toast(`${project.name} deleted. Restore it from Settings.`, me.color); };
  const restore = async (d: DeletedProject) => { if (!source) return; await source.restoreProject(d.id); await refresh(); setDeleted(await source.listDeletedProjects()); toast(`${d.name} is back.`, me.color); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle>Project</SectionTitle>
      {canRename ? <div style={row}><span style={{ width: 120, fontSize: 13, color: "var(--ink60)" }}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void rename(); }} aria-label="Project name" style={{ ...field, flex: 1 }} /><button type="button" onClick={() => void rename()} style={button}>Rename</button></div> : <div style={row}><span style={{ width: 120, fontSize: 13, color: "var(--ink60)" }}>Name</span><span style={{ color: "var(--ink)" }}>{project.name}</span></div>}
      {canDelete && !project.sample ? <div style={row}><span style={{ flex: 1, fontSize: 13, color: "var(--ink60)" }}>Delete keeps every version. The project leaves the sidebar; restore it here.</span><button type="button" onClick={() => void del()} style={{ ...button, color: "var(--bad)" }}>Delete {project.name}</button></div> : null}
      {canDelete ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>Deleted projects</span>
          {deleted.length === 0 ? <span style={{ fontSize: 13, color: "var(--ink40)" }}>Nothing deleted.</span> : deleted.map((d) => <div key={d.id} style={row}><span style={{ flex: 1, color: "var(--ink)" }}>{d.name}</span><span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>{d.deletedAt}</span><button type="button" onClick={() => void restore(d)} style={button}>Restore</button></div>)}
        </div>
      ) : null}
    </div>
  );
}

function Billing() {
  const studio = useStore((s) => s.studio);
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const [seats, setSeats] = useState(0);
  useEffect(() => { if (source) void source.listStudioMembers().then((m) => setSeats(m.filter((x) => x.person.role !== "viewer").length)); }, [source]);
  const training = studio?.training ?? true;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle>Billing</SectionTitle>
      <div style={row}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
          <span style={{ color: "var(--ink)" }}>{training ? "Nothing to pay." : `${seats} seats`}</span>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>{training ? `Training is on. ${studio?.name ?? "The studio"} helps train Nok with its projects. Names are never attached.` : `Billed per seat, ${seats} × $12 a month. Turn Training on to pay nothing.`}</span>
        </div>
        <button type="button" role="switch" aria-checked={training} aria-label="Training" onClick={() => { void source?.setTraining(!training).then(refresh); }} style={{ width: 32, height: 18, borderRadius: 9, border: 0, padding: 0, background: training ? "var(--amber)" : "var(--ink40)", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background var(--t-fast)" }}>
          <span aria-hidden="true" style={{ position: "absolute", top: 2, left: training ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "var(--on-color)", transition: "left var(--t-fast)" }} />
        </button>
      </div>
    </div>
  );
}
