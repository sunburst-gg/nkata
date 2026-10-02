import { useState } from "react";
import type { Role } from "@/auth/permissions";
import { RolePicker } from "./RolePicker";

export function RolePickerStates() {
  const [role, setRole] = useState<Role>("viewer");
  return <div className="max-w-120"><RolePicker value={role} onChange={setRole} /></div>;
}
