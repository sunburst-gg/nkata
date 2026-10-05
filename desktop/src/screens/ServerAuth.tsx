// Sign in against the server: email, the magic link, the project, and for an artist the folder.
// A dev server answers with the link, so the whole flow is three screens. Production servers
// send the link by email and the person pastes it here. docs/product.md, Surfaces, Setup.
import { useState } from "react";
import { t } from "@/copy/en";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Wordmark } from "@/components/Mark";
import { connect, createProject, DEFAULT_SERVER_URL, listProjects, primaryRoleOf, redeem, requestLink, tokenFromLink, writeSession } from "@/data/boot";
import { useGo } from "@/lib/hooks";
import { Centered, Title } from "./Shell";

function Big({ children, ...rest }: React.ComponentProps<typeof Button>) {
  return <Button {...rest} className="h-11 rounded-lg text-15">{children}</Button>;
}

type Step = { kind: "email" } | { kind: "link"; email: string } | { kind: "project"; token: string; roles: string[] } | { kind: "folder"; token: string; projectId: string; name: string } | { kind: "connecting" };

export function ServerSignIn() {
  const go = useGo();
  const useSource = useStore((s) => s.useSource);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const [serverUrl, setServerUrl] = useState(() => { try { return localStorage.getItem("nkata.server") ?? DEFAULT_SERVER_URL; } catch { return DEFAULT_SERVER_URL; } });
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [newName, setNewName] = useState("");
  const [folder, setFolder] = useState("");
  const [step, setStep] = useState<Step>({ kind: "email" });
  const fail = (err: unknown) => toast(err instanceof Error ? err.message : "Something went wrong.", "failed");

  const sendLink = async () => {
    try {
      try { localStorage.setItem("nkata.server", serverUrl); } catch { /* storage can be blocked */ }
      const devLink = await requestLink(serverUrl, email);
      if (devLink) await redeemLink(devLink);
      else setStep({ kind: "link", email });
    } catch (err) { fail(err); }
  };
  const redeemLink = async (value: string) => {
    try {
      const session = await redeem(serverUrl, tokenFromLink(value));
      const list = await listProjects(serverUrl, session.token);
      setProjects(list);
      setStep({ kind: "project", token: session.token, roles: session.roles });
    } catch (err) { fail(err); }
  };
  const pickProject = async (token: string, roles: string[], projectId: string, name: string) => {
    if (primaryRoleOf(roles) === "viewer") {
      await finish(token, projectId, null, "stream");
      return;
    }
    setFolder(`~/Projects/${name}`);
    setStep({ kind: "folder", token, projectId, name });
  };
  const create = async (token: string, roles: string[]) => {
    try {
      const made = await createProject(serverUrl, token, { name: newName.trim(), folder_name: newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"), blender_version: "4.2", ue_version: "5.4" });
      await pickProject(token, roles, made.id, newName.trim());
    } catch (err) { fail(err); }
  };
  const finish = async (token: string, projectId: string, folderPath: string | null, mode: "sync" | "stream") => {
    setStep({ kind: "connecting" });
    const session = { serverUrl, token, projectId, folder: folderPath, mode };
    try {
      const source = await connect(session, theme);
      writeSession(session);
      useSource(source);
      if (mode === "stream") go.to("/join/start");
      else go.project(source.snapshot().session.studio.projects[0]?.slug);
    } catch (err) { fail(err); setStep({ kind: "email" }); }
  };

  return (
    <Centered width={420}>
      <Wordmark />
      {step.kind === "email" ? (
        <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void sendLink(); }}>
          <Title>{t("auth.signin.title")}</Title>
          <div className="flex flex-col gap-3">
            <Input large type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" placeholder="you@studio.com" autoFocus />
            <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} aria-label="Server" placeholder="Server" />
          </div>
          <Big type="submit" variant="primary">{t("auth.link")}</Big>
        </form>
      ) : null}
      {step.kind === "link" ? (
        <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void redeemLink(link); }}>
          <Title>Check your email.</Title>
          <span className="text-body">A sign-in link went to {step.email}. Paste it here.</span>
          <Input large value={link} onChange={(e) => setLink(e.target.value)} aria-label="Sign-in link" placeholder="https://..." autoFocus />
          <Big type="submit" variant="primary">Continue</Big>
        </form>
      ) : null}
      {step.kind === "project" ? (
        <div className="flex flex-col gap-6">
          <Title>Pick a project.</Title>
          <div className="flex flex-col">
            {projects.map((p) => (
              <button type="button" key={p.id} onClick={() => void pickProject(step.token, step.roles, p.id, p.name)} className="flex h-13 items-center border-b border-border text-left text-16 text-heading hover:text-accent-text">{p.name}</button>
            ))}
            {projects.length === 0 ? <span className="text-secondary">No projects yet.</span> : null}
          </div>
          {step.roles.includes("producer") ? (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void create(step.token, step.roles); }}>
              <Input large value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New project name" placeholder="New project name" />
              <Big type="submit" disabled={!newName.trim()}>Create project</Big>
            </form>
          ) : null}
        </div>
      ) : null}
      {step.kind === "folder" ? (
        <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void finish(step.token, step.projectId, folder, "sync"); }}>
          <Title>{t("create.folder")}</Title>
          <Input large value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Project folder" autoFocus />
          <span className="text-secondary">{t("create.folder.note")}</span>
          <Big type="submit" variant="primary">Open {step.name}</Big>
        </form>
      ) : null}
      {step.kind === "connecting" ? <Title>{t("setup.title", { project: "the project" })}</Title> : null}
    </Centered>
  );
}
