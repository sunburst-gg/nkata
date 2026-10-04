// Screenshots of every screen at 1280 by 800 and 1440 by 900, dark and light, artist and viewer,
// with console errors collected. Run: pnpm build && pnpm shots. Output: shots/.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const OUT = fileURLToPath(new URL("../shots/", import.meta.url));
const PORT = 4173;
const BROWSER = process.env["NKATA_CHROME"] ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

type Shot = { name: string; path: string; role?: "artist" | "viewer"; rail?: boolean; review?: boolean; theme?: "light" | "dark"; width?: 1280 | 1440; height?: number };
const SHOTS: Shot[] = [
  { name: "signin", path: "/signin" }, { name: "signup", path: "/signup" }, { name: "home", path: "/home" }, { name: "new-studio", path: "/new-studio" },
  { name: "create-1", path: "/new/1" }, { name: "create-2", path: "/new/2" }, { name: "create-3", path: "/new/3" }, { name: "create-4", path: "/new/4" }, { name: "create-5", path: "/new/5" },
  { name: "profile", path: "/profile" },
  { name: "project", path: "/p/rising-sun" }, { name: "project-rail", path: "/p/rising-sun", rail: true }, { name: "project-review", path: "/p/rising-sun", rail: true, review: true },
  { name: "asset", path: "/p/rising-sun/a/ojukwu" }, { name: "asset-empty", path: "/p/rising-sun/a/kettle" }, { name: "part", path: "/p/rising-sun/a/ojukwu/face" },
  { name: "changes", path: "/p/rising-sun/changes", height: 1100 }, { name: "people", path: "/p/rising-sun/people" }, { name: "templates", path: "/p/rising-sun/templates" }, { name: "settings", path: "/p/rising-sun/settings" },
  { name: "join", path: "/join", role: "viewer" }, { name: "join-start", path: "/join/start", role: "viewer" },
  { name: "viewer-project", path: "/p/rising-sun", role: "viewer", rail: true }, { name: "viewer-asset", path: "/p/rising-sun/a/ojukwu", role: "viewer" }, { name: "viewer-part", path: "/p/rising-sun/a/ojukwu/face", role: "viewer" },
  { name: "viewer-changes", path: "/p/rising-sun/changes", role: "viewer", height: 1100 }, { name: "viewer-asset-empty", path: "/p/rising-sun/a/kettle", role: "viewer" },
  { name: "project-1440", path: "/p/rising-sun", width: 1440, height: 900 }, { name: "asset-1440", path: "/p/rising-sun/a/ojukwu", width: 1440, height: 900 }, { name: "part-1440", path: "/p/rising-sun/a/ojukwu/face", width: 1440, height: 900 },
  { name: "project-light", path: "/p/rising-sun", theme: "light", rail: true }, { name: "asset-light", path: "/p/rising-sun/a/ojukwu", theme: "light" }, { name: "part-light", path: "/p/rising-sun/a/ojukwu/face", theme: "light" },
  { name: "home-light", path: "/home", theme: "light" }, { name: "changes-light", path: "/p/rising-sun/changes", theme: "light", height: 1100 }, { name: "signin-light", path: "/signin", theme: "light" },
  { name: "states", path: "/states", height: 6000 }, { name: "states-light", path: "/states", theme: "light", height: 6000 },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: BROWSER });
  const errors: string[] = [];
  try {
    for (const s of SHOTS) {
      const width = s.width ?? 1280;
      const height = s.height ?? (width === 1440 ? 900 : 800);
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${s.name}: ${m.text()}`); });
      page.on("pageerror", (e) => errors.push(`${s.name}: ${e.message}`));
      await page.addInitScript((theme: string) => { localStorage.setItem("nkata.theme", theme); }, s.theme ?? "dark");
      await page.goto(`http://localhost:${PORT}/#${s.path}`);
      await page.waitForSelector("#root > *");
      await page.evaluate(({ role, rail, review }) => {
        const w = window as unknown as { __nkata?: { switchRole: (r: string) => void; setRail: (b: boolean) => void; setReview: (b: boolean) => void } };
        w.__nkata?.switchRole(role ?? "artist");
        w.__nkata?.setRail(!!rail);
        w.__nkata?.setReview(!!review);
      }, { role: s.role, rail: s.rail, review: s.review });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}${s.name}.png`, fullPage: s.height !== undefined && s.height > 1100 });
      process.stdout.write(`${s.name}\n`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  if (errors.length) {
    process.stderr.write(`console errors:\n${errors.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write("no console errors\n");
}

await main();
