import { CommentPin } from "./CommentPin";
import { RotatablePreview } from "./RotatablePreview";

export function RotatablePreviewStates() {
  return (
    <div className="grid grid-cols-2 gap-6">
      <RotatablePreview frames={[{ key: "ground", pos: "center" }]} label="Approved parts · in Unreal · Lit" />
      <RotatablePreview frames={[{ key: "interior", pos: "center" }, { key: "courtyard", pos: "center" }, { key: "tree", pos: "center" }, { key: "overview", pos: "center" }]} label="4 frames">
        <CommentPin n={1} at={{ x: 58, y: 30 }} />
        <CommentPin n={2} tone="active" at={{ x: 30, y: 58 }} />
      </RotatablePreview>
    </div>
  );
}
