// Loader and resolver for the JSON Schema files in shared/schemas/.
// The generator and the tests both read schemas through this module.
// Subset of JSON Schema 2020-12 we use: see shared/README.md.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_DIR = fileURLToPath(new URL("../schemas/", import.meta.url));
export const TS_OUT_DIR = fileURLToPath(new URL("../ts/", import.meta.url));
export const PY_OUT_DIR = fileURLToPath(new URL("../py/", import.meta.url));
export const CHECKS_DIR = fileURLToPath(new URL("../checks/", import.meta.url));

export type JsonSchema = {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  type?: "object" | "string" | "integer" | "number" | "boolean" | "null" | "array";
  const?: string | number | boolean | null;
  enum?: (string | number)[];
  format?: "date-time" | "email" | "uri";
  pattern?: string;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  default?: unknown;
};

export type SchemaFile = {
  /** File name without .schema.json, for example "common". */
  base: string;
  fileName: string;
  schema: JsonSchema;
  defs: Record<string, JsonSchema>;
};

export function loadSchemas(dir: string = SCHEMA_DIR): Map<string, SchemaFile> {
  const files = new Map<string, SchemaFile>();
  for (const fileName of readdirSync(dir).filter((f) => f.endsWith(".schema.json")).sort()) {
    const schema = JSON.parse(readFileSync(join(dir, fileName), "utf8")) as JsonSchema;
    const base = basename(fileName, ".schema.json");
    files.set(base, { base, fileName, schema, defs: schema.$defs ?? {} });
  }
  return files;
}

export type Ref = { base: string; name: string };

/** Resolves "#/$defs/X" and "other.schema.json#/$defs/X" relative to the file that holds the ref. */
export function parseRef(ref: string, currentBase: string): Ref {
  const [filePart, pointer] = ref.split("#");
  if (pointer === undefined || !pointer.startsWith("/$defs/")) {
    throw new Error(`unsupported $ref "${ref}" in ${currentBase}: only #/$defs/Name refs are supported`);
  }
  const name = pointer.slice("/$defs/".length);
  if (name.includes("/")) throw new Error(`unsupported nested $ref "${ref}"`);
  const base = filePart === "" || filePart === undefined ? currentBase : basename(filePart, ".schema.json");
  return { base, name };
}

export function resolveRef(files: Map<string, SchemaFile>, ref: Ref): JsonSchema {
  const file = files.get(ref.base);
  if (!file) throw new Error(`unknown schema file "${ref.base}"`);
  const def = file.defs[ref.name];
  if (!def) throw new Error(`unknown $def "${ref.name}" in ${ref.base}`);
  return def;
}

/** Follows $ref chains to the concrete schema node. */
export function deref(files: Map<string, SchemaFile>, node: JsonSchema, base: string): { node: JsonSchema; base: string } {
  let current = node;
  let currentBase = base;
  for (let i = 0; i < 10; i++) {
    if (current.$ref === undefined) return { node: current, base: currentBase };
    const ref = parseRef(current.$ref, currentBase);
    current = resolveRef(files, ref);
    currentBase = ref.base;
  }
  throw new Error("ref chain too deep");
}

/** True when the node is a nullable wrapper: anyOf [X, {type: null}]. Returns X. */
export function nullableInner(node: JsonSchema): JsonSchema | undefined {
  const branches = node.anyOf ?? node.oneOf;
  if (!branches || branches.length !== 2) return undefined;
  const nulls = branches.filter((b) => b.type === "null");
  if (nulls.length !== 1) return undefined;
  return branches.find((b) => b.type !== "null");
}

/**
 * Finds a property every branch of a union declares with a const value.
 * Used for discriminated unions in both generated languages.
 */
export function discriminator(files: Map<string, SchemaFile>, branches: JsonSchema[], base: string): string | undefined {
  const resolved = branches.map((b) => deref(files, b, base).node);
  const first = resolved[0];
  if (!first?.properties) return undefined;
  for (const key of Object.keys(first.properties)) {
    const ok = resolved.every((b) => {
      const prop = b.properties?.[key];
      return b.type === "object" && prop !== undefined && prop.const !== undefined && b.required?.includes(key);
    });
    if (ok) {
      const values = resolved.map((b) => b.properties?.[key]?.const);
      if (new Set(values).size === values.length) return key;
    }
  }
  return undefined;
}

/** Def names of a file in dependency order, same-file refs first. Throws on a cycle. */
export function topoOrder(file: SchemaFile): string[] {
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const localRefs = (node: JsonSchema, out: Set<string>): void => {
    if (node.$ref !== undefined) {
      const ref = parseRef(node.$ref, file.base);
      if (ref.base === file.base) out.add(ref.name);
    }
    for (const child of [...Object.values(node.properties ?? {}), ...(node.anyOf ?? []), ...(node.oneOf ?? [])]) {
      localRefs(child, out);
    }
    if (node.items) localRefs(node.items, out);
    if (typeof node.additionalProperties === "object") localRefs(node.additionalProperties, out);
  };
  const visit = (name: string): void => {
    const s = state.get(name);
    if (s === "done") return;
    if (s === "visiting") throw new Error(`cycle through $def "${name}" in ${file.base}`);
    state.set(name, "visiting");
    const deps = new Set<string>();
    const def = file.defs[name];
    if (!def) throw new Error(`missing def ${name}`);
    localRefs(def, deps);
    for (const dep of [...deps].sort()) visit(dep);
    state.set(name, "done");
    order.push(name);
  };
  for (const name of Object.keys(file.defs)) visit(name);
  return order;
}
