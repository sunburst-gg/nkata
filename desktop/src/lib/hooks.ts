import { useNavigate, useParams } from "react-router";
import { useStore } from "@/store";
import type { Asset, Part, Person, Project } from "@/data/types";

/** The server's switches. `unreal` false means Unreal is Coming soon: no mirror, no Unreal words. */
export function useFeatures(): { unreal: boolean } {
  return useStore((s) => s.db.session.features);
}

export function usePeople() {
  const people = useStore((s) => s.db.people);
  const me = useStore((s) => s.db.session.user);
  return { people, by: (id: string): Person => people.find((p) => p.id === id) ?? (id === me.id ? me : people[0] ?? me) };
}

/** The project in the URL, or the first one. Undefined before any project exists. */
export function useProject(): Project | undefined {
  const { project } = useParams();
  const studio = useStore((s) => s.db.session.studio);
  return studio.projects.find((p) => p.slug === project) ?? studio.projects[0];
}

export function useAsset(): Asset | undefined {
  const { asset } = useParams();
  const assets = useStore((s) => s.db.assets);
  return assets.find((a) => a.slug === asset);
}

export function usePart(): { asset: Asset; part: Part } | undefined {
  const { part } = useParams();
  const asset = useAsset();
  const p = asset?.parts.find((x) => x.name === part);
  return asset && p ? { asset, part: p } : undefined;
}

export type SettingsTab = "account" | "general" | "members" | "billing" | "training" | "connections" | "mcp" | "agents";

export function useGo() {
  const navigate = useNavigate();
  const first = useStore((s) => s.db.session.studio.projects[0]?.slug ?? "");
  return {
    signin: () => navigate("/signin"),
    name: () => navigate("/name"),
    studio: () => navigate("/studio"),
    welcome: () => navigate("/welcome"),
    newProject: () => navigate("/new"),
    project: (slug = first) => navigate(`/p/${slug}`),
    asset: (slug: string, p = first) => navigate(`/p/${p}/a/${slug}`),
    part: (asset: string, part: string, p = first) => navigate(`/p/${p}/a/${asset}/${part}`),
    connections: () => navigate("/connections"),
    mentions: () => navigate("/mentions"),
    settings: (tab: SettingsTab = "account") => navigate(`/settings/${tab}`),
    to: (path: string) => navigate(path),
  };
}

/** The first word of a name: "Ada" from "Ada Okafor". */
export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}
