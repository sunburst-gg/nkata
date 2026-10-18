#!/usr/bin/env node
// Screenshot harness: for each Tweak combo, at 1280x800 and 1440x900, light and dark, capture the
// app (vite dev on 1420, mock data through the URL Tweaks) and the prototype (make proto on 4600,
// its data-props defaults patched to the same combo) into docs/v8-shots/<combo>/app.png and
// proto.png. The prototype loads three.js, fonts and models from CDNs; outside the sandbox those
// load directly, inside it every request goes through Node (NODE_USE_ENV_PROXY=1).
//   pnpm shots                      three combos (the default set)
//   pnpm shots all                  every role, stage, startScreen that applies
//   pnpm shots "role=lead&stage=empty"  one combo
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.APP_URL ?? "http://127.0.0.1:1420/";
const PROTO = process.env.PROTO_URL ?? "http://127.0.0.1:4600/Nkata%20App%20v8.dc.html";
const OUT = resolve(new URL("../../docs/v8-shots/", import.meta.url).pathname);
const ROLES = ["lead", "artist", "viewer"];
const STAGES = ["nostudio", "noproject", "arrival", "empty", "joining", "firstsave", "firstcomment", "studio"];
const DEFAULT = ["role=lead&stage=studio&startScreen=project", "role=artist&stage=studio&startScreen=asset", "role=viewer&stage=empty&startScreen=project"];

function combos(arg) {
  if (!arg) return DEFAULT;
  if (arg !== "all") return [arg];
  const out = [];
  for (const role of ROLES) for (const stage of STAGES) {
    out.push(`role=${role}&stage=${stage}&startScreen=project`);
    if (stage === "studio") for (const s of ["asset", "mentions", "connections", "sample"]) out.push(`role=${role}&stage=studio&startScreen=${s}`);
  }
  return out;
}

// The prototype side runs only while a server for it answers (the handoff folder was removed
// after step 13; docs/v8-shots/proto-words.json keeps its words for the report).
const protoHtml = await fetch(PROTO).then((r) => (r.ok ? r.text() : null)).catch(() => null);
if (protoHtml === null) console.log(`no prototype at ${PROTO}: capturing the app only`);
function patchedProto(params) {
  let out = protoHtml;
  for (const [k, v] of params) {
    const re = new RegExp(`(&quot;${k}&quot;:\\{[^}]*?&quot;default&quot;:)(&quot;[^&]*&quot;|true|false)`);
    out = out.replace(re, (_, a) => `${a}&quot;${v}&quot;`);
  }
  return out;
}
const sandboxed = !!process.env.NODE_USE_ENV_PROXY;
const cache = new Map();
async function viaNode(route) {
  const u = route.request().url();
  let hit = cache.get(u);
  if (!hit) {
    try { const res = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 Chrome/120" } }); hit = { status: res.status, type: res.headers.get("content-type") ?? "application/octet-stream", body: Buffer.from(await res.arrayBuffer()) }; }
    catch (e) { hit = { status: 502, type: "text/plain", body: Buffer.from(String(e)) }; }
    cache.set(u, hit);
  }
  return route.fulfill({ status: hit.status, headers: { "content-type": hit.type, "access-control-allow-origin": "*" }, body: hit.body });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const combo of combos(process.argv[2])) {
  const params = new URLSearchParams(combo);
  for (const theme of ["light", "dark"]) for (const [w, h] of [[1280, 800], [1440, 900]]) {
    const dir = resolve(OUT, `${combo.replace(/[&=]/g, "_")}_${theme}_${w}`);
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const q = new URLSearchParams(params); q.set("theme", theme); q.set("mock", "1");
    page.setDefaultTimeout(180000);
    await page.goto(`${APP}?${q}`, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: resolve(dir, "app.png") });
    // The visible text beside the picture, for the report's line per combo.
    writeFileSync(resolve(dir, "app.txt"), await page.locator("body").innerText());
    await page.close();
    if (protoHtml === null) { console.log(`${combo} ${theme} ${w}: app.png`); continue; }
    const proto = await browser.newPage({ viewport: { width: w, height: h } });
    const entries = [...params.entries(), ["theme", theme]];
    await proto.route(/^https?:\/\//, async (route) => {
      const u = route.request().url();
      if (u === PROTO) return route.fulfill({ status: 200, contentType: "text/html", body: patchedProto(entries) });
      return sandboxed ? viaNode(route) : route.continue();
    });
    await proto.goto(PROTO, { waitUntil: "load" });
    await proto.waitForTimeout(sandboxed ? 8000 : 5000);
    await proto.screenshot({ path: resolve(dir, "proto.png") });
    writeFileSync(resolve(dir, "proto.txt"), await proto.locator("body").innerText());
    await proto.close();
    console.log(`${combo} ${theme} ${w}: app.png, proto.png`);
  }
}
await browser.close();
