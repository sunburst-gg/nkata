// Name. "What should we call you?" Avatar, the name, Continue. Top right: Not {email}? Log out.
import { useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { CONTROL } from "@/components/Field";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { useGo } from "@/lib/hooks";
import { SetupFrame, Title } from "./Shell";

export function Name() {
  const me = useStore((s) => s.db.session.user);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const go = useGo();
  const [name, setName] = useState(me.name);
  const initial = (name.trim() || me.name || "?").charAt(0).toUpperCase();
  const studios = useStore((s) => s.db.session.studios);
  const submit = () => {
    const value = name.trim();
    if (!value) { toast("Enter your name.", "failed"); return; }
    source.setMe(value, me.email);
    if (studios.length === 0) go.studio(); else go.welcome();
  };
  return (
    <SetupFrame>
      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Title>What should we call you?</Title>
        <div className="flex items-center gap-4">
          <PresenceAvatar initial={initial} tone={me.tone} size={56} />
          <button type="button" onClick={() => toast("Photos arrive with the next release.", "muted")} className="cursor-pointer border-0 bg-transparent p-0 text-13 text-secondary underline underline-offset-[3px] hover:text-heading">Upload a photo</button>
        </div>
        <div className="flex flex-col gap-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" className={CONTROL} />
          <Button type="submit" size="lg" variant="primary">Continue</Button>
        </div>
      </form>
    </SetupFrame>
  );
}
