// Project settings, opened from the project title menu on the wall. General (name, color),
// Budgets (a triangle number per kind with a stepper and an optional max texture size; only
// can("setBudget") sees the section), Members of this project. Saving budgets re-runs the
// checks on every asset and the toast says how many are over now. Decisions 12 in PROMPTS.md.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { stripLabel } from "@/app/selectors";
import { useCan } from "@/auth/useCan";
import { ROLE_WORD } from "@/auth/permissions";
import { DEFAULT_BUDGETS, type Budgets } from "@/data/types";
import { Avatar } from "@/ui/people/Avatar";
import { button, field, primary, row, SectionTitle } from "@/ui/settings/SectionTitle";
import { Swatches } from "@/ui/stage/Swatches";
import { toast } from "@/ui/toast/toast";

const KINDS: { key: keyof Omit<Budgets, "maxTexture">; label: string; step: number }[] = [
  { key: "prop", label: "Props", step: 5_000 },
  { key: "vehicle", label: "Vehicles", step: 5_000 },
  { key: "character", label: "Characters", step: 5_000 },
  { key: "environment", label: "Environments", step: 100_000 },
];
const TEXTURES: (number | null)[] = [null, 1024, 2048, 4096, 8192];
const fmt = (n: number) => n.toLocaleString("en-US");
const label: React.CSSProperties = { width: 120, fontSize: 13, color: "var(--ink60)" };

export function ProjectSettingsScreen() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const canBudget = useCan("setBudget");
  if (!project) return null;
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{project.name}</h1>
      <General />
      {canBudget && !project.sample ? <BudgetsSection /> : null}
      <ProjectMembers />
    </div>
  );
}

function General() {
  const source = useStore((s) => s.source);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId))!;
  const refresh = useStore((s) => s.refresh);
  const me = useStore((s) => s.me)!;
  const canRename = useCan("renameProject");
  const [name, setName] = useState(project.name);
  useEffect(() => { setName(project.name); }, [project.id, project.name]);
  const rename = async () => { if (!source || !name.trim() || name.trim() === project.name) return; await source.renameProject(project.id, name); await refresh(); toast(`Renamed to ${name.trim()}.`, me.color); };
  const recolor = async (c: string) => { if (!source || c === project.color) return; await source.setProjectColor(project.id, c); await refresh(); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle>General</SectionTitle>
      <div style={row}><span style={label}>Name</span>{canRename ? <><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void rename(); }} aria-label="Project name" style={{ ...field, flex: 1 }} /><button type="button" onClick={() => void rename()} style={button}>Rename</button></> : <span style={{ color: "var(--ink)" }}>{project.name}</span>}</div>
      <div style={row}><span style={label}>Color</span>
        {canRename ? (
          <Swatches value={project.color} onPick={(c) => void recolor(c)} />
        ) : <span aria-label="Project color" style={{ width: 28, height: 28, borderRadius: "50%", background: project.color }} />}
      </div>
    </div>
  );
}

function BudgetsSection() {
  const source = useStore((s) => s.source);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId))!;
  const refresh = useStore((s) => s.refresh);
  const me = useStore((s) => s.me)!;
  const [draft, setDraft] = useState<Budgets>(DEFAULT_BUDGETS);
  const [saved, setSaved] = useState<Budgets>(DEFAULT_BUDGETS);
  useEffect(() => { if (source) void source.getBudgets(project.id).then((b) => { setDraft(b); setSaved(b); }); }, [source, project.id]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const bump = (key: keyof Omit<Budgets, "maxTexture">, by: number) => setDraft((d) => ({ ...d, [key]: Math.max(1_000, d[key] + by) }));
  const save = async () => {
    if (!source) return;
    const over = await source.setBudgets(project.id, draft);
    setSaved(draft);
    await refresh();
    toast(over > 0 ? `Budgets saved. ${over} ${over === 1 ? "asset is" : "assets are"} over now.` : "Budgets saved.", me.color);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle line="Triangles per model. The red check on a model uses the number for its kind.">Budgets</SectionTitle>
      {KINDS.map((k) => (
        <div key={k.key} style={row}>
          <span style={label}>{k.label}</span>
          <span aria-label={`${k.label} budget`} style={{ font: "400 15px var(--mono)", color: "var(--ink)", width: 110 }}>{fmt(draft[k.key])}</span>
          <div style={{ display: "inline-flex", gap: 4 }}>
            <button type="button" aria-label={`${k.label} down`} onClick={() => bump(k.key, -k.step)} style={{ ...button, width: 32, padding: 0 }}>−</button>
            <button type="button" aria-label={`${k.label} up`} onClick={() => bump(k.key, k.step)} style={{ ...button, width: 32, padding: 0 }}>+</button>
          </div>
        </div>
      ))}
      <div style={row}>
        <span style={label}>Max texture</span>
        <select aria-label="Max texture size" value={draft.maxTexture ?? ""} onChange={(e) => setDraft((d) => ({ ...d, maxTexture: e.target.value ? Number(e.target.value) : null }))} style={{ ...field, height: 32, padding: "0 8px", fontSize: 13 }}>
          {TEXTURES.map((t) => <option key={t ?? "none"} value={t ?? ""}>{t ? `${t} px` : "No limit"}</option>)}
        </select>
      </div>
      {dirty ? <button type="button" onClick={() => void save()} style={{ ...primary, alignSelf: "flex-start", height: 36, padding: "0 16px" }}>Save budgets</button> : null}
    </div>
  );
}

function ProjectMembers() {
  const members = useStore((s) => s.members);
  const journeys = useStore((s) => s.journeys);
  const me = useStore((s) => s.me)!;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle>Members of this project</SectionTitle>
      {members.map((m) => {
        const member = journeys[m.person.id] ? { ...m, journey: journeys[m.person.id]! } : m;
        return (
          <div key={m.person.id} style={row}>
            <Avatar person={m.person} size={28} ring={false} opacity={member.journey === "invited" ? .45 : 1} />
            <span style={{ flex: 1, color: "var(--ink)" }}>{m.person.name}</span>
            <span style={{ fontSize: 13, color: "var(--ink60)" }}>{ROLE_WORD[m.person.role]}</span>
            <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", width: 110, textAlign: "right" }}>{stripLabel(member, me)}</span>
          </div>
        );
      })}
    </div>
  );
}
