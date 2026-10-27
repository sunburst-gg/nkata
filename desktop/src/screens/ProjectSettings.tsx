// Project settings, opened from the project title menu on the wall. General (name, color),
// Budgets (a triangle number per kind with a stepper and an optional max texture size; only
// can("setBudget") sees the section), Members of this project. Saving budgets re-runs the
// checks on every asset and the toast says how many are over now. Decisions 12 in PROMPTS.md.
// Rules (v8 step 21): per kind of asset, how strict each check is and where the pivot belongs;
// only can("setRules") sees it. They live in the project's templates.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { stripLabel } from "@/app/selectors";
import { useCan } from "@/auth/useCan";
import { ROLE_WORD } from "@/auth/permissions";
import { DEFAULT_BUDGETS, type AssetKind, type Budgets, type Rule } from "@/data/types";
import { Avatar } from "@/ui/people/Avatar";
import { button, field, primary, row, SectionTitle } from "@/ui/settings/SectionTitle";
import { Swatches } from "@/ui/stage/Swatches";
import { toast } from "@/ui/toast/toast";
import { LiveDataSource } from "@/data/live/LiveDataSource";

const KINDS: { key: keyof Omit<Budgets, "maxTexture" | "nanite">; label: string; step: number }[] = [
  { key: "prop", label: "Props", step: 5_000 },
  { key: "vehicle", label: "Vehicles", step: 5_000 },
  { key: "character", label: "Characters", step: 5_000 },
  { key: "environment", label: "Environments", step: 100_000 },
];
const TEXTURES: (number | null)[] = [null, 1024, 2048, 4096, 8192];
// v8 step 18: Nanite above this many triangles when an environment imports into Unreal.
const NANITE: number[] = [100_000, 250_000, 500_000, 1_000_000];
const fmt = (n: number) => n.toLocaleString("en-US");
const label: React.CSSProperties = { width: 120, fontSize: 13, color: "var(--ink60)" };

const RULE_KINDS: { kind: AssetKind; label: string }[] = [{ kind: "object", label: "Objects" }, { kind: "environment", label: "Environments" }];
const RULE_NAMES: Record<Rule["key"], string> = { textures: "Texture names", scale: "Scale", uv: "UV sets", tris: "Triangle budget", pivot: "Pivot" };
const LEVELS: { level: Exclude<Rule["level"], "off">; word: string }[] = [{ level: "block", word: "Holds Publish" }, { level: "warn", word: "Shown" }, { level: "note", word: "Quiet note" }];
const PIVOTS: { value: "base" | "grid" | "off"; word: string }[] = [{ value: "base", word: "At the base" }, { value: "grid", word: "On a grid corner" }, { value: "off", word: "Not checked" }];
const GRIDS = [0.25, 0.5, 1, 2, 4];

export function ProjectSettingsScreen() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const canBudget = useCan("setBudget");
  const canRules = useCan("setRules");
  if (!project) return null;
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{project.name}</h1>
      <General />
      {canBudget && !project.sample ? <BudgetsSection /> : null}
      {canRules && !project.sample ? <RulesSection /> : null}
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
  const bump = (key: keyof Omit<Budgets, "maxTexture" | "nanite">, by: number) => setDraft((d) => ({ ...d, [key]: Math.max(1_000, d[key] + by) }));
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
      {source instanceof LiveDataSource && source.unrealEnabled() ? (
        <div style={row}>
          <span style={label}>Nanite above</span>
          <select aria-label="Nanite triangle threshold" value={draft.nanite ?? 500_000} onChange={(e) => setDraft((d) => ({ ...d, nanite: Number(e.target.value) }))} style={{ ...field, height: 32, padding: "0 8px", fontSize: 13 }}>
            {NANITE.map((n) => <option key={n} value={n}>{fmt(n)} triangles</option>)}
          </select>
        </div>
      ) : null}
      {dirty ? <button type="button" onClick={() => void save()} style={{ ...primary, alignSelf: "flex-start", height: 36, padding: "0 16px" }}>Save budgets</button> : null}
    </div>
  );
}

function RulesSection() {
  const source = useStore((s) => s.source);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId))!;
  const me = useStore((s) => s.me)!;
  const [saved, setSaved] = useState<Partial<Record<AssetKind, Rule[]>>>({});
  const [draft, setDraft] = useState<Partial<Record<AssetKind, Rule[]>>>({});
  useEffect(() => { if (source) void source.getRules(project.id).then((r) => { setSaved(r); setDraft(r); }); }, [source, project.id]);
  const change = (kind: AssetKind, key: Rule["key"], to: Partial<Rule>) =>
    setDraft((d) => ({ ...d, [kind]: d[kind]?.map((r) => (r.key === key ? { ...r, ...to } : r)) }));
  const save = async () => {
    if (!source) return;
    try {
      for (const { kind } of RULE_KINDS) {
        const rules = draft[kind];
        if (rules && JSON.stringify(rules) !== JSON.stringify(saved[kind])) await source.setRules(project.id, kind, rules);
      }
      setSaved(draft);
      toast("Rules saved. The next save of each asset runs them.", me.color);
    } catch (err) { toast(err instanceof Error ? err.message : "The rules did not save.", "var(--bad)"); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const select: React.CSSProperties = { ...field, height: 32, padding: "0 8px", fontSize: 13 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionTitle line="How strict each check is. Only Holds Publish keeps a model out of the game; a lead can accept one model with a reason.">Rules</SectionTitle>
      {RULE_KINDS.filter(({ kind }) => draft[kind]).map(({ kind, label: kindLabel }) => (
        <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--ink)" }}>{kindLabel}</span>
          {draft[kind]!.map((r) => (
            <div key={r.key} style={row}>
              <span style={label}>{RULE_NAMES[r.key]}</span>
              {r.key === "pivot" ? (
                <select aria-label={`${kindLabel} pivot`} value={r.level === "off" || r.pivot === "authored" ? "off" : r.pivot ?? "base"} onChange={(e) => {
                  const v = e.target.value as "base" | "grid" | "off";
                  change(kind, "pivot", v === "off" ? { level: "off" } : { pivot: v, level: r.level === "off" ? "note" : r.level, ...(v === "grid" ? { gridM: r.gridM ?? 1 } : {}) });
                }} style={select}>
                  {PIVOTS.map((p) => <option key={p.value} value={p.value}>{p.word}</option>)}
                </select>
              ) : null}
              {r.key === "pivot" && r.level !== "off" && r.pivot === "grid" ? (
                <select aria-label={`${kindLabel} grid size`} value={r.gridM ?? 1} onChange={(e) => change(kind, "pivot", { gridM: Number(e.target.value) })} style={select}>
                  {GRIDS.map((g) => <option key={g} value={g}>{g} m grid</option>)}
                </select>
              ) : null}
              {r.level !== "off" && !(r.key === "pivot" && r.pivot === "authored") ? (
                <select aria-label={`${kindLabel} ${RULE_NAMES[r.key]} level`} value={r.level} onChange={(e) => change(kind, r.key, { level: e.target.value as Rule["level"] })} style={select}>
                  {LEVELS.map((l) => <option key={l.level} value={l.level}>{l.word}</option>)}
                </select>
              ) : null}
            </div>
          ))}
        </div>
      ))}
      {dirty ? <button type="button" onClick={() => void save()} style={{ ...primary, alignSelf: "flex-start", height: 36, padding: "0 16px" }}>Save rules</button> : null}
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
