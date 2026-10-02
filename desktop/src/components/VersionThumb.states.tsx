import { createMockSource } from "@/data/mock";
import { VersionThumb } from "./VersionThumb";

const face = createMockSource().snapshot().assets[0]!.parts[0]!;

export function VersionThumbStates() {
  return (
    <div className="flex w-33 flex-col gap-4">
      {face.versions.map((v, i) => <VersionThumb key={v.id} version={v} current={i === 0} picked={i === 2} dim={i > 4} />)}
    </div>
  );
}
