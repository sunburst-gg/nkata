# Step 7: Blender first

Planned Oct 14, 2026, from the "Nkata v1: Blender first" brief. This file is the plan. It is updated as each slice lands. No code changes before the team has read it.

Work on main. Push after every green `make test`. Open a PR only if you are blocked or a gate fails.

Read CLAUDE.md, the brief, docs/product.md, docs/engineering.md, docs/decisions.md, and this file first.

## Why

The mirror impressed. The artist asked for a note and four checks. Today the flow stops at "which version is this": a version has no note, the card does not exist, the board does not exist, a previous version cannot be opened, and Unreal sits half connected on every screen. v1 is Blender to Blender: publish with a note, four checks that block, a card the next person reads before opening anything, a board a lead opens first, and the export to hand to an engineer. Unreal moves to Coming soon. Nothing is deleted.

## Gate

The day in the brief runs on two machines, end to end:

1. Two artists, two machines, one asset: publish and pull with no message outside Nkata.
2. Four checks block an environment part (texture names, scale, UV sets, triangle budget). Every other check informs.
3. Publish needs a note. Publish is disabled in Blender until the note has text.
4. The next person sees the note, the card, and the delta from the last publish before opening the file.
5. Review round trip under one minute, measured by a script, not promised.
6. Every version opens in Blender with one click, as a new file.
7. The board shows owner, state, whose move, and for how long. Nothing on it is typed.
8. Unreal is behind `UNREAL_ENABLED=false`. The Tools screen shows Coming soon. No code removed. The Unreal editor tests skip, not fail.

Proven by: server tests (publish note, four checks, board data, folders, FBX artifact, feature flag), add-on tests with bpy stubbed (publish panel, note, card preview, export without refusal), desktop tests (board math, delta card, project list, Tools screen), `e2e/model_chain.sh` extended to two folders and a timed review round trip, and a run on two real machines before the box is ticked.

## What exists today, and what each slice reuses

- Save already exports a GLB per version and stores it (step 6). The card and the download build on it.
- `version.note` exists as a column, used only by Roll back. It becomes the publish note.
- The manifest carries objects with triangles, materials, origin, scale, and a bone count. It lacks texture names and UV set names, which the card needs.
- Check contracts live in `shared/checks/`. `name_pattern`, `unit_scale`, `uv_set_present`, `triangle_budget` exist. A texture name check does not.
- Templates are rows per project, written from `server/src/domain/templates.ts` at project creation. The file in the folder is the truth once the agent writes it.
- Compare mode diffs two manifests (`desktop/src/lib/diff.ts`). The delta on the card is the same math on the last two publishes.
- The agent's stream mode fetches one file version into a cache (`stream.rs`). Open previous version is that, plus launching Blender.
- The review route, the inbox, pins, and Send back exist.
- The project screen has All, Characters, Props, Levels tabs and a Ready filter.

## Slices, in order

Each slice is one or two commits with its own tests. Earlier slices are useful on their own; a later one never blocks an earlier one from shipping.

**1. The flag and the quiet.** `UNREAL_ENABLED` in the server config, default false, returned on `/auth/me` and on the agent's `/me` so the app, the agent, and the add-on read one value. With it off: the agent does not try the mirror, the panel hides the mirror line, the app hides mirror status, the Unreal capture path is skipped (Mark Ready renders from Blender), and the Tools and Connections screens show Unreal with a Coming soon tag and one line, "Blender to Unreal mirror ships next", no detect, no install, no error. The level area template is not offered while the flag is off, since a level area is an Unreal part. Unreal editor gates get `@needs_editor` skips keyed on the flag. Tests: the server returns the flag, the agent skips the mirror, the add-on hides the line, the Tools screen reads Coming soon.

**2. Four checks.** New contract `texture_names` (pattern, default `T_.*`, over the images the part's materials use). Template severities change: for a Blender part, `texture_names`, `unit_scale`, `uv_set_present`, `triangle_budget` block; `name_pattern` and `pivot_at_base` inform. The panel shows the four blocking checks as four lines, each with its number and a five word fix when red. Fix still fixes names, scale, and pivot. The prop export is no longer refused on the pivot while Unreal is off: the pivot rule exists for placed copies in an engine that is not connected, and the GLB in the viewer matters more. Decision logged. New projects get the new templates; the test studios are reset.

**3. Publish note.** `POST /parts/:id/publish` takes `note` (required, one line, 200 characters) and `note_engineering` (optional). Migration 0008: `version.note_engineering`, `asset.folder`. The panel's `draw_publish` becomes four rows: the four checks, the Note field with the placeholder "What did you do, what will they get", Details for engineers collapsed, then Publish with the card preview under it. Publish and Mark Ready are disabled until the note has text. The note is the first line on every screen that shows a version.

**4. The card and the delta.** The manifest gains `textures` (names) and per object `uv_sets`, written by the add-on on save, validated in `shared/`. The card is computed from it: part name, triangles, textures by name, scale, UV sets. The part view puts the note at the top in Newsreader, the card under it with the delta from the previous publish beside each value (+2k tris, 1 texture renamed, from `diff.ts`), the four checks as four dots, then the viewer. The versions list down the side shows each version's note.

**5. Download for engineers.** On Publish the add-on also exports an FBX of the part collection, named from the template (`SM_{asset}`, `SK_{asset}_{part}`), stored as a third artifact next to the render and the GLB through the same three step route. The part view gets Download GLB and Download FBX. The file lands with the right name. GLB stays per save; FBX only on Publish, so saves stay fast.

**6. Open a previous version.** A Tauri command asks the agent to fetch that version's file into `<project>/.nkata-agent/versions/<version>/<name>.blend` and launches Blender on it. The file sits outside any part mapping, so the add-on treats it as a plain file: nothing locks, nothing publishes from it. One click per version in the list.

**7. Flat list, folders, tags.** The Characters, Props, Levels tabs go. The project screen is a flat list, sorted by last change. Folders are names the team gives: `PUT /assets/:id` with `folder`, drag an asset onto a folder, folders listed at the top. The template is a tag on the card and a filter in the search bar. Create asset keeps the template picker. The Ready filter stays as the review inbox.

**8. The board.** A pure function in `desktop/src/lib/board.ts` turns assets, parts, versions, checks, and events into rows: part under its asset with the template tag, owner, state, the blocking checks as dots, whose move it is, waiting since the last state change, the last note, published when. Three numbers on top: In work, Waiting on review, Approved. Filters: owner, state, template, folder, Waiting on me. Sort: waiting longest first. Leads land on it; artists land on it with Waiting on me on. A row opens the part view. No drag, no state change from the board. If the loaded data makes it slow at a few hundred parts, a `GET /projects/:id/board` route takes over, same shape.

**9. Review on the part view.** Approve and Send back sit at the bottom of the part view for reviewers. Send back pins the comment on the mesh. The separate review screen is not needed and goes.

**10. The measured day.** `e2e/model_chain.sh` grows into the day from the brief: two folders, two tokens, one asset; publish with a note, pull on the other folder, send back with a pin, publish again, approve; the script prints the round trip time and fails above sixty seconds. Then the run on two real machines.

**11. Docs.** docs/product.md: Unreal to Coming soon, Blender collaboration as the headline, Four checks and Publish note under the artist rules, the panel section rewritten, levels out of v1 with the shared file reason. docs/one-pager.md the same. docs/engineering.md: the flag, the artifacts, the board. docs/decisions.md: one line per call below.

## Decisions to log as they land

- Pivot at base informs and the export is not refused while Unreal is off. The rule guards placed copies in an engine that is not connected.
- The four dots on the board are the template's blocking checks, four for a prop. A character part shows its own blocking set; the column is not fixed at four.
- The note is one line, 200 characters, required for Publish and for Mark Ready. Details for engineers is free text and optional.
- FBX only on Publish, GLB on every save.
- A previous version opens outside the part's mapping so the add-on cannot publish from it.
- Vehicles use the prop template. A Vehicle template arrives when a studio asks for one.
- The board is computed in the app from data it already loads. A server route arrives when a project outgrows that.

## Sizes

| Slice | Size | Touches |
| --- | --- | --- |
| 1 Flag and quiet | small | server config, agent, add-on panel, app Tools and Connections |
| 2 Four checks | small | shared/checks, templates, add-on checks and panel |
| 3 Publish note | medium | migration 0008, publish route, panel, app part view |
| 4 Card and delta | medium | manifest schema, add-on save, app part view |
| 5 Download | medium | add-on FBX export, artifact route, app |
| 6 Open previous version | medium | agent fetch, Tauri command, app |
| 7 Flat list and folders | medium | migration 0008, assets route, app project screen |
| 8 Board | medium | app lib and screen, landing by role |
| 9 Review on part view | small | app |
| 10 Measured day | small | e2e script |
| 11 Docs | small | docs |

Small is under a day. Medium is one to two days. Slices 1 and 2 go first because they take noise out of every screen. Slices 3 and 4 are the product. Slices 5 to 9 are the rest of the day in the brief. Slice 10 is the gate.

## Hell yes tests, kept here so they are not forgotten

- Board: a lead opens it cold and knows what to do in ten seconds without asking.
- Panel: an artist publishes without leaving Blender and the note takes under ten seconds.
- Part view: the receiver knows what changed without opening the file.
- Project list: a new project with one asset does not look empty.
- Tools: nobody asks why Unreal does not work.
