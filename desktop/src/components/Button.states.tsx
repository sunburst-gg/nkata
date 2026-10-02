import { ArrowRight, Check } from "lucide-react";
import { Button, IconButton } from "./Button";

const variants = [["primary", "Publish"], ["secondary", "Mark Ready"], ["ghost", "Open in Blender"], ["danger", "Remove gate"]] as const;

export function ButtonStates() {
  return (
    <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] items-center gap-x-4 gap-y-3">
      <span />
      {["default", "hover", "active", "focus", "disabled"].map((s) => <span key={s} className="role-mono text-muted">{s}</span>)}
      {variants.map(([v, label]) => (
        <div key={v} className="contents">
          <span className="role-mono text-secondary">{v}</span>
          <div><Button variant={v}>{label}</Button></div>
          <div><Button variant={v} className="nk-hover" data-state="hover">{label}</Button></div>
          <div><Button variant={v} data-state="active">{label}</Button></div>
          <div><Button variant={v} className="shadow-focus">{label}</Button></div>
          <div><Button variant={v} disabled>{label}</Button></div>
        </div>
      ))}
      <span className="role-mono text-secondary">sm · icon</span>
      <div><Button size="sm">Roll back</Button></div>
      <div><IconButton label="Next"><ArrowRight size={14} strokeWidth={1.75} /></IconButton></div>
      <div><Button size="sm" variant="primary" icon={<Check size={12} strokeWidth={2.2} />}>Approve</Button></div>
      <div><Button size="sm" loading>Publishing</Button></div>
      <div><Button size="sm" variant="inverted">Fix all 2</Button></div>
    </div>
  );
}
