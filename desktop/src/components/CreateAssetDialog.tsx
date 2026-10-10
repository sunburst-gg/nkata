// Create asset: a name, a template, and "All parts, or one?". One is the default for a prop
// (docs/decisions.md, 2026-10-10). The first save in Blender gives it a render and a mirror.
import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { useProject } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { CONTROL, Field, Select } from "./Field";

export function CreateAssetDialog() {
  const open = useStore((s) => s.createAssetOpen);
  const setOpen = useStore((s) => s.setCreateAsset);
  const templates = useStore((s) => s.db.templates);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const project = useProject();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [parts, setParts] = useState<"all" | "one">("one");
  const [busy, setBusy] = useState(false);
  const chosen = templates.find((t) => t.name === template) ?? templates[0];
  useEffect(() => { if (open) { setName(""); setTemplate(templates.find((t) => t.name === "Environment prop")?.name ?? templates[0]?.name ?? ""); setParts("one"); } }, [open, templates]);
  useEffect(() => { setParts(chosen?.name === "Environment prop" ? "one" : "all"); }, [chosen?.name]);
  const create = async () => {
    if (!project || !chosen || !name.trim()) return;
    setBusy(true);
    try {
      await source.createAsset(project.slug, name.trim(), chosen.name, parts);
      setOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create the asset.", "failed");
    } finally {
      setBusy(false);
    }
  };
  const onePart = chosen?.parts.find((p) => p.name === "model") ?? chosen?.parts[0];
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Create asset" width={480}>
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Market stall" className={CONTROL} /></Field>
        <Field label="Template"><Select value={chosen?.name ?? ""} onChange={(e) => setTemplate(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</Select></Field>
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
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Create asset</Button></div>
      </form>
    </Dialog>
  );
}
