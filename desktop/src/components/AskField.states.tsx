import { AskField } from "./AskField";

export function AskFieldStates() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4">
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">idle · h 44 · radius-lg</span><AskField /></div>
      <div className="flex flex-col gap-1.5"><span className="role-mono text-muted">answer</span>
        <AskField placeholder="What is blocking Ojukwu" answer={<>
          <span>Textures wait on <a href="#" className="text-accent-text">face</a>. Ada has it, Draft, 3 days. Last comment from Emeka: "Seam at the jaw."</span>
          <div className="flex flex-wrap gap-2 text-13"><a href="#" className="rounded-sm border border-border px-2 py-0.75">Open Ojukwu / face</a><a href="#" className="rounded-sm border border-border px-2 py-0.75">Remove gate</a></div>
        </>} />
      </div>
    </div>
  );
}
