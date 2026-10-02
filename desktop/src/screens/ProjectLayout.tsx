// Project shell: breadcrumb with the project menu, the status line that opens the activity rail,
// the avatar, and the invite sheet. Routes inside a project render in the outlet.
import { Navigate, Outlet, useLocation, useParams } from "react-router";
import { t } from "@/copy/en";
import { useCan, useStore } from "@/store";
import { ActivityRail } from "@/components/ActivityRail";
import type { Crumb } from "@/components/Breadcrumb";
import { InviteSheet } from "@/components/InviteSheet";
import { ProjectMenu } from "@/components/ProjectMenu";
import { cn } from "@/lib/cn";
import { useAsset, useGo, usePeople, useProject } from "@/lib/hooks";
import { StudioCrumb } from "./Home";
import { Header } from "./Shell";

const SUB: Record<string, string> = { changes: "What changed", people: "People", templates: "Templates", settings: "Settings" };

export function ProjectLayout() {
  const project = useProject();
  const asset = useAsset();
  const { part } = useParams();
  const { pathname } = useLocation();
  const db = useStore((s) => s.db);
  const can = useCan();
  const railOpen = useStore((s) => s.railOpen);
  const setRail = useStore((s) => s.setRail);
  const setReview = useStore((s) => s.setReview);
  const inviteOpen = useStore((s) => s.inviteOpen);
  const setInvite = useStore((s) => s.setInvite);
  const toast = useStore((s) => s.toast);
  const { people } = usePeople();
  const go = useGo();
  const viewer = db.session.user.role === "viewer";
  const sub = pathname.split("/")[3];
  const subTitle = sub && !asset ? SUB[sub] : undefined;
  // Templates and Settings are not for a viewer. The URL does not open them either.
  if ((sub === "templates" && !can("viewTemplates")) || (sub === "settings" && !can("viewSettings"))) return <Navigate to={`/p/${project.slug}`} replace />;
  // Ready parts across the project: each one is a review waiting to happen.
  const readyCount = db.assets.reduce((n, a) => n + a.parts.filter((p) => p.state === "ready").length, 0);
  const onProjectScreen = !asset && !subTitle;

  const crumbs: Crumb[] = [
    { label: db.session.studio.name, render: (cls) => <StudioCrumb className={cls} /> },
    { label: project.name, current: onProjectScreen, render: (cls) => <ProjectMenu name={project.name} className={cls} peopleCount={db.session.studio.peopleCount} templateCount={db.templates.length} showTemplates={can("viewTemplates")} showSettings={can("viewSettings")} onPeople={() => go.people(project.slug)} onTemplates={() => go.templates(project.slug)} onSettings={() => go.settings(project.slug)} onChanges={() => go.changes(project.slug)} onAllProjects={go.home} /> },
  ];
  if (asset) crumbs.push({ label: asset.name, current: !part, onClick: part ? () => go.asset(asset.slug, project.slug) : undefined });
  if (asset && part) crumbs.push({ label: part, current: true });
  if (subTitle) crumbs.push({ label: subTitle, current: true });

  const status = viewer ? t("viewer.status", { n: db.changedThisWeek }) : t("project.status", { n: [db.online, db.changedToday, readyCount] });
  const online = people.filter((p) => p.presence === "online" && p.role !== "viewer");

  return (
    <>
      <Header
        crumbs={crumbs}
        right={
          <button type="button" aria-pressed={railOpen} aria-controls="activity" onClick={() => setRail(!railOpen)} className={cn("inline-flex h-8 items-center gap-2.5 rounded-md px-2.5 text-14 transition-colors duration-150 outline-none focus-visible:shadow-focus", railOpen ? "bg-active text-heading" : "text-secondary hover:text-heading")}>
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />{status}
          </button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto px-8 pb-16 pt-6"><Outlet /></main>
        {railOpen ? (
          <div id="activity" className="flex">
            <ActivityRail feed={db.activity} people={people} online={online} readyCount={readyCount} showReview={can("review")} onReview={() => { setReview(true); go.project(project.slug); }} onClose={() => setRail(false)} onOpen={(f) => { if (!f.assetSlug) return; if (f.partName) go.part(f.assetSlug, f.partName, project.slug); else go.asset(f.assetSlug, project.slug); }} />
          </div>
        ) : null}
      </div>
      {can("invite") ? (
        <InviteSheet open={inviteOpen} onOpenChange={setInvite} projectName={project.name} inviteLink={project.inviteLink} defaultEmail="funmi@lagosinteractive.com" onSend={(email, role) => { db.session && useStore.getState().source.invite(email, role); setInvite(false); toast(`Invite sent to ${email} as ${role === "viewer" ? "a Viewer" : "a " + role.replace("_", " ")}.`, "approved"); }} />
      ) : null}
    </>
  );
}
