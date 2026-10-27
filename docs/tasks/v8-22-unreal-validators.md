# v8 step 22: Unreal judges its own assets

Decided 2026-10-27 with the producer: studios already validate content inside Unreal, with Epic's
Data Validation and their own validators, and that is what the game build enforces. Nkata runs
those on every preview and says what they found, instead of guessing at the same rules from
Blender, where they would drift from the build.
Decisions in docs/decisions.md.

Done means each item holds with an open Unreal editor, and `make test` is green.

- [ ] 1. After each preview import, the plugin runs the editor's validators on what the import
      made (EditorValidatorSubsystem: Epic's and the studio's own), and the mirror result carries
      what they found: errors and warnings, each with the asset and the validator's own words.
- [ ] 2. The app shows them on the asset page under Unreal, and the Blender panel shows them under
      the checks, in the validator's words.
- [ ] 3. A validator error holds Publish into the game, as a block level check does in step 21,
      and a lead can accept it with a reason in the same way.

Gate: a studio validator that rejects a mesh named without its prefix shows its message in the
app and the panel after the next save, and holds Publish until the mesh is renamed or a lead
accepts it.
