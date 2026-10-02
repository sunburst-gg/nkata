import { createMockSource } from "@/data/mock";
import { DigestRenderPair } from "./DigestRenderPair";

const digest = createMockSource().snapshot().digests[0]!;

export function DigestRenderPairStates() {
  return <div className="grid max-w-240 grid-cols-2 gap-8">{digest.renderPairs.map((p) => <DigestRenderPair key={p.assetSlug} pair={p} />)}</div>;
}
