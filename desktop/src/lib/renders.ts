// The five compound renders, bundled by Vite as hashed WebP. 1600 px for previews, 480 px for tiles.
import type { Render, RenderKey } from "@/data/types";
import groundFull from "@/assets/renders/compound-ground.webp";
import groundTile from "@/assets/renders/compound-ground-tile.webp";
import overviewFull from "@/assets/renders/compound-overview.webp";
import overviewTile from "@/assets/renders/compound-overview-tile.webp";
import interiorFull from "@/assets/renders/compound-interior.webp";
import interiorTile from "@/assets/renders/compound-interior-tile.webp";
import courtyardFull from "@/assets/renders/compound-courtyard.webp";
import courtyardTile from "@/assets/renders/compound-courtyard-tile.webp";
import treeFull from "@/assets/renders/compound-tree.webp";
import treeTile from "@/assets/renders/compound-tree-tile.webp";

const FULL: Record<RenderKey, string> = { ground: groundFull, overview: overviewFull, interior: interiorFull, courtyard: courtyardFull, tree: treeFull };
const TILE: Record<RenderKey, string> = { ground: groundTile, overview: overviewTile, interior: interiorTile, courtyard: courtyardTile, tree: treeTile };

export function renderUrl(key: RenderKey, size: "full" | "tile" = "full"): string {
  return size === "tile" ? TILE[key] : FULL[key];
}

/** Inline style for a cropped render background. */
export function renderStyle(render: Render, size: "full" | "tile" = "full"): React.CSSProperties {
  return { backgroundImage: `url(${renderUrl(render.key, size)})`, backgroundSize: "cover", backgroundPosition: render.pos, backgroundColor: "var(--preview-bg)" };
}
