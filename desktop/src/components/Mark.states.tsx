import { Mark, Wordmark } from "./Mark";

export function MarkStates() {
  return (
    <div className="flex items-center gap-8">
      <Mark size={18} />
      <Mark size={28} />
      <Mark size={48} tone="mono" />
      <span className="text-secondary"><Mark size={28} /></span>
      <Wordmark />
    </div>
  );
}
