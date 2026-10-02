import { CheckRow } from "./CheckRow";
import type { Check } from "@/data/types";

const checks: Check[] = [
  { id: "1", name: "Scale", detail: "1.0", status: "pass", blocks: false, fixable: false },
  { id: "2", name: "Naming", detail: "SM_Ojukwu_Face", status: "pass", blocks: false, fixable: false },
  { id: "3", name: "Triangle budget", detail: "48,200 of 30,000. Decimate or split the mesh.", status: "fail", blocks: true, fixable: true },
  { id: "4", name: "Texture size", detail: "3 textures over 2048. Nkata can resize them.", status: "warn", blocks: false, fixable: true },
  { id: "5", name: "LODs", detail: "Generating 3 levels", status: "running", blocks: false, fixable: false },
  { id: "6", name: "Collision", detail: "Runs after LODs", status: "waiting", blocks: false, fixable: false },
];

export function CheckRowStates() {
  return (
    <div className="flex max-w-120 flex-col gap-3">
      {checks.map((c) => <CheckRow key={c.id} check={c} onFix={() => undefined} />)}
      <span className="role-mono text-muted">viewer: the Fix button is not rendered</span>
      <CheckRow check={checks[2]!} canFix={false} />
    </div>
  );
}
