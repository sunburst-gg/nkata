import { Input } from "./Input";

export function InputStates() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">default</span><Input placeholder="Asset name" /></div>
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">focus</span><Input defaultValue="Ojukwu" autoFocus className="border-accent shadow-focus" /></div>
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">error</span><Input id="err" defaultValue="Ojukwu / face" error="A part named face already exists." /></div>
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">disabled</span><Input defaultValue="Set by template" disabled /></div>
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">large</span><Input large placeholder="ada@sunburst.studio" /></div>
    </div>
  );
}
