// ModelViewer: the React boundary around the nk-viewer web component. Screens pass a GLB, a
// poster, the pins, and get back pin events. The renderer behind it can be swapped later.
import { useEffect, useRef, type CSSProperties } from "react";
import type { ViewerPin } from "./nk-viewer";

export interface ModelViewerProps {
  /** The GLB the Blender add-on exported for this version. */
  src: string;
  /** The latest render, shown until the model is in and behind a model that did not load. */
  poster?: string;
  pins?: ViewerPin[];
  activePin?: string | null;
  pinning?: boolean;
  onPin?: (pos: [number, number, number]) => void;
  onPinSelect?: (id: string) => void;
  onLoaded?: () => void;
  /** Orbit around the model, or walk it first person. The viewer ends walking on Esc. */
  mode?: "orbit" | "walk";
  onWalkEnd?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ModelViewer({ src, poster, pins = [], activePin = null, pinning = false, onPin, onPinSelect, onLoaded, mode = "orbit", onWalkEnd, className, style }: ModelViewerProps) {
  const ref = useRef<HTMLElement | null>(null);
  const handlers = useRef({ onPin, onPinSelect, onLoaded, onWalkEnd });
  handlers.current = { onPin, onPinSelect, onLoaded, onWalkEnd };

  useEffect(() => {
    // The element is defined on the client only. Server rendering (the viewer DOM test) draws the poster.
    void import("./nk-viewer").then((m) => m.defineViewer());
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pin = (e: Event) => handlers.current.onPin?.((e as CustomEvent<{ pos: [number, number, number] }>).detail.pos);
    const select = (e: Event) => handlers.current.onPinSelect?.((e as CustomEvent<{ id: string }>).detail.id);
    const loaded = () => handlers.current.onLoaded?.();
    const walkEnd = () => handlers.current.onWalkEnd?.();
    el.addEventListener("nk-pin", pin);
    el.addEventListener("nk-pin-select", select);
    el.addEventListener("nk-loaded", loaded);
    el.addEventListener("nk-walk-end", walkEnd);
    return () => {
      el.removeEventListener("nk-pin", pin);
      el.removeEventListener("nk-pin-select", select);
      el.removeEventListener("nk-loaded", loaded);
      el.removeEventListener("nk-walk-end", walkEnd);
    };
  }, []);

  // React 19 passes unknown props to custom elements as attributes when they are strings.
  return (
    // @ts-expect-error nk-viewer is a custom element registered at runtime; see nk-viewer.ts.
    <nk-viewer
      ref={ref}
      src={src}
      poster={poster ?? ""}
      pins={JSON.stringify(pins)}
      active-pin={activePin ?? ""}
      pinning={pinning ? "true" : "false"}
      mode={mode}
      class={className}
      style={style}
      aria-label="3D model. Drag to orbit, scroll to zoom, right drag to pan."
      role="img"
    />
  );
}
