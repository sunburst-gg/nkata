// The app shell. No sidebar. A 56 px header with the breadcrumb, the status line, and the avatar.
import type { ReactNode } from "react";
import { useStore } from "@/store";
import { AccountMenu } from "@/components/AccountMenu";
import { Breadcrumb, type Crumb } from "@/components/Breadcrumb";
import { useGo } from "@/lib/hooks";

export function Header({ crumbs, middle, right }: { crumbs: Crumb[]; middle?: ReactNode; right?: ReactNode }) {
  const user = useStore((s) => s.db.session.user);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const signOut = useStore((s) => s.signOut);
  const switchRole = useStore((s) => s.switchRole);
  const viewer = user.role === "viewer";
  const go = useGo();
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 px-8">
      <Breadcrumb items={crumbs} />
      {middle}
      <div className="ml-auto flex items-center gap-6">
        {right}
        <AccountMenu user={user} theme={theme} viewer={viewer} onProfile={go.profile} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onSignOut={() => { signOut(); go.signin(); }} onSwitchRole={() => switchRole(viewer ? "artist" : "viewer")} />
      </div>
    </header>
  );
}

/** Centered single column for auth, create, and join screens. */
export function Centered({ children, width = 480 }: { children: ReactNode; width?: number }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-16">
      <div className="flex flex-col gap-8" style={{ width }}>{children}</div>
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="role-statement m-0 text-heading">{children}</h1>;
}

/** Screen head: title, a line under it, actions on the right. */
export function ScreenHead({ title, line, actions }: { title: string; line?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-32 font-semibold leading-[1.1] tracking-[-0.025em] text-heading">{title}</h1>
        {line ? <span className="flex items-center gap-4 text-secondary">{line}</span> : null}
      </div>
      {actions ? <div className="ml-auto flex gap-2">{actions}</div> : null}
    </div>
  );
}
