import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { generateAll } from "../src/generate.js";
import { loadSchemas, parseRef, resolveRef, type JsonSchema } from "../src/schema.js";

const files = loadSchemas();

describe("schema files", () => {
  it("are valid JSON Schema 2020-12 under ajv strict mode", () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats.default(ajv);
    for (const file of files.values()) {
      expect(ajv.validateSchema(file.schema), `${file.fileName}: ${ajv.errorsText()}`).toBe(true);
    }
  });

  it("every $ref resolves to a $def", () => {
    const walk = (node: JsonSchema, base: string): void => {
      if (node.$ref !== undefined) expect(resolveRef(files, parseRef(node.$ref, base))).toBeDefined();
      for (const child of [...Object.values(node.properties ?? {}), ...(node.anyOf ?? []), ...(node.oneOf ?? [])]) walk(child, base);
      if (node.items) walk(node.items, base);
    };
    for (const file of files.values()) for (const def of Object.values(file.defs)) walk(def, file.base);
  });

  it("every object $def sets additionalProperties", () => {
    for (const file of files.values()) {
      for (const [name, def] of Object.entries(file.defs)) {
        if (def.type === "object") expect(def.additionalProperties, `${file.base}.${name}`).toBeDefined();
      }
    }
  });
});

describe("generated code", () => {
  it("on disk matches a fresh generation (run pnpm generate)", () => {
    for (const [path, content] of generateAll()) {
      expect(readFileSync(path, "utf8"), path).toBe(content);
    }
  });
});
