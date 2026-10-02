import { ProjectMenu } from "./ProjectMenu";

const noop = () => undefined;
const cls = "inline-flex items-center gap-1.5 rounded-sm text-14 font-medium text-heading outline-none focus-visible:shadow-focus cursor-pointer";

export function ProjectMenuStates() {
  return (
    <div className="flex gap-12">
      <div className="flex flex-col gap-2"><span className="role-mono text-muted">artist</span><ProjectMenu name="Rising Sun" className={cls} peopleCount={8} templateCount={5} showTemplates showSettings onPeople={noop} onTemplates={noop} onSettings={noop} onChanges={noop} onAllProjects={noop} /></div>
      <div className="flex flex-col gap-2"><span className="role-mono text-muted">viewer · no Templates, no Settings</span><ProjectMenu name="Rising Sun" className={cls} peopleCount={8} templateCount={5} showTemplates={false} showSettings={false} onPeople={noop} onTemplates={noop} onSettings={noop} onChanges={noop} onAllProjects={noop} /></div>
    </div>
  );
}
