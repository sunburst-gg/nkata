#!/usr/bin/env node
// Tokens only (PROMPTS.md rule 2). Fails when a file under desktop/src, other than the
// stylesheets in styles/ and the parked old UI, carries a hex color, rgb(, rgba(, hsl( or a
// named CSS color inside a style. Run by scripts/test.sh.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../desktop/src/", import.meta.url).pathname;
const SKIP = [/\/parked\//, /\/styles\/[^/]+\.css$/, /\.test\.tsx?$/, /\.d\.ts$/, /\/viewer\/nk-viewer\.js$/];
const NAMED = ["white", "black", "red", "blue", "green", "gray", "grey", "orange", "yellow", "purple", "pink", "brown", "silver", "gold", "navy", "teal", "olive", "maroon", "lime", "aqua", "fuchsia", "coral", "salmon", "tomato", "crimson", "beige", "ivory", "khaki", "tan", "wheat"];
// A color word counts only inside a style value: after a colon or in a quoted CSS string.
const NAMED_RE = new RegExp(`(?:(?:color|background|border|fill|stroke|outline|shadow)[A-Za-z]*\\s*[:=]\\s*["'\`]?\\s*|["'\`][^"'\`]*\\b)(${NAMED.join("|")})\\b`, "i");
const RULES = [
  { name: "hex color", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "rgb()", re: /\brgba?\(/ },
  { name: "hsl()", re: /\bhsla?\(/ },
  { name: "named color", re: NAMED_RE },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?|css)$/.test(name)) yield p;
  }
}
const bad = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP.some((re) => re.test("/" + rel))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment may name a color it explains
    for (const r of RULES) {
      const m = r.re.exec(line);
      if (m) bad.push(`${rel}:${i + 1}: ${r.name} "${m[0]}"`);
    }
  });
}
if (bad.length) { console.error("lint-colors: colors belong in styles/tokens.css\n" + bad.join("\n")); process.exit(1); }
console.log("lint-colors: clean");
