import { createMockSource } from "@/data/mock";
import { CommentThread } from "./CommentThread";

const db = createMockSource().snapshot();
const comments = db.assets[0]!.parts.flatMap((p) => p.comments);

export function CommentThreadStates() {
  return (
    <div className="max-w-85">
      <CommentThread comments={comments} people={db.people} showPart activeN={2} onAdd={() => undefined} />
    </div>
  );
}
