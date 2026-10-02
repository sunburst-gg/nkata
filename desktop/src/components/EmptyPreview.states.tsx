import { createMockSource } from "@/data/mock";
import { EmptyPreview } from "./EmptyPreview";

const ify = createMockSource().snapshot().people.find((p) => p.id === "ify")!;

export function EmptyPreviewStates() {
  return <div className="max-w-160"><EmptyPreview owner={ify} assetName="Act1_Scene3" /></div>;
}
