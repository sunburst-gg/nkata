import { useStore } from "@/app/store";
import { isLead, ROLE_WORD } from "@/auth/permissions";
import { Avatar } from "@/ui/people/Avatar";

export function MeRow() {
  const me = useStore((s) => s.me);
  if (!me) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 4px" }}>
      <Avatar person={me} size={28} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, color: "var(--ink)" }}>{me.name}</span>
        <span style={{ fontSize: 11, color: "var(--ink60)" }}>{isLead(me.role) ? "Lead" : ROLE_WORD[me.role]}</span>
      </div>
    </div>
  );
}
