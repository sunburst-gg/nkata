// Sign in: email, then the six-box code. The lit stage with the ghost model sits behind the form
// like the zero state. Wrong code: the boxes shake once and go red; five wrong tries use the code
// up. "Not {email}? Use another email" goes back. Name and Create studio open only when needed.
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/app/store";
import { GHOST_MODEL } from "@/ui/stage/GhostStage";
import { Mark } from "@/ui/stage/Mark";
import { Stage } from "@/ui/stage/Stage";
import { NkViewer } from "@/viewer/NkViewer";
import { toast } from "@/ui/toast/toast";
import { landLive } from "@/app/bootLive";
import { LiveDataSource } from "@/data/live/LiveDataSource";

const field: React.CSSProperties = { height: 48, borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: "0 14px", fontSize: 17, color: "var(--ink)", outline: "none" };
const cta: React.CSSProperties = { height: 44, borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer" };
const quiet: React.CSSProperties = { border: 0, background: "transparent", padding: 0, font: "400 13px var(--sans)", color: "var(--ink60)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 };

export function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, var(--stage-top), var(--stage-bot))" }}>
      <Stage grid={48} radius={16} aspect="auto" style={{ position: "absolute", inset: 0, borderRadius: 0, background: "transparent" }}>
        <NkViewer src={GHOST_MODEL} ghost autorotate={0.4} style={{ position: "absolute", inset: 0, opacity: .7 }} />
      </Stage>
      <div style={{ position: "relative", width: 420, display: "flex", flexDirection: "column", gap: 24, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 32 }}>{children}</div>
    </div>
  );
}

export function SignIn() {
  const source = useStore((s) => s.source);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verdict, setVerdict] = useState<"ok" | "wrong" | "usedUp">("ok");
  const [busy, setBusy] = useState(false);
  const clean = email.trim().toLowerCase();
  const send = async () => {
    if (!clean.includes("@") || !source) { toast("Enter your email.", "var(--bad)"); return; }
    setBusy(true);
    try { const sent = await source.requestCode(clean); setCode(sent.code ?? ""); setVerdict("ok"); setStep("code"); } finally { setBusy(false); }
  };
  const enter = async () => {
    if (!/^\d{6}$/.test(code) || !source) return;
    setBusy(true);
    try {
      const me = await source.redeemCode(clean, code);
      if (source instanceof LiveDataSource) { await landLive(source); return; }
      useStore.setState({ me });
      await useStore.getState().refresh();
      const { studio } = useStore.getState();
      useStore.setState({ screen: !me.name ? "name" : !studio ? "zeroStudio" : "project" });
    } catch (err) {
      const used = err instanceof Error && err.message === "used up";
      setVerdict(used ? "usedUp" : "wrong");
      if (!used) setCode("");
    } finally { setBusy(false); }
  };
  return (
    <Backdrop>
      <Mark size={24} />
      {step === "email" ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <label htmlFor="email" style={{ font: "400 28px/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Welcome to Nkata.</label>
          <input id="email" autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" style={field} />
          <button type="submit" style={cta} aria-busy={busy}>Continue</button>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>We will email you a code.</span>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void enter(); }} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ font: "400 28px/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Enter the code.</span>
            <span style={{ fontSize: 13, color: "var(--ink60)" }}>We sent six digits to {clean}. It works for 15 minutes.</span>
          </div>
          <CodeInput value={code} onChange={(v) => { setCode(v); if (verdict === "wrong") setVerdict("ok"); }} wrong={verdict === "wrong"} usedUp={verdict === "usedUp"} />
          {verdict === "wrong" ? <span role="alert" style={{ fontSize: 13, color: "var(--bad)" }}>That code is not right, or it expired. Ask for a new one.</span> : null}
          {verdict === "usedUp" ? <span role="alert" style={{ fontSize: 13, color: "var(--bad)" }}>That code is used up. Ask for a new one.</span> : null}
          {verdict !== "usedUp" ? <button type="submit" style={cta} aria-busy={busy}>Continue</button> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <button type="button" onClick={() => void send()} style={quiet}>Send a new code</button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setVerdict("ok"); }} style={{ ...quiet, textDecoration: "none" }}>Not {clean}? Use another email</button>
          </div>
        </form>
      )}
    </Backdrop>
  );
}

/** Six boxes with one real input laid invisibly over them: typing, paste and autofill all work. */
export function CodeInput({ value, onChange, wrong, usedUp }: { value: string; onChange: (v: string) => void; wrong?: boolean; usedUp?: boolean }) {
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  const ref = useRef<HTMLInputElement>(null);
  const [shake, setShake] = useState(false);
  useEffect(() => { if (wrong) { setShake(true); const t = setTimeout(() => setShake(false), 300); return () => clearTimeout(t); } return undefined; }, [wrong]);
  return (
    <label style={{ position: "relative", display: "block", height: 56, cursor: "text" }} aria-label="Six digit code">
      <input ref={ref} autoFocus value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-label="Six digit code" readOnly={usedUp} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent", color: "transparent", caretColor: "transparent", outline: "none" }} />
      <span aria-hidden="true" style={{ pointerEvents: "none", display: "grid", height: "100%", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, animation: shake ? "nk-shake 300ms var(--ease)" : undefined }}>
        {digits.map((d, i) => <span key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-6)", background: "var(--canvas)", font: "400 20px var(--mono)", color: "var(--ink)", boxShadow: wrong ? "inset 0 0 0 1.5px var(--bad)" : value.length === i || (i === 5 && value.length === 6) ? "inset 0 0 0 1.5px var(--amber)" : "inset 0 0 0 1px var(--line)", transition: "box-shadow var(--t-fast)" }}>{d.trim()}</span>)}
      </span>
    </label>
  );
}

/** Name: opens only when the account has no name yet. */
export function NameScreen() {
  const source = useStore((s) => s.source);
  const [name, setName] = useState("");
  const next = async () => {
    if (!name.trim() || !source) return;
    const me = await source.setMe(name);
    if (source instanceof LiveDataSource) { await landLive(source); return; }
    useStore.setState({ me });
    const { studio } = useStore.getState();
    useStore.setState({ screen: studio ? "project" : "zeroStudio" });
  };
  return (
    <Backdrop>
      <Mark size={24} />
      <form onSubmit={(e) => { e.preventDefault(); void next(); }} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <label htmlFor="name" style={{ font: "400 28px/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>What should the team call you?</label>
        <input id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Okafor" style={field} />
        <button type="submit" style={cta}>Continue</button>
      </form>
    </Backdrop>
  );
}
