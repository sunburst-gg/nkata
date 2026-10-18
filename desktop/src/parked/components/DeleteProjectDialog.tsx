// Delete project: the folder stays, Nkata forgets the project. The name must be typed first.
import { useState } from "react";
import { useStore } from "@/store";
import { useGo } from "@/lib/hooks";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { CONTROL } from "./Field";

export function DeleteProjectDialog() {
  const slug = useStore((s) => s.deleteProject);
  const setDeleteProject = useStore((s) => s.setDeleteProject);
  const projects = useStore((s) => s.db.session.studio.projects);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const go = useGo();
  const [typed, setTyped] = useState("");
  const project = projects.find((p) => p.slug === slug);
  const close = () => { setDeleteProject(null); setTyped(""); };
  const ok = !!project && typed === project.name;
  const remove = () => {
    if (!project || !ok) return;
    source.deleteProject(project.slug);
    close();
    toast("Project deleted", "muted");
    go.welcome();
  };
  return (
    <Dialog open={!!project} onOpenChange={(o) => { if (!o) close(); }} title={`Delete ${project?.name ?? ""}`} description="The folder on disk stays. Nkata forgets the project, its versions, and its comments. Type the project name to confirm.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); remove(); }}>
        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={project?.name} aria-label="Project name" className={CONTROL} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={!ok}>Delete project</Button>
        </div>
      </form>
    </Dialog>
  );
}
