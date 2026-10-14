// The v3 sidebar: studio menu, Get started, New project, Mentions, the
// projects list, and at the bottom Invite members, Connections, Billing. 260 wide, hairline right.
import { AtSign, ChevronDown, Plus, Sparkles } from "lucide-react";
import { useLocation } from "react-router";
import { useState, type ReactNode } from "react";
import { useCan, useStore } from "@/store";
import { cn } from "@/lib/cn";
import { useGo, useProject } from "@/lib/hooks";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "./Menu";
import { StudioSwitcher } from "./StudioSwitcher";

function NavRow({ active, onClick, children, className }: { active?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn("flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2.5 text-left text-14 text-heading transition-colors duration-150 outline-none hover:bg-hover focus-visible:shadow-focus", active ? "bg-active" : "bg-transparent", className)}>
      {children}
    </button>
  );
}

export function Sidebar() {
  const studio = useStore((s) => s.db.session.studio);
  const mentions = useStore((s) => s.db.mentions);
  const setMembers = useStore((s) => s.setMembers);
  const signOut = useStore((s) => s.signOut);
  const can = useCan();
  const [switching, setSwitching] = useState(false);
  const go = useGo();
  const role = useStore((s) => s.role);
  // Where a project opens from the sidebar: leads land on the board, artists on it with Waiting
  // on me on, viewers on the asset list (docs/tasks/07-blender-first.md, slice 8).
  const land = (slug: string) => { if (role === "viewer") go.project(slug); else go.board(slug, role === "artist"); };
  const current = useProject();
  const { pathname } = useLocation();
  const onProject = pathname.startsWith("/p/");

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-1 border-r border-hairline px-4 py-5">
      <div className="mb-4">
        <MenuRoot>
          <MenuTrigger asChild>
            <button type="button" aria-label={`${studio.name} menu`} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:shadow-focus data-[state=open]:bg-hover">
              <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--avatar-9)] text-12 font-semibold text-[var(--avatar-fg)]">{studio.initial}</span>
              <span className="truncate text-14 font-medium text-heading">{studio.name}</span>
              <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-muted" />
            </button>
          </MenuTrigger>
          <MenuContent width={240}>
            <MenuItem onSelect={() => go.settings("account")}>Settings</MenuItem>
            {can("manageMembers") ? <MenuItem onSelect={() => setMembers(true)}>Invite and manage members</MenuItem> : null}
            <MenuItem onSelect={() => setSwitching(true)}>Switch studio</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => { signOut(); go.signin(); }}>Log out</MenuItem>
          </MenuContent>
        </MenuRoot>
        <StudioSwitcher open={switching} onOpenChange={setSwitching} />
      </div>
      <NavRow active={pathname === "/welcome"} onClick={go.welcome}><Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />Get started</NavRow>
      {can("createProject") ? <NavRow active={pathname === "/new"} onClick={go.newProject}><Plus size={16} strokeWidth={1.5} aria-hidden="true" />New project</NavRow> : null}
      <NavRow active={pathname === "/mentions"} onClick={go.mentions}>
        <AtSign size={16} strokeWidth={1.5} aria-hidden="true" />Mentions
        {mentions.length > 0 ? <span className="role-mono ml-auto text-secondary">{mentions.length}</span> : null}
      </NavRow>
      <div className="mt-6 flex items-center gap-1.5 px-2.5 text-13 text-secondary">Projects<ChevronDown size={10} strokeWidth={1.5} aria-hidden="true" /></div>
      {studio.projects.length === 0 ? <span className="px-2.5 py-1.5 text-13 text-muted">No projects yet.</span> : null}
      {studio.projects.map((p) => (
        <NavRow key={p.id} active={onProject && current?.slug === p.slug} onClick={() => land(p.slug)} className="h-8.5">
          <span aria-hidden="true" className="size-4 shrink-0 rounded-sm" style={{ background: `var(--avatar-${p.tone})` }} />
          <span className="truncate">{p.name}</span>
        </NavRow>
      ))}
      <div className="mt-auto flex flex-col gap-0.5">
        {can("invite") ? <NavRow onClick={() => setMembers(true)} className="h-8.5">Invite members</NavRow> : null}
        <NavRow active={pathname === "/connections"} onClick={go.connections} className="h-8.5">Connections</NavRow>
        {can("viewBilling") ? <NavRow onClick={() => go.settings("billing")} className="h-8.5">Billing</NavRow> : null}
      </div>
    </aside>
  );
}
