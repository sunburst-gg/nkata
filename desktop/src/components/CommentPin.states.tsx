import { CommentPin } from "./CommentPin";

export function CommentPinStates() {
  return (
    <div className="flex items-center gap-4">
      <CommentPin n={1} />
      <CommentPin n={2} tone="active" />
      <CommentPin n={3} tone="resolved" />
      <CommentPin n={4} size={20} />
      <span className="role-mono text-muted">default · active · resolved · 20 for panels</span>
    </div>
  );
}
