// Writes shared/ts/ and shared/py/ from shared/schemas/.
// Run: pnpm --filter @nkata/shared generate
// The test suite re-runs generation in memory and fails if the files on disk differ.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitPy, emitPyInit, PY_RUNTIME } from "./emit-py.js";
import { emitTs, emitTsIndex } from "./emit-ts.js";
import { loadSchemas, PY_OUT_DIR, TS_OUT_DIR } from "./schema.js";

export function generateAll(): Map<string, string> {
  const files = loadSchemas();
  const out = new Map<string, string>();
  for (const file of files.values()) {
    out.set(join(TS_OUT_DIR, `${file.base}.ts`), emitTs(files, file));
    out.set(join(PY_OUT_DIR, `${file.base}.py`), emitPy(files, file));
  }
  out.set(join(TS_OUT_DIR, "index.ts"), emitTsIndex(files));
  out.set(join(PY_OUT_DIR, "__init__.py"), emitPyInit(files));
  out.set(join(PY_OUT_DIR, "_runtime.py"), PY_RUNTIME);
  return out;
}

export function writeAll(): string[] {
  mkdirSync(TS_OUT_DIR, { recursive: true });
  mkdirSync(PY_OUT_DIR, { recursive: true });
  const written: string[] = [];
  for (const [path, content] of generateAll()) {
    writeFileSync(path, content);
    written.push(path);
  }
  return written;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  for (const path of writeAll()) process.stdout.write(`${path}\n`);
}
