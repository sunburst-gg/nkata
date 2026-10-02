// Every component with every state, for review against reference/Nkata Components.dc.html.
import type { ComponentType } from "react";
import { AccountMenuStates } from "@/components/AccountMenu.states";
import { ActivityRailStates } from "@/components/ActivityRail.states";
import { AskFieldStates } from "@/components/AskField.states";
import { AssetTileStates } from "@/components/AssetTile.states";
import { BreadcrumbStates } from "@/components/Breadcrumb.states";
import { ButtonStates } from "@/components/Button.states";
import { CheckRowStates } from "@/components/CheckRow.states";
import { CommentPinStates } from "@/components/CommentPin.states";
import { CommentThreadStates } from "@/components/CommentThread.states";
import { DialogStates } from "@/components/Dialog.states";
import { DigestRenderPairStates } from "@/components/DigestRenderPair.states";
import { EmptyPreviewStates } from "@/components/EmptyPreview.states";
import { FilterChipStates } from "@/components/FilterChip.states";
import { InputStates } from "@/components/Input.states";
import { InviteSheetStates } from "@/components/InviteSheet.states";
import { LockBadgeStates } from "@/components/LockBadge.states";
import { MarkStates } from "@/components/Mark.states";
import { MirrorStatusStates } from "@/components/MirrorStatus.states";
import { PartThumbStates } from "@/components/PartThumb.states";
import { PresenceAvatarStates } from "@/components/PresenceAvatar.states";
import { ProjectMenuStates } from "@/components/ProjectMenu.states";
import { RolePickerStates } from "@/components/RolePicker.states";
import { RotatablePreviewStates } from "@/components/RotatablePreview.states";
import { StateBadgeStates } from "@/components/StateBadge.states";
import { TabsStates } from "@/components/Tabs.states";
import { TemplatePartRowStates } from "@/components/TemplatePartRow.states";
import { ToastStates } from "@/components/Toast.states";
import { TooltipStates } from "@/components/Tooltip.states";
import { VersionThumbStates } from "@/components/VersionThumb.states";

const SECTIONS: [string, ComponentType][] = [
  ["Mark", MarkStates], ["Button", ButtonStates], ["Input", InputStates], ["AskField", AskFieldStates], ["FilterChip", FilterChipStates], ["Tabs", TabsStates],
  ["Dialog", DialogStates], ["Toast", ToastStates], ["Tooltip", TooltipStates], ["StateBadge", StateBadgeStates], ["MirrorStatus", MirrorStatusStates],
  ["PresenceAvatar · AvatarStack", PresenceAvatarStates], ["LockBadge", LockBadgeStates], ["AssetTile", AssetTileStates], ["PartThumb", PartThumbStates],
  ["VersionThumb", VersionThumbStates], ["CheckRow", CheckRowStates], ["CommentPin", CommentPinStates], ["CommentThread", CommentThreadStates],
  ["ActivityRail", ActivityRailStates], ["Breadcrumb", BreadcrumbStates], ["ProjectMenu", ProjectMenuStates], ["AccountMenu", AccountMenuStates],
  ["InviteSheet", InviteSheetStates], ["RolePicker", RolePickerStates], ["RotatablePreview", RotatablePreviewStates], ["EmptyPreview", EmptyPreviewStates],
  ["DigestRenderPair", DigestRenderPairStates], ["TemplatePartRow", TemplatePartRowStates],
];

export function States() {
  return (
    <div className="flex flex-1 flex-col gap-14 overflow-auto px-10 pb-30 pt-16">
      <h1 className="role-section m-0">Every component, every state.</h1>
      {SECTIONS.map(([name, C]) => (
        <section key={name} className="flex flex-col gap-5">
          <div className="flex items-baseline gap-4 border-b border-hairline pb-3"><span className="role-asset-title">{name}</span></div>
          <C />
        </section>
      ))}
    </div>
  );
}
