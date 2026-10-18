// The live tests: the desktop's LiveDataSource against the test server make test starts
// (NKATA_TEST_SERVER_URL). Run by scripts/test.sh after the server is up: pnpm test:live
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.live.test.ts"], environment: "node", testTimeout: 60_000, hookTimeout: 60_000 },
});
