// Round trip every fixture through three validators: Zod (TypeScript), ajv (the JSON Schema itself),
// and the generated Python dataclasses. The Python side returns to_dict() output which must equal the input
// and must parse again in Zod.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ZodType } from "zod";
import * as generated from "../ts/index.js";
import { loadSchemas } from "../src/schema.js";
import { fixtures } from "./fixtures.js";

const files = loadSchemas();
const sharedDir = fileURLToPath(new URL("../", import.meta.url));

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats.default(ajv);
for (const file of files.values()) ajv.addSchema(file.schema, file.fileName);
const ajvValidate = (base: string, name: string, value: unknown): boolean =>
  ajv.validate({ $ref: `${base}.schema.json#/$defs/${name}` }, value);

type PyResult = { ok: true; value: unknown } | { ok: false; error: string };
function runPython(items: { type: string; value: unknown }[]): PyResult[] {
  const proc = spawnSync("python3", ["test/roundtrip.py"], { cwd: sharedDir, input: JSON.stringify(items), encoding: "utf8" });
  expect(proc.status, proc.stderr).toBe(0);
  return JSON.parse(proc.stdout) as PyResult[];
}

const zodFor = (name: string): ZodType => {
  const schema = (generated as Record<string, unknown>)[name];
  if (!schema) throw new Error(`no generated Zod schema named ${name}`);
  return schema as ZodType;
};

describe("fixtures", () => {
  it("cover every $def in every schema file", () => {
    for (const file of files.values()) {
      for (const name of Object.keys(file.defs)) {
        expect(fixtures[file.base]?.[name]?.valid.length ?? 0, `${file.base}.${name} needs a valid fixture`).toBeGreaterThan(0);
        expect(fixtures[file.base]?.[name]?.invalid.length ?? 0, `${file.base}.${name} needs an invalid fixture`).toBeGreaterThan(0);
      }
    }
  });
});

describe("round trip TypeScript to Python to TypeScript", () => {
  const validItems: { base: string; type: string; value: unknown }[] = [];
  const invalidItems: { base: string; type: string; value: unknown }[] = [];
  for (const [base, defs] of Object.entries(fixtures)) {
    for (const [type, f] of Object.entries(defs)) {
      for (const value of f.valid) validItems.push({ base, type, value });
      for (const value of f.invalid) invalidItems.push({ base, type, value });
    }
  }

  it("valid fixtures pass Zod and ajv, survive Python unchanged, and parse again", () => {
    for (const item of validItems) {
      const parsed = zodFor(item.type).safeParse(item.value);
      expect(parsed.success, `${item.type} zod: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      expect(ajvValidate(item.base, item.type, item.value), `${item.type} ajv: ${ajv.errorsText()}`).toBe(true);
    }
    const results = runPython(validItems.map(({ type, value }) => ({ type, value })));
    results.forEach((result, i) => {
      const item = validItems[i];
      if (!item) throw new Error("fixture count mismatch");
      expect(result.ok, `${item.type} python: ${"error" in result ? result.error : ""}`).toBe(true);
      if (!result.ok) return;
      expect(result.value, `${item.type} python to_dict`).toEqual(item.value);
      expect(zodFor(item.type).safeParse(result.value).success, `${item.type} zod after python`).toBe(true);
    });
  });

  it("invalid fixtures fail Zod, ajv, and Python", () => {
    for (const item of invalidItems) {
      expect(zodFor(item.type).safeParse(item.value).success, `${item.type} zod accepted ${JSON.stringify(item.value)}`).toBe(false);
      expect(ajvValidate(item.base, item.type, item.value), `${item.type} ajv accepted ${JSON.stringify(item.value)}`).toBe(false);
    }
    const results = runPython(invalidItems.map(({ type, value }) => ({ type, value })));
    results.forEach((result, i) => {
      const item = invalidItems[i];
      expect(result.ok, `${item?.type} python accepted ${JSON.stringify(item?.value)}`).toBe(false);
    });
  });
});
