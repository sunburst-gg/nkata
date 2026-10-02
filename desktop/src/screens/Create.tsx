// Create project: name, folder, tools, then setup progress, then invite. One action per screen.
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Check } from "lucide-react";
import { t } from "@/copy/en";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { useGo } from "@/lib/hooks";
import { Centered, Header, Title } from "./Shell";

const STEPS = [["Project folder", 0, 20, "~/Projects/Rising Sun"], ["Blender add-on", 20, 50, "4.2.3"], ["Unreal plugin", 50, 75, "5.4.4"], ["Mirror", 75, 100, "Blender to Unreal"]] as const;

function Big(props: React.ComponentProps<typeof Button>) {
  return <Button variant="primary" {...props} className={cn("h-11 self-start rounded-lg px-5 text-15", props.className)} />;
}

export function Create() {
  const { step: stepParam } = useParams();
  const step = Math.max(1, Math.min(5, Number(stepParam) || 1));
  const go = useGo();
  const studio = useStore((s) => s.db.session.studio);
  const project = studio.projects[0]!;
  const [name, setName] = useState(project.name);
  const [pct, setPct] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (step !== 4) return;
    setPct(0);
    const id = setInterval(() => setPct((p) => { const n = Math.min(100, p + 1.5); if (n >= 100) clearInterval(id); return n; }), 60);
    return () => clearInterval(id);
  }, [step]);

  const done = pct >= 100;
  const stepLabel = step <= 3 ? `${step} of 3` : step === 4 ? "Setting up" : "Invite";
  const note = done ? "Rising Sun is a folder at ~/Projects. Blender and Unreal open it." : pct < 20 ? "Creating the folder and the templates." : pct < 50 ? "Installing the Blender add-on. Blender restarts once." : pct < 75 ? "Installing the Unreal plugin." : "Starting the mirror. First save in Blender will show in Unreal in seconds.";

  return (
    <>
      <Header crumbs={[{ label: studio.name, onClick: go.home }, { label: "New project", current: true }]} middle={<span className="role-mono ml-auto text-muted">{stepLabel}</span>} />
      <Centered>
        {step === 1 ? (
          <form className="flex flex-col gap-8" onSubmit={(e) => { e.preventDefault(); go.create(2); }}>
            <Title>{t("create.name")}</Title>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Project name" className="h-13 border-b border-border bg-transparent text-24 text-heading outline-none" />
            <Big type="submit">Continue</Big>
          </form>
        ) : null}
        {step === 2 ? (
          <>
            <Title>{t("create.folder")}</Title>
            <div className="flex h-13 items-center gap-4 border-b border-border"><span className="flex-1 font-mono text-15 font-medium text-body">{project.folder}</span><button type="button" className="text-13 text-secondary hover:text-heading">Change</button></div>
            <span className="text-secondary">The project lives here as normal .blend, .uasset, and .md files. If Nkata goes away, the project stays.</span>
            <Big onClick={() => go.create(3)}>Continue</Big>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <Title>{t("create.tools")}</Title>
            <div className="flex flex-col">
              {[["Blender", project.blender], ["Unreal Engine", project.unreal]].map(([tool, v]) => (
                <div key={tool} className="flex h-13 items-center border-b border-border"><span className="flex-1">{tool}</span><span className="font-mono text-15 font-medium text-body">{v}</span><button type="button" className="ml-4 text-13 text-secondary hover:text-heading">Change</button></div>
              ))}
            </div>
            <span className="text-secondary">Everyone on the project runs the same versions. Nkata installs the add-on and the plugin for you.</span>
            <Big onClick={() => go.create(4)}>Create project</Big>
          </>
        ) : null}
        {step === 4 ? (
          <>
            <Title>{done ? t("setup.done") : t("setup.title", { project: name })}</Title>
            <div className="flex flex-col" aria-live="polite">
              {STEPS.map(([label, from, to, right]) => {
                const k = pct >= to ? "done" : pct >= from ? "now" : "wait";
                return (
                  <div key={label} className="flex h-13 items-center gap-4 border-b border-hairline">
                    <span className="flex w-5 items-center justify-center">{k === "done" ? <span className="flex text-state-approved"><Check size={14} strokeWidth={2.4} aria-hidden="true" /></span> : k === "now" ? <span className="nk-pulse size-2 rounded-full bg-accent" /> : <span className="size-2 rounded-full border-[1.5px] border-border" />}</span>
                    <span className={cn("flex-1", k === "wait" ? "text-muted" : "text-heading")}>{label}</span>
                    <span className="role-mono shrink-0 whitespace-nowrap text-muted">{right}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="h-0.75 overflow-hidden rounded-sm bg-active" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
              <span className="text-13 text-secondary">{note}</span>
            </div>
            <Big disabled={!done} onClick={() => go.create(5)}>Continue</Big>
          </>
        ) : null}
        {step === 5 ? (
          <>
            <Title>{t("invite.title")}</Title>
            <div className="flex h-13 items-center gap-4 border-b border-border"><span className="min-w-0 flex-1 truncate font-mono text-14 font-medium text-body">{project.inviteLink}</span><Button size="sm" className="h-8" onClick={() => { void navigator.clipboard?.writeText(project.inviteLink).catch(() => undefined); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button></div>
            <span className="text-secondary">Anyone with the link installs Nkata, signs in, and opens the project. Under five minutes. You can also post it to Discord.</span>
            <Big onClick={() => go.project()}>Open {name}</Big>
          </>
        ) : null}
      </Centered>
    </>
  );
}
