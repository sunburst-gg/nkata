import { createMockSource } from "@/data/mock";
import { AvatarStack, PresenceAvatar } from "./PresenceAvatar";

const people = createMockSource().snapshot().people;

export function PresenceAvatarStates() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-5">
        <PresenceAvatar initial="A" tone={1} name="Ada" size={32} presence="online" />
        <PresenceAvatar initial="C" tone={2} name="Chidi" size={24} presence="idle" />
        <PresenceAvatar initial="N" tone={3} name="Ngozi" size={20} presence="offline" />
        <AvatarStack people={people.slice(0, 5)} />
        <AvatarStack people={people.slice(0, 2)} size={20} ring="var(--bg-panel)" />
      </div>
      <span className="role-mono text-muted">online 32 · idle 24 · offline 20 · stack</span>
    </div>
  );
}
