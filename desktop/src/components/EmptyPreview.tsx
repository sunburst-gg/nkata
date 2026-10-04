// EmptyPreview. No render yet: the owner's face and name, and when the render will appear.
import type { Person } from "@/data/types";
import { t } from "@/copy/en";
import { cn } from "@/lib/cn";
import { PersonAvatar } from "./PresenceAvatar";

export interface EmptyPreviewProps {
  owner: Person;
  assetName: string;
  aspect?: "16/9" | "16/10";
  className?: string;
}

const PRONOUN: Record<string, string> = { ada: "she", ngozi: "she", funmi: "she", tobe: "he" };

export function EmptyPreview({ owner, assetName, aspect = "16/9", className }: EmptyPreviewProps) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center gap-3.5 rounded-xl border border-hairline bg-panel text-center", aspect === "16/9" ? "aspect-[16/9]" : "aspect-[16/10]", className)}>
      <PersonAvatar person={owner} size={48} />
      <span className="text-16 font-medium">{t("preview.none")}</span>
      <span className="text-13 text-secondary">{t("preview.none.when", { name: owner.name.split(" ")[0] ?? owner.name, asset: assetName, pronoun: PRONOUN[owner.id] ?? "they" })}</span>
    </div>
  );
}
