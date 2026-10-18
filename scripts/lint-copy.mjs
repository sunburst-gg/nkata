#!/usr/bin/env node
// Banned words in UI text (PROMPTS.md rule 5). Looks at JSX text and the string props label,
// title, placeholder, aria-label and children under desktop/src, parked/ aside. Whole words,
// case insensitive. scripts/lint-copy-allow.json lists real false positives, each with a reason.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../desktop/src/", import.meta.url).pathname;
const ALLOW = JSON.parse(readFileSync(new URL("./lint-copy-allow.json", import.meta.url), "utf8"));
const BANNED = ["part", "parts", "template", "templates", "gate", "gates", "state", "states", "lock", "locks", "locked", "check run", "check runs", "mark ready", "board", "mirror", "commit", "commits", "branch", "branches", "merge", "merges", "push", "pushes", "pull", "pulls", "repository", "repositories", "changelist", "changelists", "folder", "folders", "upgrade", "upgrades", "premium"];
const WORD = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");
const SKIP = [/\/parked\//, /\.test\.tsx?$/, /\.d\.ts$/, /\.css$/, /\/viewer\/nk-viewer\.js$/];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx|jsx)$/.test(name)) yield p;
  }
}
/** Text the person reads: JSX text between tags, and the five string props. */
function uiStrings(src) {
  const out = [];
  for (const m of src.matchAll(/>([^<>{}]+)</g)) { const t = m[1].trim(); if (t) out.push({ text: t, at: m.index }); }
  for (const m of src.matchAll(/\b(label|title|placeholder|aria-label|children)=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`]*)`\s*\})/g)) {
    const t = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? "").trim(); if (t) out.push({ text: t, at: m.index });
  }
  return out;
}
const bad = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP.some((re) => re.test("/" + rel))) continue;
  const src = readFileSync(file, "utf8");
  for (const { text, at } of uiStrings(src)) {
    const m = WORD.exec(text);
    if (!m) continue;
    const allowed = ALLOW.some((a) => a.file === rel && text.includes(a.text));
    if (!allowed) bad.push(`${rel}:${src.slice(0, at).split("\n").length}: "${m[1]}" in "${text.slice(0, 80)}"`);
  }
}
if (bad.length) { console.error("lint-copy: banned words in UI text\n" + bad.join("\n")); process.exit(1); }
console.log("lint-copy: clean");
