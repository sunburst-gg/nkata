// Profile. Name, email, avatar, connected tools, sign out.
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { FieldRow } from "@/components/Input";
import { PersonAvatar } from "@/components/PresenceAvatar";
import { StateDot } from "@/components/StateBadge";
import { ROLE_WORDS } from "@/auth/permissions";
import { useGo } from "@/lib/hooks";
import { Header } from "./Shell";

export function Profile() {
  const user = useStore((s) => s.db.session.user);
  const studio = useStore((s) => s.db.session.studio);
  const signOut = useStore((s) => s.signOut);
  const project = studio.projects[0]!;
  const go = useGo();
  const edit = <button type="button" className="text-13 text-secondary hover:text-heading">Edit</button>;
  return (
    <>
      <Header crumbs={[{ label: studio.name, onClick: go.home }, { label: "Profile", current: true }]} />
      <div className="flex max-w-180 flex-1 flex-col gap-10 overflow-auto px-16 pb-16 pt-10">
        <div className="flex items-center gap-5">
          <PersonAvatar person={user} size={64} presence={user.presence} />
          <div className="flex flex-col gap-0.5"><h1 className="m-0 text-32 font-semibold leading-[1.1] tracking-[-0.025em]">{user.name}</h1><span className="text-secondary">{user.title} · {user.role === "viewer" ? "Lagos Interactive" : studio.name}</span></div>
          <button type="button" className="ml-auto whitespace-nowrap text-13 text-secondary hover:text-heading">Change photo</button>
        </div>
        <div className="flex flex-col">
          <FieldRow label="Name" trailing={edit}>{user.name}</FieldRow>
          <FieldRow label="Email" trailing={edit}>{user.email}</FieldRow>
          <FieldRow label="Title" trailing={edit}>{user.title}</FieldRow>
          <FieldRow label="Role" trailing={<span className="text-13 text-muted">Set by a producer</span>}>{ROLE_WORDS[user.role]}</FieldRow>
          <FieldRow label="Discord" trailing={<button type="button" className="text-13 text-secondary hover:text-heading">Disconnect</button>}><StateDot state="approved" />{user.name.split(" ")[0]?.toLowerCase()}.{user.name.split(" ")[1]?.charAt(0).toLowerCase()}</FieldRow>
        </div>
        {user.role !== "viewer" ? (
          <div className="flex flex-col gap-3">
            <span className="text-16 font-medium">On this computer</span>
            <div className="flex flex-col">
              <FieldRow label="Blender" trailing={<span className="inline-flex items-center gap-2 whitespace-nowrap text-13 text-secondary"><StateDot state="approved" />Matches the project</span>}><span className="font-mono text-14 font-medium">{project.blender}</span></FieldRow>
              <FieldRow label="Unreal Engine" trailing={<span className="inline-flex items-center gap-2 whitespace-nowrap text-13 text-secondary"><StateDot state="approved" />Matches the project</span>}><span className="font-mono text-14 font-medium">{project.unreal}</span></FieldRow>
              <FieldRow label="Projects" trailing={<span className="text-13 text-secondary">{project.sizeLabel}</span>}>{project.name} at <span className="font-mono text-14 font-medium">{project.folder}</span></FieldRow>
            </div>
          </div>
        ) : null}
        <Button className="self-start" onClick={() => { signOut(); go.signin(); }}>Sign out</Button>
      </div>
    </>
  );
}
