// The slim bar for an artist joining a project that already has work.
import { useStore } from "@/app/store";
import { toast } from "@/ui/toast/toast";

export function YourTurnBar() {
  const me = useStore((s) => s.me);
  const assets = useStore((s) => s.assets);
  if (!me) return null;
  const first = assets.find((a) => a.owner.id !== me.id)?.owner.first ?? "the team";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow)" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)" }} />
      <span style={{ flex: 1, color: "var(--ink)" }}>Your turn. Open Blender and save. Your work shows up here next to {first}'s.</span>
      <button type="button" onClick={() => toast("Blender is opening with the Nkata panel.", me.color)} style={{ height: 36, padding: "0 16px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 14px var(--sans)", cursor: "pointer" }}>Open Blender</button>
    </div>
  );
}
