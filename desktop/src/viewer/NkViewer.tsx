// A typed React wrapper over the nk-viewer web component. Attributes go on the element as the
// prototype passes them; the three custom events come back as callbacks. The element keeps its
// own WebGL context in the module pool, so this component never remounts it on a prop change.
import { useEffect, useRef } from "react";
import "./nk-viewer.js";
import type { NkPinDetail, NkPinSelectDetail } from "./nk-viewer.d.ts";

export interface Pin { id: string; pos: [number, number, number]; color?: string }

export interface NkViewerProps {
  src?: string;
  poster?: string;
  pins?: Pin[];
  activePin?: string | null;
  pinning?: boolean;
  ghost?: boolean;
  /** Degrees per frame scaled by OrbitControls; the prototype uses 0.5 on the stage. */
  autorotate?: number | false;
  hoverRotate?: boolean;
  bg?: string;
  className?: string;
  style?: React.CSSProperties;
  onLoaded?: () => void;
  onPin?: (pos: [number, number, number]) => void;
  onPinSelect?: (id: string) => void;
}

const flag = (on: boolean | undefined): string | undefined => (on ? "true" : undefined);

export function NkViewer({ src, poster, pins, activePin, pinning, ghost, autorotate, hoverRotate, bg = "transparent", className, style, onLoaded, onPin, onPinSelect }: NkViewerProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const loaded = () => onLoaded?.();
    const pin = (e: Event) => onPin?.((e as CustomEvent<NkPinDetail>).detail.pos);
    const select = (e: Event) => onPinSelect?.((e as CustomEvent<NkPinSelectDetail>).detail.id);
    el.addEventListener("nk-loaded", loaded);
    el.addEventListener("nk-pin", pin);
    el.addEventListener("nk-pin-select", select);
    return () => { el.removeEventListener("nk-loaded", loaded); el.removeEventListener("nk-pin", pin); el.removeEventListener("nk-pin-select", select); };
  }, [onLoaded, onPin, onPinSelect]);
  return (
    <nk-viewer
      ref={ref}
      className={className}
      style={style}
      src={src}
      poster={poster}
      pins={pins ? JSON.stringify(pins) : undefined}
      active-pin={activePin ?? undefined}
      pinning={flag(pinning)}
      ghost={flag(ghost)}
      autorotate={autorotate ? String(autorotate) : undefined}
      hover-rotate={flag(hoverRotate)}
      bg={bg}
    />
  );
}
