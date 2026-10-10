// Screenshots of every v3 screen at 1280 by 800 and 1440 by 900, light and dark, producer and
// viewer, through the prototype's Tweaks (window.__nkata), with console errors collected.
// Run: pnpm build && pnpm shots. Output: shots/.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const OUT = fileURLToPath(new URL("../shots/", import.meta.url));
const PORT = 4173;
const BROWSER = process.env["NKATA_CHROME"] ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

type Stage = "fresh" | "connected" | "firstAsset" | "populated";
type Shot = { name: string; path: string; stage?: Stage; createProject?: boolean; click?: string; role?: "artist" | "viewer"; rail?: boolean; tab?: string; open?: "members" | "ask" | "createAsset"; full?: [string, string?]; theme?: "light" | "dark"; width?: 1280 | 1440 };
const RS = "/p/rising-sun";
const SHOTS: Shot[] = [
  { name: "signin", path: "/signin" }, { name: "signin-code", path: "/signin", click: "button[type=submit]" }, { name: "name", path: "/name" }, { name: "studio", path: "/studio" },
  { name: "welcome", path: "/welcome" }, { name: "welcome-connected", path: "/welcome", stage: "connected" },
  { name: "new-project", path: "/new" },
  { name: "project-fresh", path: "/p/nkatatest", stage: "fresh", createProject: true }, { name: "project-connected", path: "/p/nkatatest", stage: "connected" }, { name: "project-first", path: "/p/nkatatest", stage: "firstAsset" },
  { name: "project", path: RS, stage: "populated" }, { name: "project-rail", path: RS, stage: "populated", rail: true }, { name: "project-review", path: RS, stage: "populated", rail: true, tab: "Ready" },
  { name: "asset", path: `${RS}/a/ojukwu`, stage: "populated" }, { name: "asset-stall", path: "/p/nkatatest/a/market-stall", stage: "populated" }, { name: "part", path: `${RS}/a/ojukwu/face`, stage: "populated" },
  { name: "full", path: `${RS}/a/ojukwu/face`, stage: "populated", full: ["ojukwu", "face"] },
  { name: "connections", path: "/connections", stage: "connected" }, { name: "mentions", path: "/mentions", stage: "populated" },
  { name: "members", path: "/welcome", stage: "populated", open: "members" }, { name: "ask", path: RS, stage: "populated", open: "ask" }, { name: "create-asset", path: "/p/nkatatest", stage: "connected", open: "createAsset" },
  { name: "settings-account", path: "/settings/account", stage: "populated" }, { name: "settings-general", path: "/settings/general", stage: "populated" }, { name: "settings-members", path: "/settings/members", stage: "populated" },
  { name: "settings-billing", path: "/settings/billing", stage: "populated" }, { name: "settings-training", path: "/settings/training", stage: "populated" }, { name: "settings-connections", path: "/settings/connections", stage: "populated" }, { name: "settings-mcp", path: "/settings/mcp", stage: "populated" },
  { name: "viewer-project", path: RS, stage: "populated", role: "viewer" }, { name: "viewer-asset", path: `${RS}/a/ojukwu`, stage: "populated", role: "viewer" }, { name: "viewer-part", path: `${RS}/a/ojukwu/face`, stage: "populated", role: "viewer" }, { name: "viewer-settings", path: "/settings/account", stage: "populated", role: "viewer" },
  { name: "project-1440", path: RS, stage: "populated", width: 1440 }, { name: "asset-1440", path: `${RS}/a/ojukwu`, stage: "populated", width: 1440 }, { name: "part-1440", path: `${RS}/a/ojukwu/face`, stage: "populated", width: 1440 }, { name: "welcome-1440", path: "/welcome", width: 1440 },
  { name: "signin-dark", path: "/signin", theme: "dark" }, { name: "welcome-dark", path: "/welcome", theme: "dark" }, { name: "project-dark", path: RS, stage: "populated", theme: "dark", rail: true }, { name: "asset-dark", path: `${RS}/a/ojukwu`, stage: "populated", theme: "dark" }, { name: "part-dark", path: `${RS}/a/ojukwu/face`, stage: "populated", theme: "dark" }, { name: "settings-dark", path: "/settings/training", stage: "populated", theme: "dark" }, { name: "connections-dark", path: "/connections", stage: "connected", theme: "dark" },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: BROWSER, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors: string[] = [];
  try {
    for (const s of SHOTS) {
      const width = s.width ?? 1280;
      const height = width === 1440 ? 900 : 800;
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${s.name}: ${m.text()}`); });
      page.on("pageerror", (e) => errors.push(`${s.name}: ${e.message}`));
      await page.addInitScript((theme: string) => { localStorage.setItem("nkata.theme", theme); }, s.theme ?? "light");
      await page.goto(`http://localhost:${PORT}/#/signin`);
      await page.waitForSelector("#root > *");
      await page.evaluate((o) => {
        type Hook = { setStage: (s: string) => void; switchRole: (r: string) => void; setRail: (b: boolean) => void; setTab: (t: string) => void; createProject: (name: string) => void };
        const w = (window as unknown as { __nkata: Hook }).__nkata;
        w.setStage(o.stage ?? "fresh");
        if (o.createProject) w.createProject("NkataTest");
        w.switchRole(o.role ?? "artist");
        w.setRail(!!o.rail);
        w.setTab(o.tab ?? "All");
      }, { stage: s.stage, role: s.role, rail: s.rail, tab: s.tab, createProject: s.createProject });
      await page.evaluate((path) => { location.hash = `#${path}`; }, s.path);
      await page.waitForTimeout(300);
      if (s.click) { await page.click(s.click); await page.waitForTimeout(300); }
      if (s.open || s.full) {
        await page.evaluate((o) => {
          type Hook = { open: (w: string) => void; fullScreen: (a: string, p?: string) => void };
          const w = (window as unknown as { __nkata: Hook }).__nkata;
          if (o.open) w.open(o.open);
          if (o.full) w.fullScreen(o.full[0], o.full[1]);
        }, { open: s.open, full: s.full });
      }
      // Software WebGL takes a few seconds to build the environment and decode the GLB.
      await page.waitForTimeout(s.path.includes("/a/") ? 5000 : 500);
      await page.screenshot({ path: `${OUT}${s.name}.png` });
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
