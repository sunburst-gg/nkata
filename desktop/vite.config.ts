import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Tauri expects a fixed port and no HMR over the network. https://v2.tauri.app/start/frontend/vite/
const host = process.env["TAURI_DEV_HOST"];

// The mock prototype's sample models and renders (public/fixtures) serve `pnpm dev` only. A
// production build is the desktop app, which runs on live data, so they stay out of it: they
// were most of the app's size. https://vite.dev/guide/api-plugin.html#universal-hooks
function dropFixtures(): Plugin {
  let outDir = "dist";
  return {
    name: "nkata-drop-fixtures",
    apply: "build",
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() { rmSync(fileURLToPath(new URL(`./${outDir}/fixtures`, import.meta.url)), { recursive: true, force: true }); },
  };
}

export default defineConfig({
  plugins: [react(), dropFixtures()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env["TAURI_ENV_PLATFORM"] === "windows" ? "chrome105" : "safari13",
    minify: !process.env["TAURI_ENV_DEBUG"] ? "esbuild" : false,
    sourcemap: !!process.env["TAURI_ENV_DEBUG"],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/parked/**", "node_modules/**"],
    environment: "node",
  },
});
