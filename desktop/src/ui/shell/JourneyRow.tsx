// The progress ring and the next action. Gone when the journey is done. Viewers never see it.
import { useStore } from "@/app/store";
import { journey } from "@/app/selectors";
import { NavItem } from "./NavItem";

export function JourneyRow() {
  const me = useStore((s) => s.me);
  const assets = useStore((s) => s.assets);
  const members = useStore((s) => s.members);
  const stage = useStore((s) => s.stage);
  const go = useStore((s) => s.go);
  if (!me || me.role === "viewer") return null;
  const j = journey(assets, members, me, stage);
  if (!j.open) return null;
  const dash = `${((j.done / 3) * 50.3).toFixed(1)} 50.3`;
  return (
    <NavItem height={40} onClick={() => go("project")} style={{ marginBottom: 8 }}>
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ flexShrink: 0 }} aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--amber)" strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" transform="rotate(-90 10 10)" />
      </svg>
      <span style={{ fontSize: 13, lineHeight: 1.3 }}>{j.nextAction}</span>
    </NavItem>
  );
}
