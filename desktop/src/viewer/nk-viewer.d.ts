// The web component's attributes as React sees them. The element is defined by importing
// ./nk-viewer.js once (NkViewer.tsx does it).
import type { DetailedHTMLProps, HTMLAttributes } from "react";

export interface NkViewerAttributes extends HTMLAttributes<HTMLElement> {
  src?: string;
  poster?: string;
  pins?: string;
  "active-pin"?: string;
  pinning?: string;
  ghost?: string;
  autorotate?: string;
  "hover-rotate"?: string;
  bg?: string;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "nk-viewer": DetailedHTMLProps<NkViewerAttributes, HTMLElement>;
    }
  }
}

export interface NkPinDetail { pos: [number, number, number] }
export interface NkPinSelectDetail { id: string }
