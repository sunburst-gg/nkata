// Sign in, sign up, create a studio, and the viewer join screens.
import { useState } from "react";
import { Link } from "react-router";
import { t } from "@/copy/en";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Wordmark } from "@/components/Mark";
import { renderStyle } from "@/lib/renders";
import { useGo } from "@/lib/hooks";
import { Centered, Header, Title } from "./Shell";

function Big({ children, ...rest }: React.ComponentProps<typeof Button>) {
  return <Button {...rest} className="h-11 rounded-lg text-15">{children}</Button>;
}

export function SignIn() {
  const signIn = useStore((s) => s.signIn);
  const go = useGo();
  const [email, setEmail] = useState("ada@sunburst.studio");
  const done = () => { signIn("artist"); go.home(); };
  return (
    <Centered width={400}>
      <Wordmark />
      <div className="flex flex-col gap-8">
        <Title>{t("auth.signin.title")}</Title>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); done(); }}>
          <Big variant="inverted" onClick={done}>{t("auth.discord")}</Big>
          <div className="flex items-center gap-3 text-13 text-muted"><span className="h-px flex-1 bg-hairline" />or<span className="h-px flex-1 bg-hairline" /></div>
          <Input large type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" placeholder="you@studio.com" />
          <Big type="submit">{t("auth.link")}</Big>
        </form>
        <span className="text-13 text-secondary">New here? <Link to="/signup" className="text-accent-text">Create an account</Link></span>
      </div>
    </Centered>
  );
}

function Line({ label, value, onChange, cursor }: { label: string; value: string; onChange: (v: string) => void; cursor?: boolean }) {
  return (
    <label className="flex h-13 items-center gap-4 border-b border-border">
      <span className="w-18 text-13 text-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={cursor} className="min-w-0 flex-1 bg-transparent text-14 text-heading outline-none" />
    </label>
  );
}

export function SignUp() {
  const signIn = useStore((s) => s.signIn);
  const go = useGo();
  const [name, setName] = useState("Ada Okafor");
  const [studio, setStudio] = useState("Sunburst");
  const [email, setEmail] = useState("ada@sunburst.studio");
  return (
    <Centered width={400}>
      <Wordmark />
      <form className="flex flex-col gap-8" onSubmit={(e) => { e.preventDefault(); signIn("artist"); go.to("/new-studio"); }}>
        <Title>{t("auth.signup.title")}</Title>
        <div className="flex flex-col">
          <Line label="Name" value={name} onChange={setName} />
          <Line label="Studio" value={studio} onChange={setStudio} />
          <Line label="Email" value={email} onChange={setEmail} cursor />
        </div>
        <Big type="submit" variant="primary" className="h-11 self-start rounded-lg px-5 text-15">Create account</Big>
        <span className="text-13 text-secondary">Have an account? <Link to="/signin" className="text-accent-text">Sign in</Link></span>
      </form>
    </Centered>
  );
}

export function CreateStudio() {
  const go = useGo();
  const [name, setName] = useState("Rising Sun Collective");
  return (
    <>
      <Header crumbs={[{ label: "Sunburst", onClick: go.home }, { label: "New studio", current: true }]} />
      <Centered>
        <Title>Name the studio.</Title>
        <label className="flex h-15 items-center gap-4 border-b border-border">
          <span className="flex size-10 items-center justify-center rounded-md bg-raised text-[18px] font-semibold text-secondary">{name.trim().charAt(0).toUpperCase() || "S"}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Studio name" className="min-w-0 flex-1 bg-transparent text-24 text-heading outline-none" />
        </label>
        <span className="text-secondary">A studio holds projects and people. You are its first producer. Invite others after.</span>
        <Big variant="primary" className="self-start px-5" onClick={go.home}>Create studio</Big>
      </Centered>
    </>
  );
}

/** Viewer setup, screen 1: from the invite link. */
export function Join() {
  const signIn = useStore((s) => s.signIn);
  const go = useGo();
  const project = useStore((s) => s.db.session.studio.projects[0]!);
  const next = () => { signIn("viewer"); go.to("/join/start"); };
  return (
    <Centered width={440}>
      <Wordmark />
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-md" style={renderStyle({ key: "overview", pos: "center" }, "tile")} />
          <div className="flex flex-col"><span className="font-medium">{project.name}</span><span className="text-13 text-secondary">Sunburst · {project.assetCount} assets</span></div>
        </div>
        <Title>Emmanuel invited you to {project.name}.</Title>
        <span className="leading-[1.5] text-body">You can see every asset, rotate models, follow what changed, and leave notes. You do not need Blender or Unreal.</span>
      </div>
      <div className="flex flex-col gap-3">
        <Big variant="primary" onClick={next}>Continue as funmi@lagosinteractive.com</Big>
        <Big onClick={next}>{t("auth.discord")}</Big>
      </div>
      <span className="text-13 text-muted">Joining as a Viewer. {t("viewer.role.line")}</span>
    </Centered>
  );
}

/** Viewer setup, screen 2: where to start. No folder step. */
export function JoinStart() {
  const go = useGo();
  const setDigestHome = useStore((s) => s.source.setDigestHome);
  const card = "flex w-85 cursor-pointer flex-col gap-5 rounded-xl border border-hairline bg-panel p-5 text-left transition-colors duration-150 hover:bg-raised outline-none focus-visible:shadow-focus";
  return (
    <Centered width={704}>
      <Title>Where do you want to start?</Title>
      <div className="flex gap-6">
        <button type="button" className={card} onClick={() => { setDigestHome(true); go.changes(); }}>
          <div className="grid grid-cols-2 gap-2"><div className="aspect-[4/3] rounded-md" style={renderStyle({ key: "courtyard", pos: "center" }, "tile")} /><div className="aspect-[4/3] rounded-md" style={renderStyle({ key: "ground", pos: "center" }, "tile")} /></div>
          <div className="flex flex-col gap-0.5"><span className="text-16 font-medium">{t("changes.title")}</span><span className="text-13 text-secondary">The week in one page. Renders side by side, new notes.</span></div>
        </button>
        <button type="button" className={card} onClick={() => { setDigestHome(false); go.project(); }}>
          <div className="grid grid-cols-3 gap-2">{(["overview", "interior", "tree"] as const).map((k) => <div key={k} className="aspect-[3/4] rounded-md" style={renderStyle({ key: k, pos: "center" }, "tile")} />)}</div>
          <div className="flex flex-col gap-0.5"><span className="text-16 font-medium">The whole project</span><span className="text-13 text-secondary">Every asset as a tile. Open any of them.</span></div>
        </button>
      </div>
      <span className="text-13 text-muted">You can switch any time from the Rising Sun menu.</span>
    </Centered>
  );
}
