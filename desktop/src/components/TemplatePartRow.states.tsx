import { createMockSource } from "@/data/mock";
import { TemplatePartRow } from "./TemplatePartRow";

const tpl = createMockSource().snapshot().templates[0]!;

export function TemplatePartRowStates() {
  return (
    <div className="flex max-w-245 flex-col border-t border-hairline">
      {tpl.parts.slice(0, 4).map((p, i) => <TemplatePartRow key={p.id} part={p} index={i} active={i === 2} />)}
      <TemplatePartRow part={tpl.parts[4]!} index={4} editable={false} />
    </div>
  );
}
