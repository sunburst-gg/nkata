// Sign in. Centered: the mark, serif "Welcome to Nkata", the email, Continue, and one line about
// the code and the terms. Then the code screen: six digits from the email. The desktop app asks
// the server for the code and signs in with it; a dev server hands the code back, so the field
// is filled. The mock accepts any six digits (docs/decisions.md, 2026-10-10: no Google button yet).
import { useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { CONTROL, Field } from "@/components/Field";
import { Mark } from "@/components/Mark";
import { DEFAULT_SERVER_URL, enterAccount, redeemCode, requestCode, routeFor, useMock } from "@/data/boot";
import { cn } from "@/lib/cn";
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
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const fail = (err: unknown) => toast(err instanceof Error ? err.message : "Something went wrong.", "failed");

  const send = async () => {
    const value = email.trim().toLowerCase();
    if (!value.includes("@")) { toast("Enter your email.", "failed"); return; }
    if (mock) { setCode(""); setStep("code"); return; }
    setBusy(true);
    try {
      try { localStorage.setItem("nkata.server", serverUrl); } catch { /* storage can be blocked */ }
      const sent = await requestCode(serverUrl, value);
      setCode(sent.code ?? "");
      setStep("code");
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const enter = async () => {
    if (!/^\d{6}$/.test(code)) { toast("Enter the six digits from the email.", "failed"); return; }
    if (mock) { signIn("artist"); go.name(); return; }
    setBusy(true);
    try {
      const account = await redeemCode(serverUrl, email.trim().toLowerCase(), code);
      const source = await enterAccount(serverUrl, account, theme);
      useSource(source);
      go.to(routeFor(source));
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-[360px] flex-col items-center gap-8">
        <Mark size={40} />
        {step === "email" ? (
          <>
            <h1 className="role-moment-lg m-0 text-center text-heading">Welcome to Nkata</h1>
            <form className="flex w-full flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <Field label="Email address" className="text-heading"><input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" className={CONTROL} /></Field>
              {mock ? null : <Field label="Server"><input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} aria-label="Server" className={`${CONTROL} font-mono text-13`} /></Field>}
              <Button type="submit" size="lg" variant="primary" loading={busy}>Continue</Button>
            </form>
            <span className="text-center text-13 leading-[1.5] text-secondary">We will email you a code. By continuing you agree to Nkata's <a href="#" className="underline underline-offset-[3px]">Terms</a> and <a href="#" className="underline underline-offset-[3px]">Privacy</a>.</span>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <h1 className="role-moment m-0 text-center text-heading">Enter the code</h1>
              <span className="text-center text-14 text-secondary">We sent six digits to {email.trim().toLowerCase()}. It works for 15 minutes.</span>
            </div>
            <form className="flex w-full flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void enter(); }}>
              <CodeInput value={code} onChange={setCode} />
              <Button type="submit" size="lg" variant="primary" loading={busy}>Continue</Button>
            </form>
            <div className="flex flex-col items-center gap-2 text-13 text-secondary">
              <button type="button" onClick={() => void send()} className="cursor-pointer border-0 bg-transparent p-0 text-13 text-secondary underline underline-offset-[3px] hover:text-heading">Send a new code</button>
              <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="cursor-pointer border-0 bg-transparent p-0 text-13 text-secondary hover:text-heading">Not {email.trim().toLowerCase()}? Use another email</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Six boxes over one input, so paste and the keyboard both work. */
export function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  return (
    <label className="relative block h-14 cursor-text">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Six digit code"
        className="absolute inset-0 h-full w-full border-0 bg-transparent text-transparent caret-transparent outline-none focus-visible:shadow-none"
      />
      <span aria-hidden="true" className="pointer-events-none grid h-full grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <span key={i} className={cn("flex items-center justify-center rounded-[10px] border bg-panel font-mono text-20 text-heading transition-colors duration-150", value.length === i || (i === 5 && value.length === 6) ? "border-accent" : "border-border")}>{d.trim()}</span>
        ))}
      </span>
    </label>
  );
}
