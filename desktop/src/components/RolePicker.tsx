// RolePicker. Six roles as radio rows. Viewer is last, with one line.
import { ROLE_LINES, ROLE_WORDS, type Role } from "@/auth/permissions";
import { cn } from "@/lib/cn";

export interface RolePickerProps {
  value: Role;
  onChange: (role: Role) => void;
  name?: string;
}

export function RolePicker({ value, onChange, name = "role" }: RolePickerProps) {
  return (
    <div role="radiogroup" aria-label="Role" className="flex flex-col">
      {ROLE_LINES.map(({ role, line }) => {
        const on = role === value;
        return (
          <label key={role} className={cn("flex cursor-pointer items-start gap-3.5 rounded-md p-3 transition-colors duration-150 has-[:focus-visible]:shadow-focus", on ? "bg-active" : "hover:bg-hover")}>
            <input type="radio" name={name} value={role} checked={on} onChange={() => onChange(role)} className="sr-only" />
            <span aria-hidden="true" className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]", on ? "border-accent" : "border-border")}><span className={cn("size-2 rounded-full", on && "bg-accent")} /></span>
            <span className="flex flex-col gap-0.5"><span className="font-medium text-heading">{ROLE_WORDS[role]}</span><span className="text-13 text-secondary">{line}</span></span>
          </label>
        );
      })}
    </div>
  );
}
