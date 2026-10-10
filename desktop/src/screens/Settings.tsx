// Settings. Its own shell: Back to app, then Personal (Account), Studio (General, Members, Billing,
// Training), Tools (Connections, MCP soon, Agents soon). Only producers change training; every
// change is logged.
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Navigate, useParams } from "react-router";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CONTROL, Field } from "@/components/Field";
import { MembersPanel } from "@/components/MembersModal";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import type { Training } from "@/data/types";
import { cn } from "@/lib/cn";
import { useGo, type SettingsTab } from "@/lib/hooks";
import { ConnectionGrid } from "./Connections";
import { TrainingCard } from "./CreateStudio";
import { Title, useAppKeys } from "./Shell";

const LINES: Record<SettingsTab, string> = {
  account: "Your name and email. One account, many studios.",
  general: "The studio name and how Nkata looks.",
  members: "Who can open this studio's projects.",
  billing: "Nkata is free while training is on. Turn it off and your studio is billed per seat.",
  training: "Training on means your team's process teaches Nok, and Nkata costs nothing. Training off means you pay, and nothing leaves your studio.",
  connections: "Nkata connects to the tools on this computer. More tools arrive over time.",
  mcp: "Connect agents to this studio.",
  agents: "Agents that work inside your projects.",
};
const TITLES: Record<SettingsTab, string> = { account: "Account", general: "General", members: "Members", billing: "Billing", training: "Training", connections: "Connections", mcp: "MCP", agents: "Agents" };

export function Settings() {
  useAppKeys();
  const { tab: raw } = useParams();
  const can = useCan();
  const go = useGo();
  const projects = useStore((s) => s.db.session.studio.projects);
  const groups: { group: string; items: SettingsTab[] }[] = [
    { group: "Personal", items: ["account"] },
    { group: "Studio", items: (["general", "members", "billing", "training"] as SettingsTab[]).filter((t) => (t === "billing" ? can("viewBilling") : t === "training" ? can("setTraining") : t === "members" ? can("viewPeople") : true)) },
    { group: "Tools", items: ["connections", "mcp", "agents"] },
  ];
  const allowed = groups.flatMap((g) => g.items);
  const tab = (raw ?? "account") as SettingsTab;
  if (!allowed.includes(tab)) return <Navigate to="/settings/account" replace />;
  return (
    <div className="flex h-full min-w-[1280px]">
      <aside className="flex w-[260px] shrink-0 flex-col gap-0.5 border-r border-hairline px-4 py-5">
        <button type="button" onClick={() => (projects[0] ? go.project(projects[0].slug) : go.welcome())} className="mb-5 flex h-9 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-14 text-heading hover:bg-hover"><ChevronLeft size={12} strokeWidth={1.5} aria-hidden="true" />Back to app</button>
        {groups.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1.5 pt-3 text-13 text-secondary">{g.group}</span>
            {g.items.map((t) => (
              <button key={t} type="button" aria-current={tab === t ? "page" : undefined} onClick={() => go.settings(t)} className={cn("flex h-8.5 cursor-pointer items-center gap-2 rounded-lg border-0 px-2.5 text-left text-14 text-heading hover:bg-hover", tab === t ? "bg-active" : "bg-transparent")}>
                {TITLES[t]}{t === "mcp" || t === "agents" ? <span className="ml-auto rounded-[5px] bg-raised px-1.5 text-12 text-secondary">Soon</span> : null}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <main className="min-w-0 flex-1 overflow-auto px-8 py-14">
        <div className="mx-auto flex max-w-[640px] flex-col gap-8">
          <div className="flex flex-col gap-2"><Title>{TITLES[tab]}</Title><span className="text-secondary">{LINES[tab]}</span></div>
          {tab === "account" ? <Account /> : null}
          {tab === "general" ? <General /> : null}
          {tab === "members" ? <MembersPanel compact /> : null}
          {tab === "billing" ? <Billing /> : null}
          {tab === "training" ? <TrainingTab /> : null}
          {tab === "connections" ? <ConnectionGrid /> : null}
          {tab === "mcp" || tab === "agents" ? <div className="rounded-xl border border-dashed border-border p-12 text-center text-secondary">Soon.</div> : null}
        </div>
      </main>
    </div>
  );
}

function Account() {
  const me = useStore((s) => s.db.session.user);
  const source = useStore((s) => s.source);
  const signOut = useStore((s) => s.signOut);
  const toast = useStore((s) => s.toast);
  const go = useGo();
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  useEffect(() => { setName(me.name); setEmail(me.email); }, [me.name, me.email]);
  const save = () => { if (name.trim() && email.trim()) source.setMe(name.trim(), email.trim()); };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4"><PresenceAvatar initial={me.initial} tone={me.tone} size={56} /><button type="button" onClick={() => toast("Photos arrive with the next release.", "muted")} className="cursor-pointer border-0 bg-transparent p-0 text-13 text-secondary underline underline-offset-[3px] hover:text-heading">Change photo</button></div>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} aria-label="Name" className={CONTROL} /></Field>
      <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={save} aria-label="Email" className={CONTROL} /></Field>
      <button type="button" onClick={() => { signOut(); go.signin(); }} className="cursor-pointer self-start border-0 bg-transparent p-0 text-14 text-state-failed hover:underline">Log out</button>
    </div>
  );
}

function General() {
  const studio = useStore((s) => s.db.session.studio);
  const source = useStore((s) => s.source);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const can = useCan();
  const [name, setName] = useState(studio.name);
  useEffect(() => setName(studio.name), [studio.name]);
  return (
    <div className="flex flex-col gap-5">
      {can("setTraining") ? <Field label="Studio name"><input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name.trim() !== studio.name) source.setStudioName(name.trim()); }} aria-label="Studio name" className={CONTROL} /></Field> : null}
      <div className="flex flex-col gap-2">
        <span className="text-13 text-secondary">Appearance</span>
        <div className="flex gap-2">
          <Button aria-pressed={theme === "light"} className={cn(theme === "light" && "border-accent")} onClick={() => setTheme("light")}>Light</Button>
          <Button aria-pressed={theme === "dark"} className={cn(theme === "dark" && "border-accent")} onClick={() => setTheme("dark")}>Dark</Button>
        </div>
      </div>
    </div>
  );
}

function Billing() {
  const studio = useStore((s) => s.db.session.studio);
  const go = useGo();
  const on = studio.training === "on";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 rounded-xl border border-hairline bg-panel p-4">
        <div className="flex flex-1 flex-col gap-0.5"><span className="font-medium text-heading">{studio.billing.line}</span><span className="text-13 text-secondary">{on ? "Training is on. Your team's process pays for Nkata." : "Training is off. Your first invoice arrives on 1 Nov 2026."}</span></div>
        <button type="button" onClick={() => go.settings("training")} className="cursor-pointer border-0 bg-transparent p-0 text-13 text-secondary underline underline-offset-[3px] hover:text-heading">Change in Training</button>
      </div>
      <div className="grid gap-x-6 gap-y-3 text-14 leading-[1.5]" style={{ gridTemplateColumns: "140px 1fr" }}>
        <span className="text-secondary">Seats</span><span className="text-heading">{studio.billing.seats} people in {studio.name}</span>
        <span className="text-secondary">Payment method</span><span className="text-heading">{on ? "Not needed while training is on." : "Add a card before 1 Nov 2026."}</span>
        <span className="text-secondary">Invoices</span><span className="text-heading">None yet.</span>
      </div>
    </div>
  );
}

function TrainingTab() {
  const studio = useStore((s) => s.db.session.studio);
  const log = useStore((s) => s.db.trainingLog);
  const me = useStore((s) => s.db.session.user);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const can = useCan();
  const change = async (t: Training) => {
    try {
      await source.setTraining(t);
      toast(t === "on" ? "Training on. Nothing to pay." : "Training off. Billing starts 1 Nov.");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not change training.", "failed"); }
  };
  const last = log[0];
  return (
    <div className="flex flex-col gap-6">
      <TrainingCard training={studio.training} onChange={can("setTraining") ? (t) => void change(t) : undefined} changedLine={`Changed by ${last ? last.text.split(" ").slice(-2).join(" ") : me.name} · ${last?.when ?? "10 Oct 2026"}`} />
      <span className="text-13 text-secondary">Only producers can change this. Every change is logged.</span>
      <div className="flex flex-col">
        <span className="pb-2 text-13 text-secondary">History</span>
        {log.length === 0 ? <span className="text-13 text-muted">No changes yet.</span> : null}
        {log.map((h, i) => <div key={i} className="flex gap-3 border-b border-hairline py-2.5 text-13"><span className="w-24 shrink-0 font-mono text-muted">{h.when}</span><span className="text-heading">{h.text}</span></div>)}
      </div>
    </div>
  );
}
