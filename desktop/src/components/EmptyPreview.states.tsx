import { createMockSource } from "@/data/mock";
import { EmptyPreview } from "./EmptyPreview";

const tobe = createMockSource().snapshot().people.find((p) => p.id === "tobe")!;

export function EmptyPreviewStates() {
  return <div className="max-w-160"><EmptyPreview owner={tobe} assetName="Kettle" /></div>;
}
