import { useState } from "react";
import { Tabs } from "./Tabs";

export function TabsStates() {
  const [v, setV] = useState("parts");
  return (
    <div className="flex flex-col gap-1.5">
      <span className="role-mono text-muted">underline 2 px · 150 ms</span>
      <Tabs
        aria-label="Asset"
        value={v}
        onChange={setV}
        items={[{ value: "parts", label: "Parts" }, { value: "timeline", label: "Timeline" }, { value: "comments", label: "Comments", count: 3 }, { value: "export", label: "Export", disabled: true }]}
      />
    </div>
  );
}
