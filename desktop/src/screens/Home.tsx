// Home. The studio's projects as large thumbnails with the faces of the people in them.
import { ChevronDown, Plus } from "lucide-react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/Menu";
import { AvatarStack } from "@/components/PresenceAvatar";
import { renderStyle } from "@/lib/renders";
import { useGo, usePeople } from "@/lib/hooks";
import { t } from "@/copy/en";
import { Header } from "./Shell";

export function StudioCrumb({ className }: { className: string }) {
  const studio = useStore((s) => s.db.session.studio);
  const can = useCan();
  const go = useGo();
  return (
    <MenuRoot>
      <MenuTrigger className={className} aria-label="Studio menu">{studio.name}<ChevronDown size={10} strokeWidth={2} aria-hidden="true" /></MenuTrigger>
      <MenuContent width={260}>
        <MenuItem selected trailing={studio.peopleCount} className="h-10"><span className="flex size-5.5 items-center justify-center rounded-sm bg-accent text-11 font-semibold text-accent-fg">{studio.initial}</span>{studio.name}</MenuItem>
        <MenuItem trailing={1} className="h-10"><span className="flex size-5.5 items-center justify-center rounded-sm text-11 font-semibold text-[var(--avatar-fg)]" style={{ background: "var(--avatar-1)" }}>A</span>Ada's studio</MenuItem>
        {can("createStudio") ? <><MenuSeparator /><MenuItem onSelect={() => go.to("/new-studio")} className="h-10"><span className="flex w-5.5 items-center justify-center text-[18px] text-secondary">+</span>Create a studio</MenuItem></> : null}
      </MenuContent>
    </MenuRoot>
  );
}

export function Home() {
  const studio = useStore((s) => s.db.session.studio);
  const can = useCan();
  const { by } = usePeople();
  const go = useGo();
  const card = "flex flex-col gap-5 rounded-xl border border-hairline bg-panel p-5 text-left transition-colors duration-150 hover:bg-raised outline-none focus-visible:shadow-focus";
  return (
    <>
      <Header crumbs={[{ label: studio.name, current: true, render: (cls) => <StudioCrumb className={cls} /> }]} right={can("createProject") ? <Button variant="primary" onClick={() => go.create(1)}>New project</Button> : null} />
      <div className="flex flex-1 flex-col gap-10 overflow-auto px-16 pb-16 pt-10">
        <div className="flex items-center gap-5">
          <span className="flex size-14 items-center justify-center rounded-lg bg-accent text-28 font-semibold text-accent-fg">{studio.initial}</span>
          <div className="flex flex-col gap-0.5"><h1 className="m-0 text-32 font-semibold leading-[1.1] tracking-[-0.025em]">{studio.name}</h1><span className="text-secondary">{studio.peopleCount} people · {studio.projects.length} projects</span></div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-13 text-secondary">Last changed<ChevronDown size={10} strokeWidth={2} aria-hidden="true" /></span>
        </div>
        {studio.projects.length === 0 ? <span className="text-secondary">{t("home.empty")}</span> : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-6">
          {studio.projects.map((p) => (
            <button type="button" key={p.id} className={card} onClick={() => go.project(p.slug)}>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => { const k = p.renders[i]; return k ? <div key={i} className="aspect-[4/3] overflow-hidden rounded-md" style={renderStyle({ key: k, pos: "center" }, "tile")} /> : <div key={i} className="aspect-[4/3] rounded-md border border-dashed border-border" />; })}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-0.5"><span className="text-16 font-medium">{p.name}</span><span className="text-13 text-secondary">{p.assetCount} assets · {p.changed}</span></div>
                <AvatarStack people={p.present.map(by)} size={24} max={4} ring="var(--bg-panel)" />
              </div>
            </button>
          ))}
          {can("createProject") ? (
            <button type="button" onClick={() => go.create(1)} className="flex flex-col gap-5 rounded-xl border border-dashed border-border p-5 text-left text-secondary transition-colors duration-150 hover:bg-panel outline-none focus-visible:shadow-focus">
              <div className="grid grid-cols-3 gap-2"><div className="aspect-[4/3]" /><div className="flex aspect-[4/3] items-center justify-center"><Plus size={28} strokeWidth={1.25} aria-hidden="true" /></div><div className="aspect-[4/3]" /></div>
              <div className="flex flex-col gap-0.5"><span className="text-16 font-medium text-heading">New project</span><span className="text-13">A folder of normal files. Under five minutes.</span></div>
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
