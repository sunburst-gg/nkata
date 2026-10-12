// New project: name, folder with Choose, Blender and Unreal pre-filled from detection, Create project.
// In the desktop app the folder opens the native picker and the project is created on the server.
import { useState } from "react";
import { Navigate } from "react-router";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CONTROL, Field, Select } from "@/components/Field";
import { createServerProject } from "@/data/boot";
import { useGo } from "@/lib/hooks";
import { inTauri } from "@/lib/tauri";
import { Title } from "./Shell";
import { reasonOf } from "@/lib/reason";

const BLENDER_VERSIONS = ["5.0.4", "4.5 LTS"];
const UNREAL_VERSIONS = ["5.7.2", "5.6.1"];

export function NewProject() {
  const connections = useStore((s) => s.db.connections);
  const source = useStore((s) => s.source);
  const serverMode = useStore((s) => s.serverMode);
  const useSource = useStore((s) => s.useSource);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const go = useGo();
  const can = useCan();
  const foundBlender = connections.find((c) => c.id === "blender")?.version;
  const foundUnreal = connections.find((c) => c.id === "unreal")?.version;
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [blender, setBlender] = useState(foundBlender ?? BLENDER_VERSIONS[0]!);
  const [unreal, setUnreal] = useState(foundUnreal ?? UNREAL_VERSIONS[0]!);
  const [busy, setBusy] = useState(false);
  if (!can("createProject")) return <Navigate to="/welcome" replace />;
  const shownName = name.trim() || "NkataTest";
  const folderPath = folder || `~/Documents/Nkata/${shownName}`;
  const choose = async () => {
    if (!inTauri()) { toast("The folder picker opens in the desktop app.", "muted"); return; }
    // https://v2.tauri.app/plugin/dialog/
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, defaultPath: folder || undefined });
    if (typeof picked === "string") setFolder(picked);
  };
  const create = async () => {
    const input = { name: shownName, folder: folderPath, blender, unreal };
    setBusy(true);
    try {
      if (serverMode) {
        const next = await createServerProject(input, theme);
        useSource(next);
        go.project(next.snapshot().session.studio.projects[0]?.slug);
      } else {
        const made = await source.createProject(input);
        go.project(made.slug);
      }
      toast("Project created. Templates are in the folder.");
    } catch (err) {
      toast(reasonOf(err, "Could not create the project."), "failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mx-auto flex max-w-[560px] flex-col gap-7 pt-6" onSubmit={(e) => { e.preventDefault(); void create(); }}>
      <Title>New project</Title>
      <Field label="Project name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Rising Sun" aria-label="Project name" className={CONTROL} /></Field>
      <Field label="Folder">
        <span className={`${CONTROL} flex items-center gap-3 pr-1.5`}>
          <span className="flex-1 truncate font-mono text-13 text-body">{folderPath}</span>
          <Button size="sm" variant="outline" onClick={() => void choose()}>Choose</Button>
        </span>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Blender"><Select value={blender} onChange={(e) => setBlender(e.target.value)} aria-label="Blender">{foundBlender ? <option value={foundBlender}>{foundBlender} (found)</option> : null}{BLENDER_VERSIONS.filter((v) => v !== foundBlender).map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>
        <Field label="Unreal"><Select value={unreal} onChange={(e) => setUnreal(e.target.value)} aria-label="Unreal">{foundUnreal ? <option value={foundUnreal}>{foundUnreal} (found)</option> : null}{UNREAL_VERSIONS.filter((v) => v !== foundUnreal).map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>
      </div>
      <Button type="submit" size="lg" variant="primary" className="self-start" loading={busy}>Create project</Button>
    </form>
  );
}
