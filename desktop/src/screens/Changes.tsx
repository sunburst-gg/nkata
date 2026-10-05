// What changed. The weekly digest: renders side by side with the week before, assets that moved
// state, and comments added. A viewer can make it their home.
import { t } from "@/copy/en";
import { useCan, useStore } from "@/store";
import { DigestRenderPair } from "@/components/DigestRenderPair";
import { PersonAvatar } from "@/components/PresenceAvatar";
import { StateDot } from "@/components/StateBadge";
import { cn } from "@/lib/cn";
import { renderStyle } from "@/lib/renders";
import { STATE_WORD } from "@/lib/state";
import { useGo, usePeople, useProject } from "@/lib/hooks";
import { ScreenHead } from "./Shell";

export function Changes() {
  const project = useProject();
  const digests = useStore((s) => s.db.digests);
  const index = useStore((s) => s.db.digestIndex);
  const digestHome = useStore((s) => s.db.session.digestHome);
  const source = useStore((s) => s.source);
  const can = useCan();
  const { by } = usePeople();
  const go = useGo();
  const d = digests[index]!;
  const linkCls = (on: boolean) => cn("whitespace-nowrap text-13", on ? "text-secondary hover:text-heading" : "text-disabled");
  return (
    <div className="flex max-w-310 flex-col gap-12">
      <ScreenHead title={t("changes.title")} line={`${d.weekLabel} · ${d.changed} changed · ${d.moved} moved state · ${d.notes} new notes`} actions={<div className="flex items-center gap-4">{d.hasPrevious ? <button type="button" className={linkCls(true)} onClick={() => source.setDigestIndex(index + 1)}>Previous week</button> : <span className={linkCls(false)}>Previous week</span>}{d.hasNext ? <button type="button" className={linkCls(true)} onClick={() => source.setDigestIndex(index - 1)}>Next week</button> : <span className={linkCls(false)}>Next week</span>}</div>} />
      <div className="flex flex-col gap-5">
        <span className="text-20 font-semibold tracking-[-0.01em]">New renders</span>
        <div className="grid grid-cols-2 gap-8">{d.renderPairs.map((p) => <DigestRenderPair key={p.assetSlug} pair={p} onOpen={() => go.asset(p.assetSlug, project.slug)} />)}</div>
      </div>
      <div className="grid grid-cols-2 items-start gap-12">
        <div className="flex flex-col gap-4">
          <span className="text-20 font-semibold tracking-[-0.01em]">Moved</span>
          {d.moves.map((m) => (
            <button type="button" key={m.name} onClick={() => go.asset(m.assetSlug, project.slug)} className="flex items-center gap-4 text-left outline-none focus-visible:shadow-focus rounded-md">
              <div className="w-18 shrink-0 rounded-md bg-panel" style={{ aspectRatio: "4/3", ...(m.render ? renderStyle(m.render, "tile") : {}) }} />
              <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="font-medium">{m.name}</span><span className="inline-flex items-center gap-2 text-13 text-secondary"><StateDot state={m.from} />{STATE_WORD[m.from]}<span className="text-disabled">to</span><StateDot state={m.to} />{STATE_WORD[m.to]}</span></div>
              <span className="role-mono whitespace-nowrap text-muted">{m.when}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <span className="text-20 font-semibold tracking-[-0.01em]">Notes</span>
          {d.weekNotes.map((n, i) => { const p = by(n.personId); return (
            <div key={i} className="flex gap-3"><PersonAvatar person={p} size={28} /><div className="flex flex-col gap-0.75 leading-[1.45]"><span><span className="font-medium">{p.name.split(" ")[0]}</span> <span className="text-muted">on {n.on} · {n.when}</span></span><span className="text-body">{n.text}</span></div></div>
          ); })}
        </div>
      </div>
      {can("setDigestHome") ? (
        <label className="flex items-center gap-3 text-13 text-secondary">
          <button type="button" role="switch" aria-checked={digestHome} onClick={() => source.setDigestHome(!digestHome)} className={cn("relative h-4.5 w-8 rounded-full transition-colors duration-150 outline-none focus-visible:shadow-focus", digestHome ? "bg-accent" : "bg-active")}>
            <span aria-hidden="true" className="absolute top-0.5 size-3.5 rounded-full bg-[var(--avatar-fg)] transition-[left] duration-150" style={{ left: digestHome ? 16 : 2 }} />
          </button>
          {t("digest.home")}
        </label>
      ) : null}
    </div>
  );
}
