// Create your studio: the name and the one Training toggle, on by default. No plans anywhere.
import { useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { CONTROL, Field, Switch } from "@/components/Field";
import { createServerStudio, routeFor } from "@/data/boot";
import type { Training } from "@/data/types";
import { useGo } from "@/lib/hooks";
import { SetupFrame, Title } from "./Shell";
import { reasonOf } from "@/lib/reason";

export const TRAINING_LINE: Record<Training, string> = {
  on: "Nkata is free. Your team's work in Blender and Unreal teaches Nok how experts build games.",
  off: "Nkata bills your studio per seat each month. Nothing your team makes is used for training.",
};

export function TrainingCard({ training, onChange, line, changedLine }: { training: Training; onChange?: (t: Training) => void; line?: string; changedLine?: string }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-1 flex-col gap-1">
        <span className="font-medium text-heading">Training {training}</span>
        <span className="text-13 leading-[1.5] text-secondary">{changedLine ?? line ?? TRAINING_LINE[training]}</span>
      </div>
      {onChange ? <Switch on={training === "on"} onChange={(on) => onChange(on ? "on" : "off")} label="Training" /> : null}
    </div>
  );
}

export function CreateStudio() {
  const source = useStore((s) => s.source);
  const serverMode = useStore((s) => s.serverMode);
  const useSource = useStore((s) => s.useSource);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const go = useGo();
  const [name, setName] = useState("");
  const [training, setTraining] = useState<Training>("on");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const value = name.trim();
    if (!value) { toast("Name your studio.", "failed"); return; }
    setBusy(true);
    try {
      if (serverMode) {
        const next = await createServerStudio(value, training, theme);
        useSource(next);
        go.to(routeFor(next));
      } else {
        await source.createStudio(value, training);
        go.welcome();
      }
    } catch (err) {
      toast(reasonOf(err, "Could not create the studio."), "failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SetupFrame width={560}>
      <form className="flex flex-col gap-7" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="flex flex-col gap-2"><Title>Create your studio</Title><span className="text-secondary">A shared space for your team's games.</span></div>
        <Field label="Studio name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunburst" aria-label="Studio name" className={CONTROL} /></Field>
        <div className="flex flex-col gap-2">
          <span className="text-13 text-secondary">Training</span>
          <TrainingCard training={training} onChange={setTraining} />
          <span className="text-13 text-muted">Same features either way. Change it any time in Settings.</span>
        </div>
        <Button type="submit" size="lg" variant="primary" className="self-start" loading={busy}>Create studio</Button>
      </form>
    </SetupFrame>
  );
}
