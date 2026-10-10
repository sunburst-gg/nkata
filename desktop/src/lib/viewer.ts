// The viewer session: which comments the model shows as pins, the pin being placed, and posting.
// Shared by the asset screen, the part screen, and the full screen reviewer, so a pin dropped in
// one is the same pin in the others (handoff/v3/CLAUDE_CODE_PROMPT_v3.md, Full screen review).
import { useStore } from "@/store";
import type { Asset, Comment, Part } from "@/data/types";
import type { ViewerPin } from "@/components/ModelViewer/nk-viewer";
import { renderUrl } from "./renders";
import { SAMPLE_MODEL } from "@/data/mock";
import { firstName, usePeople } from "./hooks";

export const PENDING = "pending";

export interface ViewerSession {
  comments: Comment[];
  pins: ViewerPin[];
  activePin: string | null;
  pinNo: (c: Comment) => number;
  nextPinNo: number;
  /** The GLB the add-on exported, or null when the asset has no model yet. */
  src: string | null;
  poster: string | undefined;
  post: () => void;
  cancel: () => void;
}

/** Comments and pins for an asset, or for one of its parts. */
export function useViewerSession(asset: Asset, part?: Part): ViewerSession {
  const pendingPin = useStore((s) => s.pendingPin);
  const activePin = useStore((s) => s.activePin);
  const draft = useStore((s) => s.draft);
  const { by } = usePeople();
  const comments = part ? part.comments : asset.parts.flatMap((p) => p.comments);
  const pinned = comments.filter((c) => c.pos);
  const pins: ViewerPin[] = pinned.map((c) => ({ id: c.id, pos: c.pos! }));
  if (pendingPin) pins.push({ id: PENDING, pos: pendingPin });
  const render = part ? part.versions[0]?.render ?? part.render : asset.render;
  const target = part ?? asset.parts[0];
  return {
    comments,
    pins,
    activePin: pendingPin ? PENDING : activePin,
    pinNo: (c) => pinned.indexOf(c) + 1,
    nextPinNo: pinned.length + 1,
    src: asset.model ?? (asset.render ? SAMPLE_MODEL : null),
    poster: render ? renderUrl(render.key) : undefined,
    post: () => {
      const text = draft.trim();
      if (!text || !target) return;
      const st = useStore.getState();
      const made = st.source.addComment(asset.slug, target.name, text, pendingPin ?? undefined);
      useStore.setState({ pendingPin: null, draft: "", pinning: false, activePin: made.pos ? made.id : null });
      st.toast(made.pos ? `Pinned. ${firstName(by(target.ownerId).name)} will see it in Blender.` : "Comment posted.");
    },
    cancel: () => useStore.setState({ pendingPin: null, draft: "" }),
  };
}
