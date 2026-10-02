import { createMockSource } from "@/data/mock";
import { AssetTile } from "./AssetTile";

const db = createMockSource().snapshot();
const by = (id: string) => db.people.find((p) => p.id === id)!;

export function AssetTileStates() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-6 gap-y-8">
      {db.assets.slice(0, 5).map((a) => (
        <AssetTile key={a.id} asset={a} people={a.present.map(by)} owner={by(a.ownerId)} />
      ))}
    </div>
  );
}
