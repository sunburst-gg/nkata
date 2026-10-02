// AssetTile. At least 280 wide. Last render 16:10, one small state pill, faces of who is in it now.
// Title 16/500, meta 13. No preview: the owner's face and name.
import type { Asset, Person } from "@/data/types";
import { cn } from "@/lib/cn";
import { renderStyle } from "@/lib/renders";
import { AvatarStack, PersonAvatar } from "./PresenceAvatar";
import { StateBadge } from "./StateBadge";

export interface AssetTileProps {
  asset: Asset;
  people: Person[];
  owner: Person;
  onOpen?: () => void;
  className?: string;
}

export function AssetTile({ asset, people, owner, onOpen, className }: AssetTileProps) {
  return (
    <button type="button" onClick={onOpen} className={cn("group flex flex-col gap-3 text-left outline-none focus-visible:shadow-focus rounded-xl", className)}>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-hairline bg-panel transition-colors duration-150 group-hover:border-border">
        {asset.render ? <div aria-hidden="true" className="absolute inset-0" style={renderStyle(asset.render, "tile")} /> : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <PersonAvatar person={owner} size={32} />
            <span className="text-13 text-secondary">No preview yet · {owner.name.split(" ")[0]}</span>
          </div>
        )}
        <StateBadge state={asset.state} variant="pill" size="sm" className="absolute left-3 top-3" />
        {people.length ? <span className="absolute bottom-3 right-3 flex"><AvatarStack people={people} size={24} ring="var(--scrim-strong)" /></span> : null}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <span className="text-16 font-medium text-heading">{asset.name}</span>
        <span className="text-13 text-secondary">{asset.meta}</span>
      </div>
    </button>
  );
}
