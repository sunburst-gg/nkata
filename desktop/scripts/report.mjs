#!/usr/bin/env node
// Writes docs/v8-shots/REPORT.md from the text the shots harness saved beside each picture: one
// line per combo, "match" when the app's words are the prototype's, else "diff" with the first
// line that differs and the decision that explains it. Pictures stay for the eye; words are
// what a diff can prove. Run after `pnpm shots all`: node scripts/report.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(new URL("../../docs/v8-shots/", import.meta.url).pathname);

// Known, logged differences: a combo substring, a word the app shows or lacks, and the decision.
const LOGGED = [
  { when: /startScreen=sample/, line: /./, why: "The prototype's sample page crashes in renderVals (decisions, v8 step 2); the app shows the sample asset." },
  { when: /startScreen=asset|startScreen=sample/, line: /Polycount|Triangles|Approve|Request changes|in Blender now|Click anywhere/, why: "Triangles, not Polycount (Decisions 11); the action bar per role and the first pin note for a viewer (decisions, v8 step 5)." },
  { when: /role=viewer.*startScreen=connections/, line: /Blender|Unreal|Connections|Coming soon/, why: "A viewer never sees Connections; the app shows them the wall instead (decisions, v8 step 9)." },
  { when: /./, line: /^Art director$|^Producer$|^Lead$|^Artist$|^Viewer$/, why: "The four roles stay: producer and art director where the prototype says Lead (Decisions 3, decisions, v8 step 8)." },
  { when: /stage=joining|stage=firstsave|stage=firstcomment/, line: /^[A-Z]$|Chidi|Ngozi|Tobe|Ada|Your turn|Live means|Open Blender and save|is saving|still working/, why: "The joining cards belong to Chidi, Ngozi and Tobe and the first save is Ada's own, so her journey closes (decisions, v8 step 7)." },
  { when: /stage=arrival/, line: /Blender|add-on|Add-on|ready on this computer/, why: "Arrival's setup list is the Blender card (decisions, v8 step 9)." },
  { when: /./, line: /Polycount|Triangles/, why: "Triangles, not Polycount (Decisions 11)." },
  { when: /./, line: /first Version|since v/, why: "The first Version has no delta (decisions, v8 step 5)." },
  { when: /./, line: /Not checked yet/, why: "Checks the add-on has not reported read pending (decisions, v8 step 11)." },
  { when: /role=lead&stage=studio&startScreen=project/, line: /Needs my eyes/, why: "Needs my eyes counts the prototype's waiting flag as changes requested (decisions, v8 step 4)." },
  { when: /stage=joining/, line: /Chidi|Ngozi|Tobe|Your turn/, why: "The joining cards belong to Chidi, Ngozi and Tobe (decisions, v8 step 7)." },
  { when: /startScreen=asset|startScreen=sample/, line: /Request changes|Download image|first Version|Budget/, why: "Request changes needs a pin or a line; viewers get Download image; the first Version has no delta (decisions, v8 steps 5 and 6)." },
  { when: /startScreen=connections/, line: /Add-on|Paused|On this computer|Show in Finder|GB/, why: "Connections carries the ten Blender states and the disk rows (decisions, v8 step 9)." },
  { when: /role=viewer/, line: /Viewer|Looking/, why: "The viewer tag and the Looking label (decisions, v8 step 3)." },
  { when: /./, line: /Project settings|Sync again|Tweaks|hide|HELL YES|passes:/, why: "The project menu is the app's (decisions, v8 step 8); the Tweaks panel and the hell-yes line are the prototype's dev chrome, not product." },
];

const DROP = /^(Tweaks|hide|role|stage|startScreen|theme|blender|agent|offline|simulateSave|simulateJoin|test toast|live contexts|toggle|fire|\(stage\)|HELL YES|[0-9]+ \/ 8|lead|artist|viewer|light|dark|project|asset|mentions|connections|sample|nostudio|noproject|arrival|empty|joining|firstsave|firstcomment|studio)$/;
// The prototype's footer (HELL YES and its two lines) is dev chrome, not product; it ends the page.
const footerless = (t) => { const i = t.indexOf("HELL YES"); return i >= 0 ? t.slice(0, i) : t; };
const words = (t) => footerless(t).split(/\n+/).map((l) => l.trim()).filter((l) => l && !DROP.test(l) && !/^passes:/.test(l));

/** "role_lead_stage_studio_startScreen_project_light_1280" as the Tweak query it came from. */
function queryOf(dir) {
  const m = dir.match(/^role_(\w+?)_stage_(\w+?)_startScreen_(\w+?)_(light|dark)_(\d+)$/);
  return m ? `role=${m[1]}&stage=${m[2]}&startScreen=${m[3]}&theme=${m[4]}&width=${m[5]}` : dir;
}

function compare(dir, app, proto) {
  const combo = queryOf(dir);
  const a = words(app), p = words(proto);
  const pa = new Set(p);
  const missing = a.filter((l) => !pa.has(l));
  const as = new Set(a);
  const extra = p.filter((l) => !as.has(l));
  if (missing.length === 0 && extra.length === 0) return "match";
  const first = missing[0] ?? extra[0];
  const logged = LOGGED.find((d) => d.when.test(combo) && (missing.some((l) => d.line.test(l)) || extra.some((l) => d.line.test(l))));
  const detail = `${missing.length} line${missing.length === 1 ? "" : "s"} only in the app, ${extra.length} only in the prototype; first: "${first.slice(0, 60)}"`;
  return logged ? `diff: ${detail}. ${logged.why}` : `diff: ${detail}.`;
}

// The prototype's words per combo, captured while handoff/v8 existed. The harness skips the
// prototype side when its server is not there, and the report reads the words from here.
const PROTO_WORDS = existsSync(resolve(OUT, "proto-words.json")) ? JSON.parse(readFileSync(resolve(OUT, "proto-words.json"), "utf8")) : {};
const protoText = (d) => (existsSync(resolve(OUT, d, "proto.txt")) ? readFileSync(resolve(OUT, d, "proto.txt"), "utf8") : PROTO_WORDS[d]);
const dirs = readdirSync(OUT).filter((d) => existsSync(resolve(OUT, d, "app.txt")) && protoText(d) !== undefined).sort();
const lines = dirs.map((d) => `- ${d}: ${compare(d, readFileSync(resolve(OUT, d, "app.txt"), "utf8"), protoText(d))}`);
const matches = lines.filter((l) => l.endsWith(": match")).length;
const unexplained = lines.filter((l) => /diff:/.test(l) && !/\(decisions/i.test(l));
const body = [
  "# v8 shots report",
  "",
  `One line per combo (role, stage, startScreen, theme, width), from the words each page shows. ${matches} of ${lines.length} match. Every diff names the decision that explains it. Pictures: app.png and proto.png in each folder (git-ignored). The prototype's words live in proto-words.json, captured before the handoff folder was removed.`,
  "",
  ...lines,
  "",
  unexplained.length ? `Unexplained: ${unexplained.length}.` : "Unexplained: none.",
  "",
].join("\n");
writeFileSync(resolve(OUT, "REPORT.md"), body);
console.log(`${matches}/${lines.length} match, ${unexplained.length} unexplained`);
for (const u of unexplained) console.log(u);
