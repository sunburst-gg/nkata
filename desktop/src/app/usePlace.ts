// Where the open project lives on this computer, for the wall's next step on live data. The mock
// keeps the prototype's buttons; live data says the real place, or sends the person to choose one.
import { useStore } from "@/app/store";
import { LiveDataSource } from "@/data/live/LiveDataSource";

export function usePlace(): { live: boolean; place: string | null } {
  const source = useStore((s) => s.source);
  const projectId = useStore((s) => s.projectId);
  const live = source instanceof LiveDataSource;
  return { live, place: live && projectId ? source.projectFolder(projectId) : null };
}
