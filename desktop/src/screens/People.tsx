// People. Everyone on the project, where they are, when seen. Invite for a producer.
import { ChevronDown } from "lucide-react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { PersonAvatar } from "@/components/PresenceAvatar";
import { ROLE_WORDS } from "@/auth/permissions";
import { useProject } from "@/lib/hooks";
import { ScreenHead } from "./Shell";

export function People() {
  const project = useProject();
  const people = useStore((s) => s.db.people).filter((p) => p.role !== "viewer");
  const can = useCan();
  const setInvite = useStore((s) => s.setInvite);
  const online = people.filter((p) => p.presence === "online").length;
  return (
    <div className="flex max-w-240 flex-col gap-8">
      <ScreenHead title="People" line={`${people.length} on ${project.name} · ${online} online`} actions={can("invite") ? <Button variant="primary" onClick={() => setInvite(true)}>Invite</Button> : null} />
      <div className="flex flex-col">
        {people.map((p) => (
          <div key={p.id} className="grid h-15 grid-cols-[36px_minmax(0,1.2fr)_150px_minmax(0,1.4fr)_70px] items-center gap-6 border-b border-hairline">
            <PersonAvatar person={p} size={36} presence={p.presence === "offline" ? "none" : p.presence} />
            <span className="flex min-w-0 flex-col leading-[1.3]"><span className="font-medium">{p.name}</span><span className="text-13 text-secondary">{p.title}</span></span>
            {can("invite") ? (
              <button type="button" className="inline-flex h-7.5 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 text-13 text-body hover:bg-hover">{ROLE_WORDS[p.role]}{p.role === "art_director" ? " · reviews" : p.role === "producer" ? " · admin" : ""}<ChevronDown size={10} strokeWidth={2} aria-hidden="true" /></button>
            ) : <span className="text-13 text-body">{ROLE_WORDS[p.role]}{p.role === "art_director" ? " · reviews" : p.role === "producer" ? " · admin" : ""}</span>}
            <span className="truncate text-13 text-secondary">{p.where}</span>
            <span className="role-mono whitespace-nowrap text-right text-muted">{p.seen}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
