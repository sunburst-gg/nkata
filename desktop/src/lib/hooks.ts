import { useNavigate, useParams } from "react-router";
import { useStore } from "@/store";
import type { Asset, Part, Person, Project } from "@/data/types";

export function usePeople() {
  const people = useStore((s) => s.db.people);
  return { people, by: (id: string): Person => people.find((p) => p.id === id) ?? people[0]! };
}

export function useProject(): Project {
  const { project } = useParams();
  const studio = useStore((s) => s.db.session.studio);
  return studio.projects.find((p) => p.slug === project) ?? studio.projects[0]!;
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

export function useGo() {
  const navigate = useNavigate();
  const project = useStore((s) => s.db.session.studio.projects[0]!.slug);
  return {
    home: () => navigate("/home"),
    signin: () => navigate("/signin"),
    profile: () => navigate("/profile"),
    project: (slug = project) => navigate(`/p/${slug}`),
    asset: (slug: string, p = project) => navigate(`/p/${p}/a/${slug}`),
    part: (asset: string, part: string, p = project) => navigate(`/p/${p}/a/${asset}/${part}`),
    changes: (p = project) => navigate(`/p/${p}/changes`),
    people: (p = project) => navigate(`/p/${p}/people`),
    templates: (p = project) => navigate(`/p/${p}/templates`),
    settings: (p = project) => navigate(`/p/${p}/settings`),
    create: (step = 1) => navigate(`/new/${step}`),
    to: (path: string) => navigate(path),
  };
}
