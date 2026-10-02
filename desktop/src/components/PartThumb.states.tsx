import { createMockSource } from "@/data/mock";
import { PartThumb } from "./PartThumb";

const db = createMockSource().snapshot();
const ojukwu = db.assets[0]!;
const by = (id: string) => db.people.find((p) => p.id === id)!;

export function PartThumbStates() {
  return (
    <div className="flex gap-6">
      {ojukwu.parts.map((p, i) => <PartThumb key={p.id} part={p} owner={by(p.ownerId)} active={i === 0} />)}
    </div>
  );
}
