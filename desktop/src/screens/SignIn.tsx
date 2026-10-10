// Sign in. Centered: the mark, serif "Welcome to Nkata", the email, Continue, and one line about
// the link and the terms. The mock continues to Name. The desktop app sends the magic link to the
// server, redeems it, and enters the studio (docs/decisions.md, 2026-10-10: no Google button yet).
import { useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { CONTROL, Field } from "@/components/Field";
import { Mark } from "@/components/Mark";
import { DEFAULT_SERVER_URL, enterAccount, redeem, requestLink, routeFor, tokenFromLink, useMock } from "@/data/boot";
import { useGo } from "@/lib/hooks";

export function SignIn() {
  const mock = useMock();
  const signIn = useStore((s) => s.signIn);
  const useSource = useStore((s) => s.useSource);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const me = useStore((s) => s.db.session.user);
  const go = useGo();
  const [email, setEmail] = useState(mock ? me.email : "");
  const [serverUrl, setServerUrl] = useState(() => { try { return localStorage.getItem("nkata.server") ?? DEFAULT_SERVER_URL; } catch { return DEFAULT_SERVER_URL; } });
  const [link, setLink] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const fail = (err: unknown) => toast(err instanceof Error ? err.message : "Something went wrong.", "failed");

  const enter = async (value: string) => {
    setBusy(true);
    try {
      const account = await redeem(serverUrl, tokenFromLink(value));
      const source = await enterAccount(serverUrl, account, theme);
      useSource(source);
      go.to(routeFor(source));
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (mock) { signIn("artist"); go.name(); return; }
    if (!email.trim()) { toast("Enter your email.", "failed"); return; }
    setBusy(true);
    try {
      try { localStorage.setItem("nkata.server", serverUrl); } catch { /* storage can be blocked */ }
      const devLink = await requestLink(serverUrl, email.trim());
      if (devLink) await enter(devLink); else setSent(true);
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-[360px] flex-col items-center gap-8">
        <Mark size={40} />
        <h1 className="role-moment-lg m-0 text-center text-heading">Welcome to Nkata</h1>
        {sent ? (
          <form className="flex w-full flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void enter(link); }}>
            <span className="text-center text-14 text-secondary">A link went to {email}. Open it, or paste it here.</span>
            <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the link" aria-label="Sign-in link" className={CONTROL} />
            <Button type="submit" size="lg" variant="primary" loading={busy}>Continue</Button>
          </form>
        ) : (
          <form className="flex w-full flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Field label="Email address" className="text-heading"><input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" className={CONTROL} /></Field>
            {mock ? null : <Field label="Server"><input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} aria-label="Server" className={`${CONTROL} font-mono text-13`} /></Field>}
            <Button type="submit" size="lg" variant="primary" loading={busy}>Continue</Button>
          </form>
        )}
        <span className="text-center text-13 leading-[1.5] text-secondary">We will email you a link. By continuing you agree to Nkata's <a href="#" className="underline underline-offset-[3px]">Terms</a> and <a href="#" className="underline underline-offset-[3px]">Privacy</a>.</span>
      </div>
    </div>
  );
}
