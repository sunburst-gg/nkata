# Nkata product doc (v1)

Oct 1, 2026 · @Emmanuel Njoku

## Problem

Game teams have no shared system that artists will use. Perforce is the standard and its setup stops a studio from adding a second artist. Diversion and Anchorpoint are easier to set up but keep the same shape: file trees, commits, branches, grey tables. Artists open them once and go back to Discord and Google Drive. Nobody can comment on the work, review a version, see what changed, or know who is working on what. The Sunburst team is in this state today.

The cost: work is lost, versions are mixed, review happens in chat with screenshots, and the team cannot grow.

**Who it is for.** Game studios of 2 to 30 people on Blender and Unreal Engine 5. First customer: Sunburst Interactive, building Rising Sun. First users: one artist, one producer, one engineer, then a second artist.

**One line.** Figma for game development. Every save in Blender shows up in Unreal in seconds. Presence, locks, checks, review in the engine, and one board for the whole project. Real files you keep.

## Goals for v1

1. A second artist joins a project in under 5 minutes: install, sign in, open. No server setup.
2. A Blender save shows in UE5 in under 10 seconds for a character part, with no action by the artist.
3. Every review happens in Nkata or in the engine, with comments pinned on the model. Zero reviews by Discord screenshot after week four.
4. One character (Ojukwu) goes from template to approved through the parts flow, by the Rising Sun artist, with the art director reviewing in UE5.
5. The producer answers "what changed this week, what is stuck, who is on what" from one screen, with no question in Discord.

## Non-goals for v1

- **Web app.** Desktop only. A web viewer comes later when outside reviewers need it.
- **Live co-editing of one object in Blender.** Object-level locks are v1. Live cursors on one mesh are later and the riskiest piece.
- **Code version control.** Code stays in Git. Nkata links to it and publishes builds. It does not replace it.
- **Engines other than UE5, DCCs other than Blender.** Maya, Unity, Godot, Substance come after a second studio asks.
- **AI edits in plain language.** Later. The model and the mirror must exist first.
- **Billing and multi-studio tenancy.** One studio, one project, free. Pricing comes with the second studio.

## Core concepts

&#91;embedded content: data model · project, template, asset, reference, part, and the six things on a part\]

The part is the unit of everything. Locks, presence, versions, comments, checks, and gates all attach to a part, never to a whole asset. The asset is a view over its parts. The template says which parts exist and in what order. The reference is the one thing shared by all parts of an asset.

A part maps to a real file or a real object. In Blender a part is a collection or an object inside a `.blend`. In UE5 a level part is an actor or a named area, using One File Per Actor. A script part is a Markdown file. A sound part is a `.wav`.

The state machine for a part: Locked (gate not open) to Draft (owner is working, saves mirror into UE5) to Ready (owner marked it after the in-engine check) to Approved (art director scored it, part is read-only) and back to Draft on send-back or on reopen by the art director.

## Roles and permissions

Five roles. One person can hold more than one. Producers are admins. The art director is an artist with review rights. A viewer reads everything and comments. Viewers are for investors, publishers, outside writers, voice directors, and anyone who checks progress without Blender or UE5. A viewer needs only install and sign in.

| Action | Artist | Art director | Engineer | Writer | Producer | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Edit and publish a part they own | Yes | Yes | Blueprints, builds | Scripts | Yes | No |
| Edit a part they do not own | No | Yes | No | No | Yes | No |
| Comment on any part | Yes | Yes | Yes | Yes | Yes | Yes |
| Mark a part Ready | Owner only | Yes | Owner only | Owner only | Yes | No |
| Score and approve a part | No | Yes | Engine changes | Canon | Yes | No |
| Reopen an approved part | No | Yes | No | No | Yes | No |
| Remove a gate | No | Yes | No | No | Yes | No |
| Edit a template | No | Yes | No | No | Yes | No |
| Pin reference and tool versions | No | Yes | No | No | Yes | No |
| Assign owners | No | Yes | No | No | Yes | No |
| Roll back a part | Own parts | Yes | Own parts | Own parts | Yes | No |
| Invite, remove, set roles | No | No | No | No | Yes | No |
| Export asset or project to plain folders | Yes | Yes | Yes | Yes | Yes | One asset, as images and glTF |
| Sync the project folder | Yes | Yes | Yes | Yes | Yes | No |

Every action is logged with who and when. The log is visible to producers and art directors.

## User stories

Ordered by priority inside each role.

**Artist**

1. As an artist, I want my Blender save to show in UE5 without an export, so I see my work in the game at once.
2. As an artist, I want to open my part and see the reference and the checks in the panel, so I do not hunt for them.
3. As an artist, I want to know who is in which part right now, so I never wait on a locked file by surprise.
4. As an artist, I want checks to fix scale and naming for me and tell me what they cannot fix, so my part passes review the first time.
5. As an artist, I want to see the art director's comments pinned on my mesh, in Blender and in UE5, so I know exactly what to change.
6. As an artist, I want to roll my part back to any earlier save, so a bad session costs nothing.
7. As a new artist, I want to install, sign in, and open the project in under 5 minutes, so my first day is spent on art.

**Art director**

1. As an art director, I want to review a part in UE5 under real lighting and pin comments on the mesh, so my feedback is exact.
2. As an art director, I want to score and approve a part and have it lock, so approved work does not drift.
3. As an art director, I want to create an asset from a template with owners and a reference in one step, so setup takes minutes.
4. As an art director, I want to remove a gate on one asset when work needs to loop, so the tool bends to the work.
5. As an art director, I want one view of every part that is Ready, so review has a queue.

**Engineer**

1. As an engineer, I want to publish an editor build so artists never compile, so I stop being the build server.
2. As an engineer, I want to know when an asset a system depends on changes, so I am not surprised at integration.
3. As an engineer, I want code to stay in Git untouched, so Nkata does not fight my tools.

**Writer**

1. As a writer, I want to lock and publish a script with a readable text diff, so narrative review is line by line.
2. As a writer, I want dialogue IDs to export to a UE5 string table on Publish, so no line is copied by hand.

**Producer**

1. As a producer, I want one screen that shows who is online, what changed today, what is locked, what is Ready, and what failed checks, so I stop asking in Discord.
2. As a producer, I want to open any asset without Blender or UE5 and see its parts, timeline, and comments, so I can review without an editor.
3. As a producer, I want to see idle assets with no change in 14 days, so nothing is forgotten.
4. As a producer, I want to invite a person, give them roles, and assign them parts, so onboarding is one screen.

**Viewer**

1. As a viewer, I want to see the whole project without Blender or UE5, so I can check progress from any machine.
2. As a viewer, I want to open any asset, rotate the model, and read and add comments, so my feedback lands on the work.
3. As a viewer, I want to follow what changed this week, so I never ask for a status update.

**Edge cases**

- The mirror fails (UE5 closed, import error). The artist sees one line in the panel with the reason. The save still goes to the timeline.
- Two people open the same part. The second sees the owner's name and face and a request-unlock button. No silent overwrite.
- A check fails and cannot auto-fix. Publish is blocked with the list. The artist can still save.
- Offline. Saves queue locally. Presence shows "offline since". Sync resumes on reconnect with no action.
- Nkata is gone. The folder still holds every file. Export to plain folders works with no server.
- A viewer opens an asset whose preview was never exported. The app shows the last render, or "No preview yet" with the owner's name.

## Requirements: P0, v1 cannot ship without these

**R1. Project and folder sync**

- [ ] A project is a normal folder on each machine. The app watches it.
- [ ] Changed files move as content-addressed chunks. Only changed bytes cross the network.
- [ ] A new member installs, signs in, picks the project, and the folder fills. Under 5 minutes to first open on a 50 Mbps line for a 20 GB project, excluding the first full download, which shows progress and can run in the background.
- [ ] Offline saves queue and sync on reconnect with no action.

**R2. Blender to UE5 mirror**

- [ ] On every Blender save of a part, the add-on exports only the changed object and the UE5 plugin imports it in place. Under 10 seconds for a character part under 100k triangles with 4K textures.
- [ ] The UE5 asset keeps its path, name, materials, and references. Nothing in the level breaks.
- [ ] Mirror status shows in both panels: synced with time, syncing, or failed with one line.
- [ ] If UE5 is closed, saves still version. The import runs when UE5 opens.

**R3. Parts, templates, assets**

- [ ] A template is a file in the project folder with parts in order, gates, checks per part, reference slots, export rules.
- [ ] Nkata ships Character, Environment prop, Level, Script, Sound.
- [ ] Create an asset from a template: name, owners per part, reference files. One screen.
- [ ] Each part maps to a Blender collection or object, a UE5 actor or area, a Markdown file, or a sound file.

**R4. Presence and locks**

- [ ] Opening a part locks it to the owner. Everyone sees the owner's name and face on it within 2 seconds.
- [ ] A second person opening a locked part sees the owner and a request-unlock button. No overwrite is possible.
- [ ] The lock releases on Publish or on close. A stale lock releases after 12 hours idle, with a notice.

**R5. Versions and Publish**

- [ ] Every save of a part is a version with who, when, and the mirror result.
- [ ] Publish runs the part's checks, auto-fixes what it can, and lists the rest. If a check fails and cannot fix, Publish is blocked and the artist can still save.
- [ ] Publish marks the version and sets the part to Ready, if the owner says so.
- [ ] Rollback to any version is one click and creates a new version. History is never deleted.

**R6. Checks**

- [ ] Shipped checks: unit scale, naming pattern, triangle budget, LOD count, collision present, UV set present, texture size, rig bone names and count.
- [ ] Each check has a severity (block or warn) and an auto-fix (yes or no), set in the template.
- [ ] Check results show in the editor panel and on the part in the app.

**R7. Review**

- [ ] A Ready part shows in the art director's queue.
- [ ] In UE5 and in the app, the reviewer can pin a comment on a point of the mesh. The comment shows in Blender, in UE5, and in the app at the same point.
- [ ] Score and Approve or Send back. Approve locks the part read-only. Send back sets Draft and notifies the owner.
- [ ] A comment can hold a Linear issue ID. Approve and Send back post to Discord.

**R8. Gates**

- [ ] A part with an unmet gate is Locked and cannot be opened for edit. The panel shows which parts it waits on.
- [ ] When the named parts are Approved, the part unlocks and the owner is notified on Discord.
- [ ] The art director can remove a gate on one asset. Logged.

**R9. The board**

- [ ] One screen: online now, changed today, locked and by whom, Ready for review, failed checks, idle assets over 14 days, assets by state.
- [ ] Filters: person, asset, level, state, date range.
- [ ] Any asset opens to its parts, timeline, comments, and a 3D preview from the last published render, with no editor.

**R10. Export**

- [ ] One click exports one asset or the whole project as plain folders with normal files and a JSON manifest of parts, owners, states, and comments.
- [ ] Export works with the server unreachable, from local data.

**R11. Accounts and roles**

- [ ] Sign in with email. Producer invites by email and sets roles. One person can hold several roles.
- [ ] Permissions as in the roles table. Every privileged action is logged.
- [ ] Viewers are invited by a producer like any member. Viewer seats do not sync files. The app streams previews, renders, textures, and scripts from the store on demand.

**R12. Platforms**

- [ ] macOS and Windows desktop app. Blender 5.x add-on. UE 5.4 and later plugin. Exact versions pinned per project.

## Requirements: P1, soon after v1

- Dependency map. For any part, every level, Blueprint, and material that uses it. UE5 plugin scans references on each import.
- Editor builds. Engineers publish a compiled UE5 editor. Artists press Get editor. Nobody outside engineering compiles.
- String table export. Dialogue IDs in scripts export to a UE5 string table on Publish.
- Object-level merge in Blender. Two owners edit two parts in one `.blend`. The add-on writes both into one file. v1 ships object locks; merge is the step after.
- Live comments in the editors. A new pin shows in Blender and UE5 without a reload.
- Review queue per art director with sorting by age and asset.
- Template editor in the app, not only in the file.

## Requirements: P2, design for them now, build later

- Live cursors on one object in Blender. The add-on streams edits to another machine. Design the version log so an edit stream can replay onto it.
- Web viewer for outside reviewers. Keep the preview renderer and the comment model separate from the desktop shell.
- More editors: Maya, Substance, Unity, Godot. Keep the add-on protocol editor-neutral: part id, object manifest, file, mirror target.
- AI edits in plain language. Keep the manifest rich enough that a model can read what is in a part.
- Multi-studio tenancy and billing. Keep studio id on every row from day one.
- Shared template library across studios.

## Surfaces

Three surfaces. Same data, same words, same state colors everywhere.

**Desktop app (Tauri)**

| Screen | Shows | Actions |
| --- | --- | --- |
| Board | Online now, changed today, locked, Ready, failed checks, idle 14 days, assets by state | Filter, open asset, open person |
| Asset | Parts as rows with owner, state, gate, last change. 3D preview of the last published render. Reference strip. Comments | Open part, assign owner, remove gate, export |
| Part | Timeline of versions with who and mirror result. Checks. Comments pinned on the preview | Roll back, mark Ready, open in Blender or UE5 |
| Review queue | Ready parts, oldest first | Open in UE5, score, approve, send back |
| Person | Their parts, locks, recent activity | Assign, message on Discord |
| Templates | The project's templates | Edit in the app (P1); open the file (v1) |
| Project settings | Members, roles, pinned tool versions, Discord and Linear links | Invite, set roles, pin versions |
| Setup | Sign in, pick project, folder location, first sync with progress | Done in under 5 minutes |

For a viewer the desktop app hides every write action: no lock, Publish, Mark Ready, Approve, Send back, Roll back, Remove gate, or project export. No empty buttons. Export of one asset as images and glTF stays. Setup for a viewer skips the folder step: sign in, pick project, done.

**Blender panel (add-on, N-panel)**

1. Part header: asset, part, owner, state, lock. One line.
2. Mirror status: synced 4s ago, syncing, or failed with one line.
3. Reference strip: thumbnails that open full size.
4. Checks: live list, pass or fail, with Fix buttons.
5. Comments: pins in the viewport, list in the panel, reply inline.
6. One button: Publish. A second, smaller: Mark Ready.
7. Presence: who else is in this asset.

**UE5 panel (plugin, dockable tab)**

1. Same seven elements as Blender, in the same order and the same words.
2. Plus Review: for art directors, Score, Approve, Send back, and comment pin tool in the viewport.
3. Plus Level parts: for level assets, the list of areas, who owns each, lock per area.
4. No engineering terms. No file paths. No commit words. An artist must never need an engineer to read it.

**Words that appear in the product**

- States: Locked, Draft, Ready, Approved.
- Actions: Publish, Mark Ready, Approve, Send back, Roll back, Remove gate, Export.
- Never: commit, branch, merge, checkout, changelist, repository, push, pull.

## Architecture

&#91;embedded content: architecture · three clients, one server, one store\]

**The mirror is local.** Blender and UE5 are on the same machine for most artists. The add-on writes the changed object to a local spool. The agent tells the UE5 plugin to import it in place. No server in the loop. That is how it stays under 10 seconds. The agent uploads the version to the server in parallel. If UE5 is on another machine, the plugin pulls from the server instead. Slower, same result.

**Only the changed object moves.** The add-on exports the part's object or collection, not the whole `.blend`. The `.blend` itself is chunked and versioned by the agent. Both go to the store.

**Locks and presence are server state** over a WebSocket. A lock is granted by the server, never by the client. Offline, a client can edit its own already-locked parts and nothing else.

**Comment pins are coordinates on a part**, in the part's local space, with a version id. Blender, UE5, and the app each draw them from the same record.

**Checks run in the editor**, in the add-on or plugin, against the template's rules. Results post to the server with the version.

**Monorepo**: `server`, `desktop`, `blender-addon`, `ue5-plugin`, `shared` (types, the add-on protocol, the template schema). The add-on protocol is editor-neutral from day one: part id, object manifest, file, mirror target.

## Success metrics

Measured in the app. Evaluated at week 2, week 4, and week 8 after the Rising Sun team moves on.

| Metric | Target | Stretch | How |
| --- | --- | --- | --- |
| Time from install to first open, new member | Under 5 min | Under 2 min | Setup screen timestamps |
| Blender save to visible in UE5, character part | Under 10 s, p95 | Under 5 s | Mirror log |
| Mirror failures per 100 saves | Under 2 | Under 0.5 | Mirror log |
| Reviews done in Nkata or UE5 vs Discord screenshots | 100% by week 4 |  | Count comments; ask the team |
| Parts published per artist per day | Rising week over week |  | Version log |
| Lock conflicts (second person blocked) per week | Visible, then falling |  | Lock log |
| Checks that block Publish, first attempt | Under 20% of publishes by week 4 |  | Check log |
| Producer questions in Discord of the form "who is on X" or "what changed" | Zero by week 4 |  | Ask the producer |
| Second artist onboarded and publishing | Week 2 | Week 1 | Version log |
| One character through template to Approved | Week 4 | Week 3 | Asset state |

Lagging, by week 8: the team says it would not go back. Export never needed for a workaround.

## Open questions

Blocking before build:

- [ ] **Njoku.** Team size, roles, and who the art director is for Rising Sun.
- [ ] **Njoku.** macOS, Windows, or both for v1.
- [ ] **Njoku.** The five assets that conflict most today.
- [ ] **Engineering.** UE5 in-place reimport of a skeletal mesh with materials kept: confirm the API path and the time on a real character before committing to the 10 s target.
- [ ] **Engineering.** Blender partial export of one collection with correct transforms and materials: confirm on a real Rising Sun file.

Not blocking, resolve during build:

- [ ] **Design.** How a comment pin looks in the Blender viewport and in UE5. Same mark in both.
- [ ] **Design.** What the board shows at 1280 px wide next to an open editor.
- [ ] **Victor (studio designer).** Do the Character template parts match how his studio splits work? Where does it break?
- [ ] **Engineering.** Chunk size and dedupe strategy for `.blend` and `.uasset`.
- [ ] **Engineering.** How the UE5 plugin knows which actor is which part for level assets. Tag or naming rule.
- [ ] **Product.** Does Mark Ready belong to the owner or happen on Publish by default?

## Phasing

No dates. Order is fixed. Each step has a gate.

1. **Model and mirror.** Server, store, agent, Blender add-on with mirror into UE5. Gate: one artist saves in Blender and sees it in UE5 in under 10 s, twenty times in a day.
2. **Parts and locks.** Templates, assets, parts, presence, locks, versions, Publish, checks. Gate: a second artist joins in under 5 minutes and both work on one asset with no overwrite.
3. **Review.** UE5 panel with pins, score, approve, send back. Comments in Blender and the app. Gates. Gate: one character through the Character template to Approved.
4. **The board.** Board, asset, part, review queue, person, settings screens. Export. Gate: the producer stops asking status in Discord.
5. **P1.** Dependency map, editor builds, string tables, object-level merge, live pins.

If step 1 misses its gate, nothing else starts. The mirror is the product.
