// Copy strings from the handoff (Nkata Flows and Handoff, Copy strings), keyed exactly as listed.
// Sentence case. Short declarative lines. No exclamation marks, no em dashes. Placeholders in braces.
// A key with the same placeholder more than once takes an array, filled in order.

export const en = {
  "auth.signin.title": "Sign in.",
  "auth.signup.title": "Create an account.",
  "auth.discord": "Continue with Discord",
  "auth.link": "Send a sign-in link",
  "home.empty": "No projects yet. Start one in under five minutes.",
  "create.name": "Name the project.",
  "create.folder": "Choose a folder.",
  "create.folder.note": "The project lives here as normal files. If Nkata goes away, the project stays.",
  "create.tools": "Pin the tools.",
  "setup.title": "Setting up {project}.",
  "setup.done": "Ready.",
  "invite.title": "Invite your team.",
  "project.status": "{n} online · {n} changed today · {n} ready for review",
  "project.empty": "No assets yet. Pick a template to start.",
  "review.empty": "Nothing to review.",
  "rail.empty": "Nothing has changed today.",
  "mirror.synced": "In Unreal · {s} s",
  "mirror.syncing": "Syncing to Unreal · {s} s",
  "mirror.failed.closed": "Not in Unreal. The editor is closed.",
  "mirror.failed.import": "Not updated. {reason}.",
  "mirror.offline": "Offline. Saves are kept. They go to Unreal when you are back.",
  "lock.you": "You have this part",
  "lock.other": "{name} has this part. Opened {t} ago.",
  "lock.ask": "Ask to unlock",
  "lock.asked": "Asked · waiting",
  "lock.free": "{part} is free.",
  "check.pass": "All checks pass · {n}",
  "check.tris": "Triangles {a} / {b}. Decimate or split the mesh.",
  "check.tex": "{n} textures over {px}. Nkata can resize them.",
  "publish.block": "{n} checks block",
  "publish.done": "Published v{n}",
  "ready.wait": "Ready. Waiting on {name}.",
  "approve.toast": "Approved by {name}. {part} is locked.",
  "gate.confirm": "Remove the gate on {part}?",
  "gate.log": "{name} removed the gate on {part}.",
  "rollback.confirm": "Roll back to v{a}. It becomes v{b} and goes to Unreal. Nothing is deleted.",
  "rollback.done": "{part} is v{b}, from v{a}. In Unreal.",
  "discord.publish": "{name} published {asset} / {part}, version {n}.",
  "discord.unlock": "{part} unlocked for {name}.",
  "conflict": "Two saves on {part}. Yours is current. {name}'s is kept as v{n}b.",
  // Strings the prototype shows on screen that the handoff list does not key. Same voice.
  "viewer.status": "{n} changed this week",
  "viewer.label": "Viewer",
  "viewer.role.line": "Sees everything, comments, changes nothing.",
  "preview.none": "No preview yet",
  "preview.none.when": "{name} owns {asset}. The first render appears when {pronoun} publishes.",
  "digest.home": "Open Nkata on this page",
  "changes.title": "What changed",
} as const;

export type CopyKey = keyof typeof en;

type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;
type Value = string | number;
export type CopyParams<K extends CopyKey> = [Placeholders<(typeof en)[K]>] extends [never]
  ? []
  : [Record<Placeholders<(typeof en)[K]>, Value | Value[]>];

/** Fills a copy string. Repeated placeholders take an array and are filled in order. */
export function t<K extends CopyKey>(key: K, ...args: CopyParams<K>): string {
  const params = (args[0] ?? {}) as Record<string, Value | Value[]>;
  const queues = new Map<string, Value[]>();
  return en[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    if (Array.isArray(v)) {
      const q = queues.get(name) ?? [...v];
      queues.set(name, q);
      const next = q.shift();
      return next === undefined ? match : String(next);
    }
    return String(v);
  });
}
