// Tool logos for the Connections cards. Bundled SVGs (src/assets/logos, CC0 from Simple Icons)
// on the tile color the prototype gives each tool. Substance has no mark yet and shows its initial.
import type { ConnectionId } from "@/data/types";
import blender from "@/assets/logos/blender.svg";
import discord from "@/assets/logos/discord.svg";
import godot from "@/assets/logos/godot.svg";
import houdini from "@/assets/logos/houdini.svg";
import linear from "@/assets/logos/linear.svg";
import maya from "@/assets/logos/maya.svg";
import unity from "@/assets/logos/unity.svg";
import unreal from "@/assets/logos/unreal.svg";

const LOGO: Partial<Record<ConnectionId, string>> = { blender, unreal, discord, linear, maya, houdini, unity, godot };
/** The tile behind the mark: the editor greys and Discord's blurple come from the token files. */
const TILE: Partial<Record<ConnectionId, string>> = { blender: "var(--editor-blender-bg)", unreal: "var(--editor-ue-bg)", discord: "var(--brand-discord)" };

export function ToolLogo({ id, name, size = 44 }: { id: ConnectionId; name: string; size?: number }) {
  const src = LOGO[id];
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-mono text-14 font-medium text-secondary" style={{ width: size, height: size, background: TILE[id] ?? "var(--bg-raised)" }}>
      {src ? <img src={src} alt="" width={size / 2} height={size / 2} draggable={false} /> : name.charAt(0)}
    </span>
  );
}
