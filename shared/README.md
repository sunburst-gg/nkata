# @nkata/shared

Types, the agent protocol, the template schema, check definitions, and event names. No code here imports from another package.

## Source of truth

`schemas/*.schema.json`, JSON Schema 2020-12. Every protocol type is a `$def` in one of:

- `common.schema.json`: ids, timestamps, enums, part mapping, lock info, comment pins, error body.
- `template.schema.json`: the template file at `<project>/.nkata/templates/<name>.json`.
- `agent.schema.json`: one request and one response type per route of the agent local API on `localhost:7420`.
- `events.schema.json`: every WebSocket event, server to client and client to server.
- `check.schema.json`: the check contract. Shipped checks live in `checks/<id>.json`.

## Generated code

`pnpm generate` writes `ts/` (Zod schemas and inferred types) and `py/` (frozen dataclasses with `validate_<Name>` functions and `to_dict`). Both are committed. The test suite fails if they drift from the schemas.

Never hand-edit `ts/` or `py/`. Never hand-write a protocol type elsewhere. See CLAUDE.md, Stack rules.

## Subset of JSON Schema the generator supports

`$ref` to `#/$defs/Name` or `other.schema.json#/$defs/Name`. `type` of object, string, integer, number, boolean, null, array. `const`, `enum`, `format` (date-time, email, uri), `pattern`, `minLength`, `minimum`, `maximum`, `items`, `minItems`, `maxItems`, `properties`, `required`, `additionalProperties` (false, true, or a schema), `anyOf` with a null branch for nullable, `oneOf` or `anyOf` for unions. A union whose branches all carry one property with distinct `const` values becomes a discriminated union in both languages. Recursive types are not supported.

## Versioning

Every message carries `v`. Schemas are backward compatible from v1: add optional fields, never remove or rename. A breaking change bumps `v` and keeps the old shape readable.
