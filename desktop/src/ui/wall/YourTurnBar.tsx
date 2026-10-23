// The slim bar for an artist in a project that has work and none of theirs yet. On live data it
// names the place to save into, or sends the artist to choose one; the mock keeps the prototype's
// button.
import { useStore } from "@/app/store";
import { usePlace } from "@/app/usePlace";
import { toast } from "@/ui/toast/toast";

export function YourTurnBar() {
  const me = useStore((s) => s.me);
  const assets = useStore((s) => s.assets);
  const projectName = useStore((s) => s.projects.find((p) => p.id === s.projectId)?.name ?? "the project");
  const go = useStore((s) => s.go);
  const { live, place } = usePlace();
  if (!me) return null;
  const first = assets.find((a) => a.owner.id !== me.id)?.owner.first ?? "the team";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow)" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)" }} />
      <span style={{ flex: 1, color: "var(--ink)" }}>{!live ? `Your turn. Open Blender and save. Your work shows up here next to ${first}'s.` : place ? `Your turn. Save a .blend into ${place} and it shows up here next to ${first}'s.` : `Your turn. Choose where ${projectName} lives on this computer, then save into it from Blender.`}</span>
      {!live ? <button type="button" onClick={() => toast("Blender is opening with the Nkata panel.", me.color)} style={{ height: 36, padding: "0 16px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 14px var(--sans)", cursor: "pointer" }}>Open Blender</button> : !place ? <button type="button" onClick={() => go("connections")} style={{ height: 36, padding: "0 16px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 14px var(--sans)", cursor: "pointer" }}>Choose where</button> : null}
    </div>
  );
}
