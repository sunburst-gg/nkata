// ProjectMenu. The project name in the breadcrumb opens People, Templates, Settings, What changed.
// Templates and Settings are not rendered for a viewer: the parent passes what can() allows.
import { ChevronDown } from "lucide-react";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "./Menu";

export interface ProjectMenuProps {
  name: string;
  current?: boolean;
  className: string;
  peopleCount: number;
  templateCount: number;
  showTemplates: boolean;
  showSettings: boolean;
  onPeople: () => void;
  onTemplates: () => void;
  onSettings: () => void;
  onChanges: () => void;
  onAllProjects: () => void;
}

export function ProjectMenu(p: ProjectMenuProps) {
  return (
    <MenuRoot>
      <MenuTrigger className={p.className} aria-label={`${p.name} menu`}>
        {p.name}
        <ChevronDown size={10} strokeWidth={2} aria-hidden="true" />
      </MenuTrigger>
      <MenuContent width={200}>
        <MenuItem onSelect={p.onPeople} trailing={p.peopleCount}>People</MenuItem>
        {p.showTemplates ? <MenuItem onSelect={p.onTemplates} trailing={p.templateCount}>Templates</MenuItem> : null}
        {p.showSettings ? <MenuItem onSelect={p.onSettings}>Settings</MenuItem> : null}
        <MenuItem onSelect={p.onChanges}>What changed</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={p.onAllProjects} muted>All projects</MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}
