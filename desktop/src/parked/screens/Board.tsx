// The board. Every part in the project as one row: owner, state, the blocking checks as dots,
// whose move, waiting for how long, the last note, published when. Three numbers on top. Filters
// narrow it; Waiting on me is the artist's default. A row opens the part. Nothing here changes
// state and nothing is typed (docs/tasks/07-blender-first.md, slice 8).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { Select } from "@/components/Field";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { StateDot } from "@/components/StateBadge";
import type { PartState } from "@/data/types";
import { boardCounts, boardRows, EMPTY_FILTER, filterRows, waitingLabel, type BoardFilter, type BoardRow, type Move } from "@/lib/board";
import { cn } from "@/lib/cn";
import { firstName, useGo, usePeople, useProject } from "@/lib/hooks";
import { folderNames } from "@/lib/list";
import { STATE_WORD } from "@/lib/state";

const STATES: PartState[] = ["draft", "locked", "waiting", "ready", "approved"];
const SELECT = "h-9 w-auto min-w-36 rounded-full py-0 text-13";

export function Board() {
  const project = useProject();
  const db = useStore((s) => s.db);
  const can = useCan();
  const go = useGo();
  const { by } = usePeople();
  const me = db.session.user;
  const [params, setParams] = useSearchParams();
  // ?mine=1 lands with Waiting on me on; an artist lands there by default (the sidebar sends them).
  const [mine, setMine] = useState(params.get("mine") === "1");
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  useEffect(() => { setFilter(EMPTY_FILTER); setMine(params.get("mine") === "1"); }, [project?.slug]);
  const assets = useMemo(() => db.assets.filter((a) => a.projectSlug === project?.slug), [db.assets, project?.slug]);
  const rows = useMemo(() => boardRows(assets), [assets]);
  if (!project) return <span className="text-secondary">No projects yet.</span>;

  const reviews = can("review");
  const shown = filterRows(rows, { ...filter, me: mine ? { id: me.id, reviews } : null });
  const counts = boardCounts(rows);
  const owners = [...new Set(rows.map((r) => r.ownerId).filter(Boolean))].map((id) => by(id)).sort((a, b) => a.name.localeCompare(b.name));
  const templates = [...new Set(assets.map((a) => a.template).filter(Boolean))].sort();
  const folders = folderNames(assets);
  const toggleMine = () => { const on = !mine; setMine(on); if (on) params.set("mine", "1"); else params.delete("mine"); setParams(params, { replace: true }); };
  const set = <K extends keyof BoardFilter>(key: K, value: BoardFilter[K]) => setFilter({ ...filter, [key]: value });
  const moveWord = (r: BoardRow): string => {
    const word: Record<Move, string> = { owner: `${firstName(by(r.ownerId).name)} to publish`, reviewers: "Reviewers", gate: "Gate", done: "Done" };
    if (r.move === "owner" && !r.ownerId) return "No owner";
    return word[r.move];
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="role-moment m-0 leading-[1.1] text-heading">{`${project.name} board`}</h1>
          <span className="text-13 text-secondary">Every part, whose move it is, and for how long. Waiting longest first.</span>
        </div>
        <div className="ml-auto flex shrink-0 gap-2"><Button onClick={() => go.project(project.slug)}>Assets</Button></div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Count label="In work" n={counts.inWork} />
        <Count label="Waiting on review" n={counts.waitingOnReview} />
        <Count label="Approved" n={counts.approved} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4" role="group" aria-label="Filters">
        <button type="button" aria-pressed={mine} onClick={toggleMine} className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border bg-transparent px-3 text-13 transition-colors duration-150", mine ? "border-heading bg-raised text-heading" : "border-hairline text-secondary hover:text-heading")}>Waiting on me</button>
        <Select aria-label="Owner" className={SELECT} value={filter.owner ?? ""} onChange={(e) => set("owner", e.target.value || null)}>
          <option value="">Any owner</option>
          {owners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select aria-label="State" className={SELECT} value={filter.state ?? ""} onChange={(e) => set("state", (e.target.value || null) as PartState | null)}>
          <option value="">Any state</option>
          {STATES.map((s) => <option key={s} value={s}>{STATE_WORD[s]}</option>)}
        </Select>
        <Select aria-label="Template" className={SELECT} value={filter.template ?? ""} onChange={(e) => set("template", e.target.value || null)}>
          <option value="">Any template</option>
          {templates.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        {folders.length > 0 ? (
          <Select aria-label="Folder" className={SELECT} value={filter.folder ?? ""} onChange={(e) => set("folder", e.target.value || null)}>
            <option value="">Any folder</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        ) : null}
        <span className="ml-auto text-13 text-secondary">{`${shown.length} of ${rows.length} parts`}</span>
      </div>
      {rows.length === 0 ? (
        <span className="py-10 text-center text-14 text-secondary">No parts yet. Create an asset and the board fills as people save.</span>
      ) : shown.length === 0 ? (
        <span className="py-10 text-center text-14 text-secondary">{mine ? "Nothing waits on you." : "No part matches these filters."}</span>
      ) : (
        <table className="w-full border-collapse text-14">
          <thead>
            <tr className="text-left text-12 text-secondary">
              {["Part", "Owner", "State", "Checks", "Whose move", "Waiting", "Last note", "Published"].map((h) => <th key={h} scope="col" className="border-b border-hairline pb-2 pr-4 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const owner = by(r.ownerId);
              const red = r.dots.filter((d) => d.status === "fail").length;
              return (
                <tr key={r.key} tabIndex={0} role="link" onClick={() => go.part(r.assetSlug, r.partName, project.slug)} onKeyDown={(e) => { if (e.key === "Enter") go.part(r.assetSlug, r.partName, project.slug); }} className="cursor-pointer border-b border-hairline transition-colors duration-150 hover:bg-raised focus-visible:bg-raised focus-visible:outline-none">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-heading">{r.assetName}</span><span className="text-muted">/</span><span className="text-heading">{r.partName}</span>
                      {r.template ? <span className="rounded-md bg-raised px-1.5 py-0.5 text-11 text-secondary">{r.template}</span> : null}
                      {r.folder ? <span className="text-12 text-muted">{r.folder}</span> : null}
                    </div>
                  </td>
                  <td className="py-3 pr-4">{r.ownerId ? <span className="inline-flex items-center gap-1.5"><PresenceAvatar initial={owner.initial} tone={owner.tone} size={18} />{firstName(owner.name)}</span> : <span className="text-muted">No owner</span>}</td>
                  <td className="py-3 pr-4"><span className="inline-flex items-center gap-1.5"><StateDot state={r.state} size={7} />{STATE_WORD[r.state]}</span></td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1" aria-label={r.dots.length === 0 ? "No checks yet" : red === 0 ? `${r.dots.length} checks green` : `${red} of ${r.dots.length} checks block`} title={r.dots.map((d) => `${d.name}: ${d.detail}`).join("\n")}>
                      {r.dots.map((d) => <span key={d.id} className="size-2.5 rounded-full" style={{ background: d.status === "pass" ? "var(--state-approved)" : d.status === "warn" ? "var(--state-syncing)" : "var(--state-failed)" }} />)}
                      {r.dots.length === 0 ? <span className="text-12 text-muted">none yet</span> : null}
                    </span>
                  </td>
                  <td className={cn("py-3 pr-4", r.move === "reviewers" ? "text-heading" : "text-secondary")}>{moveWord(r)}</td>
                  <td className="role-mono py-3 pr-4 text-secondary">{r.move === "done" ? "" : waitingLabel(r.waitingMs)}</td>
                  <td className="max-w-80 truncate py-3 pr-4 text-secondary">{r.lastNote || <span className="text-muted">No note yet</span>}</td>
                  <td className="role-mono py-3 text-muted">{r.publishedWhen}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-panel px-5 py-4">
      <span className="text-13 text-secondary">{label}</span>
      <span className="role-moment-md text-heading">{n}</span>
    </div>
  );
}
