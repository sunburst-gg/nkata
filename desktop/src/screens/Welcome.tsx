// Welcome, {first name}. Three cards, each a miniature of the real screen on a blurred render,
// with a cursor that moves to the control on hover. Styles in src/styles/welcome.css.
import { useCan, useStore } from "@/store";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { firstName, useGo } from "@/lib/hooks";
import { renderUrl } from "@/lib/renders";
import blenderLogo from "@/assets/logos/blender.svg";
import unrealLogo from "@/assets/logos/unreal.svg";

function Cursor({ className, small = false, fill }: { className?: string; small?: boolean; fill?: string }) {
  return (
    <svg width={small ? 12 : 22} height={small ? 14 : 26} viewBox="0 0 22 26" aria-hidden="true" className={className}>
      <path d="M2 2l6 20 3.5-8 8.5-3.5z" fill={fill ?? "var(--n9)"} stroke="var(--avatar-fg)" strokeWidth={small ? 2 : 1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Short versions for the connect line: "5.1" from "5.1.2". */
function short(v?: string): string | undefined {
  return v?.split(".").slice(0, 2).join(".");
}

export function Welcome() {
  const me = useStore((s) => s.db.session.user);
  const studio = useStore((s) => s.db.session.studio);
  const connections = useStore((s) => s.db.connections);
  const setMembers = useStore((s) => s.setMembers);
  const can = useCan();
  const go = useGo();
  const blender = connections.find((c) => c.id === "blender");
  const unreal = connections.find((c) => c.id === "unreal");
  const both = !!blender?.connected && !!unreal?.connected;
  const found = blender?.version && unreal?.version ? `Blender ${short(blender.version)} and Unreal ${short(unreal.version)}` : null;
  const connectLine = both && found ? `${found} are connected. The panels are in both.` : found ? `Nkata found ${found}. Confirm and the panels appear in both.` : "Install Blender and Unreal on this computer, then connect them here.";
  const newProject = () => { if (can("createProject")) go.newProject(); else if (studio.projects[0]) go.project(studio.projects[0].slug); };
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-10 pt-6">
      <div className="flex flex-col gap-5">
        <PresenceAvatar initial={me.initial} tone={me.tone} name={me.name} size={48} />
        <h1 className="role-moment-lg m-0 text-heading">{`Welcome, ${firstName(me.name)}`}</h1>
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div role="button" tabIndex={0} onClick={newProject} onKeyDown={(e) => { if (e.key === "Enter") newProject(); }} className="wc wc-project">
          <div className="wc-scene">
            <div className="wc-blur" style={{ backgroundImage: `url(${renderUrl("tree")})` }} /><div className="wc-glow" />
            <div className="wc-window">
              <div className="wc-side">
                <div className="wc-studio"><span className="wc-studio-mark">{studio.initial}</span><span className="font-medium">{studio.name}</span></div>
                <span className="wc-nav">Get started</span><span className="wc-nav-hl">+ New project</span><span className="wc-nav">@ Mentions</span><span className="wc-label">Projects</span><span className="wc-none">No projects yet.</span>
              </div>
              <div className="wc-main"><span className="wc-serif">New project</span><span className="wc-field" /><span className="wc-field" /></div>
              <Cursor className="wc-cursor" />
            </div>
          </div>
          <div className="wc-caption"><b>Create a project.</b> Name it, pick a folder. Nkata sets up the rest.</div>
        </div>
        <div role="button" tabIndex={0} onClick={go.connections} onKeyDown={(e) => { if (e.key === "Enter") go.connections(); }} className="wc wc-connect">
          <div className="wc-scene">
            <div className="wc-blur" style={{ backgroundImage: `url(${renderUrl("interior")})` }} /><div className="wc-glow" />
            <div className="wc-window">
              <span className="wc-serif">Connections</span>
              <div className="wc-grid">
                <div className="wc-tool"><span className="wc-tool-mark blender"><img src={blenderLogo} alt="" width={14} height={14} draggable={false} /></span><span className="wc-tool-name">Blender</span><span className="wc-tool-line">{blender?.version ?? "5.1.2"} found</span><span className="wc-tool-btn">Connect</span></div>
                <div className="wc-tool"><span className="wc-tool-mark unreal"><img src={unrealLogo} alt="" width={14} height={14} draggable={false} /></span><span className="wc-tool-name">Unreal Engine</span><span className="wc-tool-line">{unreal?.version ?? "5.8.1"} found</span><span className="wc-tool-on">Connected</span></div>
              </div>
              <Cursor className="wc-cursor" />
            </div>
          </div>
          <div className="wc-caption"><b>Connect your editors.</b> {connectLine}</div>
        </div>
        <div role="button" tabIndex={0} onClick={() => { if (can("manageMembers")) setMembers(true); else go.settings("members"); }} onKeyDown={(e) => { if (e.key === "Enter") setMembers(true); }} className="wc wc-members">
          <div className="wc-scene">
            <div className="wc-blur" style={{ backgroundImage: `url(${renderUrl("courtyard")})` }} /><div className="wc-glow" />
            <div className="wc-window">
              <span className="wc-serif">Members</span>
              <div className="wc-row"><span className="wc-email">ada@sunburst.studio</span><span className="wc-add">Add</span></div>
              <div className="wc-ground" style={{ backgroundImage: `url(${renderUrl("ground", "tile")})` }}>
                <span className="wc-face ada"><Cursor small fill="var(--avatar-9)" /><span>Ada</span></span>
                <span className="wc-face chidi"><Cursor small fill="var(--avatar-2)" /><span>Chidi</span></span>
                <span className="wc-face ngozi"><Cursor small fill="var(--avatar-6)" /><span>Ngozi</span></span>
              </div>
            </div>
          </div>
          <div className="wc-caption"><b>Invite your team.</b> Only people you invite can open your projects.</div>
        </div>
      </div>
    </div>
  );
}
