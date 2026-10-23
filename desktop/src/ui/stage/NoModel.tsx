// What a stage shows when the save has no model to load: the save's still when there is one,
// else the amber ghost and one line. Never a model from somewhere else (docs/decisions.md,
// v8 step 16, item 2).
import { Ghost } from "@/ui/cards/Ghost";

export function NoModel({ still, line, label }: { still?: string; line?: string; label: string }) {
  if (still) return <div role="img" aria-label={label} style={{ position: "absolute", inset: 0, backgroundImage: `url(${still})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  return (
    <>
      <Ghost />
      {line ? <span style={{ position: "absolute", left: 0, right: 0, bottom: "14%", textAlign: "center", font: "400 13px var(--sans)", color: "var(--ink60)" }}>{line}</span> : null}
    </>
  );
}
