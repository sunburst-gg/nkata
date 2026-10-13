// Create asset: a name, a template, and "All parts, or one?". One is the default for a prop
// (docs/decisions.md, 2026-10-10). The first save in Blender gives it a render and a mirror.
// "From files in the folder" makes one asset per .blend already there, so a team brings its
// existing work in without redoing it (docs/decisions.md, 2026-10-13).
import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { useProject } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { CONTROL, Field, Select } from "./Field";
import { reasonOf } from "@/lib/reason";

type Mode = "new" | "files";

/** The asset name a file gets: its stem, with what the server refuses turned into spaces. */
export function assetNameFor(file: string): string {
  const stem = (file.split("/").pop() ?? file).replace(/\.blend$/i, "");
  const clean = stem.replace(/[^A-Za-z0-9 _/-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[^A-Za-z0-9]+/, "");
  return clean || "Asset";
}

export function CreateAssetDialog() {
  const open = useStore((s) => s.createAssetOpen);
  const setOpen = useStore((s) => s.setCreateAsset);
  const templates = useStore((s) => s.db.templates);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const project = useProject();
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [parts, setParts] = useState<"all" | "one">("one");
  const [files, setFiles] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const usable = mode === "files" ? templates.filter((t) => t.kind !== "level_area") : templates;
  const chosen = usable.find((t) => t.name === template) ?? usable[0];
  useEffect(() => {
    if (!open) return;
    setMode("new"); setName(""); setParts("one"); setFiles(null); setPicked(new Set());
    setTemplate(templates.find((t) => t.name === "Environment prop")?.name ?? templates[0]?.name ?? "");
  }, [open, templates]);
  useEffect(() => { setParts(chosen?.name === "Environment prop" ? "one" : "all"); }, [chosen?.name]);
  useEffect(() => {
    if (!open || mode !== "files" || files !== null) return;
    source.freeBlendFiles().then(setFiles).catch((err: unknown) => { setFiles([]); toast(reasonOf(err, "Could not read the project folder."), "failed"); });
  }, [open, mode, files, source, toast]);
  const create = async () => {
    if (!project || !chosen) return;
    setBusy(true);
    try {
      if (mode === "new") {
        if (!name.trim()) return;
        await source.createAsset(project.slug, name.trim(), chosen.name, parts);
      } else {
        const list = (files ?? []).filter((f) => picked.has(f));
        if (list.length === 0) return;
        for (const file of list) await source.createAsset(project.slug, assetNameFor(file), chosen.name, "one", { file });
        toast(list.length === 1 ? `${assetNameFor(list[0]!)} added.` : `${list.length} assets added.`);
      }
      setOpen(false);
    } catch (err) {
      toast(reasonOf(err, "Could not create the asset."), "failed");
    } finally {
      setBusy(false);
    }
  };
  const onePart = chosen?.parts.find((p) => p.name === "model") ?? chosen?.parts[0];
  const toggle = (file: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(file)) next.delete(file); else next.add(file); return next; });
  const noTemplates = templates.length === 0;
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Create asset" width={480}>
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="New file, or from files in the folder?">
          {([["new", "New file", "Blender saves it where the part lives."], ["files", "From files in the folder", "One asset per .blend already there."]] as const).map(([v, label, line]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cn("flex cursor-pointer flex-col gap-1 rounded-[10px] border bg-panel p-3 text-left transition-colors duration-150 hover:bg-hover", mode === v ? "border-accent" : "border-border")}>
              <span className="text-14 font-medium text-heading">{label}</span>
              <span className="text-12 text-secondary">{line}</span>
            </button>
          ))}
        </div>
        {noTemplates ? <span className="text-13 text-secondary">This project has no templates yet. Add one under Settings, Templates.</span> : null}
        {mode === "new" ? <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Market stall" className={CONTROL} /></Field> : null}
        <Field label="Template"><Select value={chosen?.name ?? ""} onChange={(e) => setTemplate(e.target.value)}>{usable.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</Select></Field>
        {mode === "new" ? (
          <div className="flex flex-col gap-2">
            <span className="text-13 text-secondary">All parts, or one?</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="All parts, or one?">
              {([["one", `One part${onePart ? `: ${onePart.name}` : ""}`, "Start small. Add parts later."], ["all", `All ${chosen?.parts.length ?? 0} parts`, chosen?.parts.map((p) => p.name).join(" · ") ?? ""]] as const).map(([v, label, line]) => (
                <button key={v} type="button" role="radio" aria-checked={parts === v} onClick={() => setParts(v)} className={cn("flex cursor-pointer flex-col gap-1 rounded-[10px] border bg-panel p-3 text-left transition-colors duration-150 hover:bg-hover", parts === v ? "border-accent" : "border-border")}>
                  <span className="text-14 font-medium text-heading">{label}</span>
                  <span className="text-12 text-secondary">{line}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-13 text-secondary">{`Files${onePart ? `. Each becomes an asset with one part: ${onePart.name}.` : ""}`}</span>
            {files === null ? <span className="text-13 text-secondary">Looking in the project folder.</span>
              : files.length === 0 ? <span className="text-13 text-secondary">No new .blend files in the folder. Save one there, or make a new file.</span>
              : (
                <div className="flex max-h-[240px] flex-col gap-1 overflow-y-auto rounded-[10px] border border-border p-1">
                  {files.map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 hover:bg-hover">
                      <input type="checkbox" checked={picked.has(f)} onChange={() => toggle(f)} className="size-4 accent-accent" />
                      <span className="flex min-w-0 flex-col"><span className="truncate text-14 text-heading">{assetNameFor(f)}</span><span className="truncate text-12 text-secondary">{f}</span></span>
                    </label>
                  ))}
                </div>
              )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={noTemplates || (mode === "files" && picked.size === 0) || (mode === "new" && !name.trim())}>
            {mode === "new" ? "Create asset" : picked.size > 1 ? `Add ${picked.size} assets` : "Add asset"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
