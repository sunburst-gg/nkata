// AccountMenu. The avatar opens Profile, Appearance, Sign out. A Viewer label sits beside the avatar.
import type { Person } from "@/data/types";
import { t } from "@/copy/en";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "./Menu";
import { PersonAvatar } from "./PresenceAvatar";

export interface AccountMenuProps {
  user: Person;
  theme: "dark" | "light";
  viewer: boolean;
  onProfile: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  /** Dev only: swap the mock user between artist and viewer. */
  onSwitchRole?: () => void;
}

export function ViewerLabel() {
  return <span className="inline-flex h-5.5 items-center rounded-full border border-border px-2 text-12 text-secondary">{t("viewer.label")}</span>;
}

export function AccountMenu({ user, theme, viewer, onProfile, onToggleTheme, onSignOut, onSwitchRole }: AccountMenuProps) {
  return (
    <div className="flex items-center gap-4">
      {viewer ? <ViewerLabel /> : null}
      <MenuRoot>
        <MenuTrigger aria-label="Account" className="rounded-full outline-none focus-visible:shadow-focus">
          <PersonAvatar person={user} size={28} presence={user.presence} />
        </MenuTrigger>
        <MenuContent width={260} align="end">
          <div className="flex items-center gap-3 p-2.5">
            <PersonAvatar person={user} size={36} />
            <span className="flex min-w-0 flex-col leading-[1.3]"><span className="font-medium text-heading">{user.name}</span><span className="truncate text-13 text-secondary">{user.email}</span></span>
          </div>
          <MenuSeparator />
          <MenuItem onSelect={onProfile}>Profile</MenuItem>
          <MenuItem onSelect={onToggleTheme} trailing={theme === "dark" ? "Dark" : "Light"}>Appearance</MenuItem>
          {onSwitchRole ? <MenuItem onSelect={onSwitchRole} trailing={viewer ? "Viewer" : "Artist"}>Mock role</MenuItem> : null}
          <MenuSeparator />
          <MenuItem onSelect={onSignOut} muted>Sign out</MenuItem>
        </MenuContent>
      </MenuRoot>
    </div>
  );
}
