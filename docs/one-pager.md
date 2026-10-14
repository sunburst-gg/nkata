# Nkata: one pager

Sep 28, 2026 · @Emmanuel Njoku

## Nkata

Nkata is Igbo for a conversation. The product is one desktop app that lets a whole game team work on one project together, in the editors they already use. It is the first shared system for the Sunburst team.

One line: Figma for game development. Real files you keep. No commits. No conflicts you have to think about. v1 is Blender first: the Unreal mirror ships next and shows as Coming soon until it does.

## Problem

The Sunburst team has no shared system. The artist works alone and posts results on Discord. Nobody can comment on the work, review a version, or see what changed. Tasks are in Linear, canon is in Notion, reference is in Google Drive.

The team cannot onboard a second artist. Perforce is the industry standard and its setup is too complex: servers, workspaces, typemaps, and changelists are engineering concepts. Anchorpoint and Diversion are easier but they are still version control with a nicer skin, and the skin is not nice. The UI is built by engineers for engineers: file trees, commit lists, branch names, grey tables. An artist opens it and closes it. None of them does presence, checks before publish, review in the engine, or comments on the asset itself. Nobody in this space has shipped a product an artist wants to open.

## Product

1. **Assets as parts.** A character is not a file. It is a set of parts: face, cloth, hair, textures, rig, lookdev, animation, sound. Each part has one owner, its own timeline, and a gate. This is how studios already split work by hand. Nkata makes it the system.
2. **Templates.** A template is one file in the project folder. It lists the parts in order, the gates, the checks per part, the reference slots, and the export rules. Nkata ships with Character, Environment prop, Level, Script, and Sound. The art director edits them or makes new ones. No code.
3. **Gates are defaults, not walls.** The template sets them. The art director can remove any gate on any asset. Work loops, and the tool allows it.
4. **Real files you keep.** Normal `.blend`, `.uasset`, `.wav`, `.md`, and image files in a normal folder. No proprietary format. One click exports any asset, or the whole project, as plain folders. If Nkata dies, the project lives.
5. **No commits.** Every save goes to a timeline. Every save in Blender updates the part in UE5, automatically, in seconds. No export, no import, no button. The only action is Publish. Rollback is one click, per part.
6. **Presence and locks you never think about.** The team sees who is in which part. A lock starts on first edit and ends on Publish. A conflict is a face and a name, not an error.
7. **The reference inside the editor.** Concept sheet, topology rules, color scheme, and budgets are pinned to the asset. Every part opens with them.
8. **Four checks before Publish.** Texture names, scale, UV set, triangle budget block. Naming, pivot, LODs, collision, rig names, texture size inform. Nkata fixes what it can and lists the rest. The rules live in the template.
9. **A note on every Publish.** One line: what you did, what they get. The next person reads the note, the card (triangles, textures, scale, UV sets) and what changed since the last publish before opening the file. Every version opens in Blender with one click.
10. **Review on the model.** In the app, on the published model. The art director rotates it, pins comments on the mesh, scores it. Approve, or send back with the note pinned where it matters. Approved parts lock. With Unreal on, the review moves into the engine under real lighting.
11. **The board.** One screen: every part with its owner, state, four dots, whose move it is, and for how long. In work, waiting on review, approved. Nothing on it is typed.

## How it works by role

Four roles. One person can hold more than one. Producers are admins.

| Role | Who | Works in | Nkata does | Can |
| --- | --- | --- | --- | --- |
| Artists | Art director, environment artists, character artists (face, cloth, hair, texture, rig, lookdev), technical artists, animators, concept artists, sound designers | Blender, Unreal Engine 5, MetaHuman, Substance, Photoshop, DAWs | Locks the part, runs checks, mirrors every Blender save into UE5 so the artist tests it in the game at once. Technical artists own the check rules and the import bridge | Publish parts, comment. Art director: review, score, approve, pin references, pin tool versions |
| Engineers | C++ engineers, Blueprint scripters | Git, UE5 | Code stays in Git. Publishes editor builds so nobody else compiles. Sees when an asset a system depends on changes | Publish builds and Blueprints, comment, approve engine changes |
| Writers | Story writers, narrative designers | Markdown in the project folder | Lock, timeline, and text diffs per script. Dialogue IDs export to a UE5 string table on Publish | Publish scripts, comment, approve canon |
| Producers | Producers, studio leads | Nkata | Sees everything. Opens any asset without Blender or UE5. Filters by person, level, status, date. Owns the board | Admin: invite and remove people, assign roles and owners, set check rules, roll back any part, approve any review |

## Same file, two people

Two people open the same file. Both work. Nobody waits. Nkata locks at the object, not the file. Ada shapes the roof while Chidi builds the door, in the same Blender scene. In UE5 every actor is its own unit, so ten people build one level at once.

Live cursors in Blender and UE5, like Figma. You see your teammate move a vertex. You see the level designer drop a crate. A comment lands on the wall and every editor shows it. The file on disk is still a normal `.blend` or `.uasset`. Nkata is the layer above it that makes one project feel like one room.

## The pipeline

One asset, one chain of parts. Each part has an owner, a state, and a gate. Ojukwu, a character:

| Step | Who | What happens |
| --- | --- | --- |
| Setup | Art director | Creates Ojukwu from the Character template. Pins the reference and budgets. Assigns one owner per part. Pins Blender and UE5 versions |
| Work | Each artist, in Blender and UE5 | Opens the part. The reference and checks are in the panel. Every save goes to the timeline and shows up in UE5 at once. The team sees "Ada is in Ojukwu / face" |
| Publish | The artist | Checks run. Fixes apply. The part is already in UE5. Publish marks the version |
| In engine | The artist, in UE5 | Looks at the part under real lighting, in a real level, with test animations. Fixes in Blender, saves, sees it in UE5 again, until it reads right in the game. Then marks it Ready for review |
| Review | Art director, in UE5 or in Nkata | Rotates the model in the engine. Pins comments on the mesh. Scores it. Approve or send back. Approved parts lock |
| Gate | Nkata | Textures unlock after face, cloth, and hair. Rig after textures. Lookdev after rig. Animation and sound after lookdev. Each owner gets a Discord message when their part unlocks. The art director can remove any gate |
| Assembly | Nkata | Each approval updates the UE5 asset. Ojukwu in the engine is always the sum of approved parts. The dependency map shows every level that uses him |
| Done | Board | Complete when every part is approved. Rollback is per part |

Same shape for everything. Environment prop: concept, model, UVs, textures, LODs, collision. Level: blockout, layout, lighting, set dressing, scripting, audio, one area per part, so ten people build one level. Script: outline, draft, dialogue, VO, string table.

The parts are the files. The state changes when the file publishes, not when someone moves a card. The gates are real locks in the editor, set by the template, and the art director can remove any of them. The reference is in the editor, not in a page nobody opens.

## Month one

1. Model. Server, Postgres, S3-compatible store, content-addressed chunks, auth. Project, asset, part, owner, state, gate, reference, version, comment, check. Tauri shell with the board and the asset view.
2. Blender. Add-on with presence, locks, four checks, the note, Publish, the card, GLB and FBX. Two artists on one asset with no message outside Nkata.
3. Review and the board. Pins on the model, Approve and Send back on the part view, the board with whose move and for how long. Review round trip under one minute, measured.
4. Unreal. Plugin with presence, locks, in-engine review, reference scan. Every save mirrors into UE5 in under 10 seconds. Built, behind a flag, Coming soon until the Blender loop has run for a week.

Gate: one character built through the parts flow by the Rising Sun artist. A second artist set up in under 5 minutes.

Scope stays fixed for four weeks. The Blender to UE5 mirror ships before anything else, because it is the loop artists run twenty times a day. No new features until the team has used it for one week.

## Stack

| Part | Choice |
| --- | --- |
| Desktop app | Tauri, TypeScript |
| Server | TypeScript, Postgres, S3-compatible object store |
| Storage | Content-addressed chunks. Only changed parts move over the network |
| Blender add-on | Python |
| UE5 plugin | C++ |
| Integrations | Discord recaps on Publish, Linear issue IDs on comments |

## Roadmap

&#91;embedded content: roadmap · 4 phases, 3 gates\]

Phase 1 is the month-one scope above. Phases 2 and 3 stay Sunburst only. Phase 4 opens Nkata to a second studio.

## What changes from today

- Work stops living in Discord posts. Discord keeps the recaps; Nkata keeps the work.
- A new artist installs the app, signs in, and opens the project. No server setup.
- Google Drive keeps only raw reference. Canon moves into the project folder as Markdown. Notion stays for planning.
- Linear and Discord stay. Nkata writes to them.

## Name

Nkata is the pick. Short, Igbo, means a conversation. Backups: Ekwe (the Igbo slit drum that calls the village together) and Greybox (the first playable version of a level).

## Next steps

- [ ] Team size and roles
- [ ] Windows, macOS, or both
- [ ] The five assets that conflict most today
- [ ] Confirm the name
- [ ] Spec and repo layout follow the four answers
