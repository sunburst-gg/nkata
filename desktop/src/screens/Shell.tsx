// The app shell: the sidebar, a 56 px header with the breadcrumb, the status line and the avatar,
// the page, the activity rail, and the overlays (members, delete, ask, full screen, create asset).
import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation, useParams } from "react-router";
import { useCan, useStore } from "@/store";
import { ActivityRail } from "@/components/ActivityRail";
import { Breadcrumb, type Crumb } from "@/components/Breadcrumb";
import { Mark } from "@/components/Mark";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { Sidebar } from "@/components/Sidebar";
import { AskOverlay } from "@/components/AskOverlay";
import { CreateAssetDialog } from "@/components/CreateAssetDialog";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { FullScreenViewer } from "@/components/FullScreenViewer";
import { MembersModal } from "@/components/MembersModal";
import { cn } from "@/lib/cn";
import { useAsset, useGo, usePeople, useProject } from "@/lib/hooks";

const TOP: Record<string, string> = { "/welcome": "Get started", "/new": "New project", "/connections": "Connections", "/mentions": "Mentions" };

/** Cmd K opens Ask anywhere in the app. Esc closes whatever is open. */
export function useAppKeys() {
  const setAsk = useStore((s) => s.setAsk);
  const closeAll = useStore((s) => s.closeAll);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAsk(true); }
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAsk, closeAll]);
}

export function AppShell() {
  useAppKeys();
  const db = useStore((s) => s.db);
  const can = useCan();
  const railOpen = useStore((s) => s.railOpen);
  const setRail = useStore((s) => s.setRail);
  const setTab = useStore((s) => s.setTab);
  const project = useProject();
  const asset = useAsset();
  const { part } = useParams();
  const { pathname } = useLocation();
  const { by, people } = usePeople();
  const go = useGo();
  const me = db.session.user;
  const viewer = me.role === "viewer";

  const crumbs: Crumb[] = [];
  if (pathname.startsWith("/p/") && project) {
    crumbs.push({ label: "Projects", onClick: go.welcome });
    crumbs.push({ label: project.name, current: !asset, onClick: asset ? () => go.project(project.slug) : undefined });
    if (asset) crumbs.push({ label: asset.name, current: !part, onClick: part ? () => go.asset(asset.slug, project.slug) : undefined });
    if (asset && part) crumbs.push({ label: part, current: true });
  } else {
    crumbs.push({ label: TOP[pathname] ?? "Projects", current: true });
  }

  const projectAssets = project ? db.assets.filter((a) => a.projectSlug === project.slug) : [];
  const onProject = pathname.startsWith("/p/") && !asset;
  // The status line and the rail belong to a project with more than a first asset in it.
  const showStatus = onProject && projectAssets.length > 1;
  const readyCount = projectAssets.filter((a) => a.state === "ready").length;
  const othersOnline = people.filter((p) => p.presence === "online" && p.role !== "viewer" && p.id !== me.id).length;
  const status = viewer ? `${db.changedThisWeek} changed this week` : `${othersOnline} online · ${db.changedToday} changed today · ${readyCount} ready for review`;

  return (
    <div className="flex h-full min-w-[1280px]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline px-8">
          <Breadcrumb items={crumbs} />
          <span className="flex-1" />
          {showStatus ? (
            <button type="button" aria-pressed={railOpen} aria-controls="activity" onClick={() => setRail(!railOpen)} className={cn("inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent text-13 transition-colors duration-150 outline-none focus-visible:shadow-focus", railOpen ? "text-heading" : "text-secondary hover:text-heading")}>
              <span aria-hidden="true" className="size-[7px] rounded-full bg-state-approved" />{status}
            </button>
          ) : null}
          {viewer ? <span className="rounded-md border border-border px-2 text-12 leading-[18px] text-secondary">Viewer</span> : null}
          <PresenceAvatar initial={me.initial} tone={me.tone} name={me.name} size={28} />
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto p-8"><Outlet /></div>
          {railOpen && showStatus && project ? (
            <ActivityRail feed={db.activity} by={by} readyCount={readyCount} showReview={can("review")} onReview={() => { setTab("Ready"); go.project(project.slug); }} onClose={() => setRail(false)} />
          ) : null}
        </div>
      </main>
      <MembersModal />
      <DeleteProjectDialog />
      <CreateAssetDialog />
      <AskOverlay />
      <FullScreenViewer />
    </div>
  );
}

/** The setup screens outside the shell: the wordmark top left and "Not {email}? Log out" top right. */
export function SetupFrame({ children, width = 360 }: { children: ReactNode; width?: number }) {
  const me = useStore((s) => s.db.session.user);
  const signOut = useStore((s) => s.signOut);
  const go = useGo();
  return (
    <div className="flex h-full flex-1 flex-col px-8 py-7">
      <div className="flex items-center gap-2.5">
        <Mark size={22} />
        <span className="font-semibold tracking-[-0.01em] text-heading">nkata</span>
        <button type="button" onClick={() => { signOut(); go.signin(); }} className="ml-auto cursor-pointer border-0 bg-transparent text-13 text-secondary hover:text-heading">Not {me.email}? Log out</button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col" style={{ width }}>{children}</div>
      </div>
    </div>
  );
}

/** Serif screen title, 32. */
export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("role-moment m-0 text-heading", className)}>{children}</h1>;
}
