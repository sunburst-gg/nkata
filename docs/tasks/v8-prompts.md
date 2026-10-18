# Nkata v8: Claude Code prompts

Moved here from the handoff after step 13. The prototype, the viewer source and the renders it names were removed from the repo; the renders live in desktop/public/fixtures/renders and the prototype's words per Tweak combo in docs/v8-shots/proto-words.json.

These prompts improve the Nkata desktop app to match the v8 prototype, one testable increment at a time, in the existing `nkata` repo. The repo already has the Tauri shell, the Rust agent, the server, sign in, roles and a Blender add-on. These prompts keep all of that and rebuild the screens on top. Data goes through a `DataSource` interface: a mock that copies the prototype's data and logic first (steps 1 to 10), then the real agent and server (step 11). The Blender add-on comes last (steps 12 and 13). Each prompt names its files, the prototype Tweaks that show the target, and a "Done means" list. The hard parts are called out where they land. Where the prototype is silent, the Decisions section at the end of this file answers. The handoff zip carries stale v3 and v4 files that contradict v8; step 0 moves them aside.

## How to use this

1. Put the unzipped handoff and this file in the repo root. Open Claude Code there.
2. Paste step 0 only. Wait until it finishes and its "Done means" is true. Check it yourself.
3. Paste the next step. One step per message, in order. Never paste the whole file at once: Claude Code does better work on one increment with a clear finish line.
4. If a step's "Done means" is not true, say what is wrong in the same session before you paste the next step.
5. After each step, look at the app at 1280 and 1440 in light, then dark, next to the prototype.

Every prompt starts with the same RULES block. It is repeated on purpose, so each prompt works alone.

---

## Step 0: Set up the handoff (run once)

```
STEP 0 OF 13: SET UP THE HANDOFF. RUN ONCE. NO APP CODE IN THIS STEP.

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

GOAL
Put the v8 handoff in the repo as the single source of truth, and make the prototype easy to open and read.

DO
1. Unzip the handoff into handoff/v8/. The zip contains a nested duplicate (handoff/handoff/). Keep one copy only.
2. Move stale files to handoff/v8/_stale/. Add handoff/v8/_stale/README.md with one line per file that says why it is stale:
   - tokens/ : v3 tokens (dark first, blue-grey scale, state colors). v8 tokens are the two [data-theme] blocks in the prototype <style>.
   - readme.md : v3 voice (parts, states, four roles, "say part, lock"). It contradicts the v8 banned words.
   - CHANGES.md : v4 decisions (producer and art director roles, code sign in, switch studio, members, walk, compare). Some items may return; see the open questions.
   - CLAUDE_CODE_PROMPT.md, CLAUDE_CODE_PROMPT_v3.md, "Nkata App v3.dc.html", "Nkata App v4.dc.html", "Nkata App v4 Screens.dc.html", reference/.
   Keep in handoff/v8/: "Nkata App v8.dc.html", support.js, nk-viewer.js, styles.css, renders/, brand/, CLAUDE_CODE_PROMPT_v8.md.
3. Fix the renders path. The prototype loads assets/renders/compound-*.png, but the files ship in renders/. Copy them to handoff/v8/assets/renders/.
4. Add a make target, proto, that serves handoff/v8 at http://localhost:4600. The prototype needs http, not file://, because nk-viewer.js is an ES module with an import map.
5. Write handoff/v8/HOW_TO_READ.md:
   - Open http://localhost:4600/Nkata%20App%20v8.dc.html.
   - Tweaks: role (lead, artist, viewer), stage (nostudio, noproject, arrival, empty, joining, firstsave, firstcomment, studio), startScreen (project, asset, mentions, connections, sample), simulateSave, simulateJoin, theme (light, dark).
   - If the Tweaks panel does not show, the props are in the data-props attribute of the <script type="text/x-dc"> tag. Change a default and reload.
   - The behavior spec is the Component class at the end of the file. Read sync() and renderVals() before you build a screen. The markup blocks are labeled with HTML comments: ARRIVAL, ZERO STATE, SHELL, WALL, TEAM STRIP, Cards, ASSET, MENTIONS, CONNECTIONS, NEW PROJECT, INVITE, PUBLISH, TOAST.
   - The prototype loads three.js, fonts and sample GLBs from CDNs. The app bundles all of them and works offline.
6. docs/decisions.md is the DECISIONS log for this work. Add a "v8" heading. Entry format: date, decision, why, prototype reference (Tweak combo or markup block). First entry: "The prototype is the spec. Tokens come from its <style>. Stale handoff files are in handoff/v8/_stale."
7. Copy this whole prompts file to docs/tasks/v8-prompts.md. Its Decisions section is binding.
8. Create docs/tasks/v8.md: steps 1 to 13, one line each, with a checkbox.

DONE MEANS
- make proto opens the prototype. Renders and models show. Every Tweak changes the screen.
- handoff/v8 has one copy of each file. Stale files sit in _stale/ with reasons.
- docs/decisions.md has the v8 heading and the first entry. docs/tasks/v8.md exists.
- make test is green, as before this step.
```

---

## Step 1: Scaffold, tokens, fonts, viewer, one model

```
STEP 1 OF 13: SCAFFOLD, TOKENS, FONTS, VIEWER, ONE MODEL

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
handoff/v8/HOW_TO_READ.md, handoff/v8/CLAUDE_CODE_PROMPT_v8.md (Stack, Visual system), the <style> block at the top of the prototype, handoff/v8/nk-viewer.js, CLAUDE.md, docs/decisions.md.

PROTOTYPE TARGET
stage=studio, startScreen=asset, light and dark. Only the colors, the type and one lit model matter in this step.

CONTEXT
desktop/ already has Tauri 2, React and the Rust agent in desktop/src-tauri. Do not touch desktop/src-tauri. This step replaces the React UI only.

BUILD
1. Dependencies in desktop/: react 18, zustand, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-tooltip, @radix-ui/react-select, three@0.160.0 (the version the prototype imports), vitest. Remove packages only the old UI used. Log each added package and why in docs/decisions.md.
2. Park the old UI. Move desktop/src/screens/, the components only they use, desktop/src/styles/tokens.ts and desktop/src/data/types.ts to desktop/src/parked/. Nothing imports parked/. Do not delete it.
3. Tokens: desktop/src/styles/tokens.css. Copy the [data-theme="light"] and [data-theme="dark"] blocks from the prototype <style> verbatim. In the same file, add tokens for values the prototype writes inline:
   - --serif: Newsreader, Georgia, serif
   - person colors: --p-terracotta #B5553B, --p-ochre #C28E2B, --p-olive #6E7F3A, --p-teal #2F7F7A, --p-indigo #4F6D9C, --p-plum #7A4E8C, --p-rose #A4567A, --p-slate #5B6775
   - --ok #5A9E6F, --bad #C94C3A, --toast-bg #17181B, --toast-fg #F2EEE8
   - radii 6, 12, 16; type scale 40, 28, 20, 15, 13, 11; --ease cubic-bezier(.2,0,0,1); --t-fast 150ms; --t-panel 300ms
4. Motion: desktop/src/styles/motion.css with the keyframes nk-rise, nk-breathe, nk-drop, nk-stamp, nk-fill, nk-pulse-once, nk-fadein, copied verbatim from the prototype. Base styles: tabular numbers everywhere, font smoothing.
5. Fonts: bundle Geist 400/500/600, Geist Mono 400/500 and Newsreader 400/500 (opsz 6..72) as woff2 in desktop/src/assets/fonts/, with @font-face in desktop/src/styles/fonts.css. No Google Fonts link anywhere.
6. Theme: desktop/src/app/theme.ts. Set data-theme on <html>. Light on first launch, always, whatever the OS says. The person can pick Light, Dark or Match system later in Settings. Store the choice per person.
7. Viewer port: copy nk-viewer.js to desktop/src/viewer/nk-viewer.js. Add desktop/src/viewer/NkViewer.tsx, a typed React wrapper that sets the attributes (src, poster, pins, active-pin, pinning, ghost, autorotate, hover-rotate, bg) and forwards nk-loaded, nk-pin and nk-pin-select as onLoaded, onPin and onPinSelect. Make only these three changes to nk-viewer.js, and log each one:
   a. three imports resolve from the npm package, not an import map.
   b. The :host background becomes transparent. The hardcoded #1B1D21 flashes dark behind models in light theme. The prototype always passes bg="transparent".
   c. The loading and error text read their color and font from CSS custom properties set by the host.
   Do not change the pool, pins, ghost or autorotate code in this step.
8. Fixtures: scripts/fetch-fixtures.sh downloads the eight Khronos sample GLBs the prototype uses (BoomBox, Lantern, ToyCar, SheenChair, AntiqueCamera, WaterBottle, DamagedHelmet, CesiumMan, binary .glb) from github.com/KhronosGroup/glTF-Sample-Assets into desktop/public/fixtures/glb/. It also copies handoff/v8/assets/renders/*.png to desktop/public/fixtures/renders/. Git-ignore the GLBs. make dev runs the script when they are missing. Record the licenses in desktop/public/fixtures/LICENSES.md.
9. One screen: desktop/src/App.tsx shows a 16:10 lit stage, built like the prototype's asset stage: the cyclorama gradient from --stage-top to --stage-bot tinted with color-mix by a project color, and the radial floor grid. NkViewer shows fixtures/glb/Lantern.glb with autorotate 0.5. Add a temporary theme toggle in a corner.
10. Two guard scripts, both run in make test:
   - scripts/lint-colors.mjs fails if any file under desktop/src (except styles/*.css and parked/) contains a hex color, rgb(, rgba(, hsl( or a named color in a style.
   - scripts/lint-copy.mjs fails if a banned word appears in JSX text or in the string props label, title, placeholder, aria-label and children under desktop/src (except parked/). Case insensitive, whole words. An allow-list file for real false positives, each with a reason.

DONE MEANS
- pnpm tauri dev opens one window with the lit stage and the lantern turning. The console is clean.
- Theme toggle: canvas, stage and text switch. No dark flash behind the model in light theme.
- With the network off, fonts and the model still load.
- make test is green, both guard scripts included.
- The stage colors match the prototype asset stage (stage=studio, startScreen=asset) at 1280 and 1440, light and dark.
```

---

## Step 2: Data, store, permissions, dev Tweaks

```
STEP 2 OF 13: DATA, STORE, PERMISSIONS, DEV TWEAKS

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The Component class at the end of the prototype: sync(), renderVals(), simulateSave(), invite(), post(), zeroNext(). handoff/v8/CLAUDE_CODE_PROMPT_v8.md: "How it works" and "Roles in one place".

PROTOTYPE TARGET
Every stage value. This step adds no new visuals. It makes every state reachable and testable.

BUILD
1. Types: desktop/src/data/types.ts.
   - Studio, Project {id, name, color, sample}
   - Person {id, first, name, initial, color, role: 'producer' | 'artDirector' | 'artist' | 'viewer'}. These are the roles the app has today; they stay. The prototype's "lead" is a producer or an art director. DevTweaks role=lead seeds a producer; add role=artDirector to DevTweaks.
   - Member {person, journey: 'invited' | 'joined' | 'blender' | 'inBlender'}
   - Asset {id, name, kind: 'object' | 'environment', group: string | null (first subfolder), owner, glb?, render?, live?: {savedAt}, versions: Version[]}
   - Version {n, note, noteEngineering?, publishedAt, facts: {tris, textures, scale, uvSets}, checks: Check[], approved, changesRequested}
   - Check {key: 'textures' | 'scale' | 'uv' | 'tris', pass, sentence, fix}
   - Comment {id, assetId, version: number | 'live', author, text, pin?: [x, y, z], at}
   Five nouns only. No part, gate or state types.
2. DataSource: desktop/src/data/DataSource.ts. Async reads and a subscribe(handler) event stream with the events saved, published, approved, changesRequested, commented, memberChanged, presence. Methods: listProjects, getProject, listAssets, getAsset, listComments, listMentions, listMembers, invite, publish, approve, requestChanges, comment, createStudio, createProject, setTraining, openInBlender, download.
3. MockDataSource: desktop/src/data/mock/. Port the prototype data exactly: the PC people and colors, the OBJ and ENV lists, the 30-item studio wall (7 of every 10 are objects), notes, times, owners, the seed comments, and the Try Nkata sample with Market stall. Each prototype stage is a seed function: seed('studio'), seed('empty'), and so on, built from sync(). Use the fixture paths from step 1.
4. Store: desktop/src/app/store.ts (zustand). Session (me, role, studio, project), UI (theme, screen, selected asset and version, filter, notesSeen, firstSaveFilled). Pure selectors in desktop/src/app/selectors.ts for what renderVals computes: needsMe, card order (saved first), sections by group, filter counts, journey steps and nextAction, facts with deltas, canReview, canPublish and publishLabel.
5. Permissions, the single gate: desktop/src/auth/permissions.ts exports can(action, role) and a useCan(action) hook. Actions: invite, manageMembers, approve, requestChanges, publish, openInBlender, download, downloadImage, comment, createProject, renameProject, deleteProject, setTraining, billing, seeSetup, seeConnections, seeMine, setBudget. Matrix: producer, everything. Art director: approve, requestChanges, invite (artists and viewers), comment, download, downloadImage, openInBlender, seeConnections, seeMine, setBudget. Artist: publish, openInBlender, download, downloadImage, comment, seeSetup, seeConnections, seeMine. Viewer: comment, downloadImage. From now on, a control a role cannot use is not rendered. Never disabled for a viewer.
6. Dev Tweaks: desktop/src/dev/DevTweaks.tsx, dev builds only. Same props and values as the prototype: role, stage, startScreen, simulateSave, simulateJoin, theme. Also read from the URL: ?role=lead&stage=empty&startScreen=project&theme=dark. A change reseeds the mock, like sync() does. simulateSave and simulateJoin emit events through the mock's event stream, so the app reacts the way it will to real events.
7. Screenshot harness: scripts/shots.mjs with Playwright. For a list of Tweak combos, at 1280x800 and 1440x900, light and dark, it captures the app (vite dev in the browser, mock data) and the prototype (make proto) into docs/v8-shots/<combo>/app.png and proto.png. pnpm shots runs it.

DONE MEANS
- vitest is green. Selector tests reproduce the prototype outputs for stages studio, empty, joining and firstsave. The permission matrix test covers every action for every role.
- Every Tweak value loads without errors. Blank screens are fine in this step.
- pnpm shots writes paired images for three combos.
- No component imports MockDataSource. Everything goes through DataSource.
- Console clean. The step 1 screen still matches the prototype stage at 1280 and 1440, light and dark.
```

---

## Step 3: Shell

```
STEP 3 OF 13: SHELL: SIDEBAR, STUDIO MENU, HEADER, TOASTS

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The SHELL and TOAST markup blocks in the prototype. The Sidebar and Toasts sections of CLAUDE_CODE_PROMPT_v8.md.

PROTOTYPE TARGET
stage=studio for lead, artist and viewer. startScreen=project and mentions. Open the studio menu as each role.

BUILD
- desktop/src/ui/shell/AppShell.tsx: layout, minimum width 1280.
- desktop/src/ui/shell/Sidebar.tsx, NavItem.tsx, ProjectList.tsx (color square, "sample" tag on Try Nkata), MeRow.tsx (avatar, name, role), Breadcrumbs.tsx (shows only when deeper than the project).
- desktop/src/ui/shell/StudioMenu.tsx (Radix DropdownMenu): Settings, Invite people, the Training line with its switch (leads only), Log out. Training copy from the prototype: "On. Sunburst helps train Nok with this project. Names are never attached." and "Off. Billed per seat."
- desktop/src/ui/shell/JourneyRow.tsx: progress ring plus the next action. It disappears when the journey is done. Viewers never see it.
- desktop/src/ui/people/Avatar.tsx: initial, person color, 2 px ring, optional presence dot outside the edge with a 2 px canvas ring and nk-breathe. Every person in the app renders through it.
- desktop/src/ui/toast/Toaster.tsx and toast.ts: dark pill, bottom left above the sidebar edge, optional thumbnail, person color dot, one line, click runs an action, gone after 5 s, one at a time, nk-rise in.
- desktop/src/app/routes.ts: a state router in the store. Screens: zeroStudio, zeroProject, arrival, project, asset, mentions, connections, newProject. Placeholder bodies for screens built later.

DONE MEANS
- Sidebar and menu match the prototype for lead, artist and viewer at stage=studio, at 1280 and 1440, light and dark (pnpm shots).
- Viewer: no New project, no Training, no journey row, nothing disabled.
- A test toast shows, opens its target on click, and leaves after 5 s.
- Console clean. make test green.
```

---

## Step 4: The wall

```
STEP 4 OF 13: THE WALL

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The WALL, TEAM STRIP and Cards markup blocks. The Wall section of CLAUDE_CODE_PROMPT_v8.md. In nk-viewer.js: connectedCallback, _acquire, _release, _boot.

PROTOTYPE TARGET
stage=studio for lead, artist and viewer. stage=joining for artist. Toggle simulateSave and simulateJoin.

BUILD
- desktop/src/screens/Wall.tsx: serif title with the TeamStrip beside it. One FilterChips row: Everything, Mine (not for viewers), Needs my eyes, Approved, with counts. Sections per group: "Vehicles · 4" and a hairline, no headers when there is only one group. 4 columns from 1440 px, 3 below, 24 px gutters.
- desktop/src/ui/cards/ObjectCard.tsx: the lit stage edge to edge, tinted by the project color, NkViewer with hover-rotate, the model on a contact shadow.
- desktop/src/ui/cards/EnvironmentCard.tsx: the render full-bleed, hard edges, an "Environment" tag, a slow sideways drift on hover (transform only).
- desktop/src/ui/cards/CardMeta.tsx: name (15, medium), the note in serif 15 only when a person wrote one, then Avatar plus "Ada · 2 min ago" in mono 11.
- desktop/src/ui/cards/CornerPill.tsx: "Live", "Needs your eyes" (amber outline), or ApprovedSeal (built in step 6; stub it now).
- desktop/src/ui/people/TeamStrip.tsx and desktop/src/app/journey.ts.
- On a saved event: the card moves to the top, pulses once (nk-pulse-once), and a toast "Ada saved Market stall." opens the asset.

HARD PART: THE WEBGL CONTEXT POOL
Browsers drop WebGL contexts past about 16. A 30-card wall must never lose one, and a card must never go blank.
- Keep the cap at 8 live viewers, using the pool already in nk-viewer.js. Cards outside the viewport or past the cap show a cached still.
- Add still capture to nk-viewer.js and log it: after the model loads and the first frame renders, capture the canvas once (toDataURL, webp, at device pixel ratio) into a module Map keyed by src and size. In _release, set that still as the poster before the context is freed.
- Before a still exists, show the ghost wireframe on the lit stage. Never gray, never empty.
- In DevTweaks, show "live contexts n / 8".

HARD PART: THE TEAM STRIP STATE MACHINE (desktop/src/app/journey.ts)
- States per member: invited, joined, blender, inBlender, in that order. inBlender falls back to blender after 60 s without a presence beat. No other move goes backward.
- Label under the avatar: "You" for me, "Lead" for leads, "Looking" for viewers, else Invited, Joined, Blender, In Blender. Invited avatars at 45% opacity. In Blender gets the breathing presence dot.
- Transitions come only from DataSource events (memberChanged, presence). simulateJoin moves one member forward one state.
- Leads get a dashed + at the end of the strip. It opens Invite (built in step 8; stub it now).
- Unit test every transition and the timeout.

DONE MEANS
- stage=studio matches the prototype for all three roles at 1280 and 1440, light and dark: lit object cards with real models, environment cards with hard edges, sections, chips with counts.
- Scroll the 30-asset wall top to bottom five times: console clean, live contexts never above 8, no blank or gray card.
- simulateSave moves the card to the top with one pulse and a toast. simulateJoin walks an avatar through every state.
- grep desktop/src for "skeleton", "mask" and radial-gradient on images finds nothing.
- make test green.
```

---

## Step 5: The asset page

```
STEP 5 OF 13: THE ASSET PAGE

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The ASSET markup block. In renderVals: stops, card, checks, facts, factsTitle, comments, barLabel, canReview, shownNote. The Asset section of CLAUDE_CODE_PROMPT_v8.md. In nk-viewer.js: _dropPin, _renderPins, _tick.

PROTOTYPE TARGET
stage=studio, startScreen=asset (Radio) for lead, artist and viewer. stage=firstcomment. startScreen=sample.

BUILD
- desktop/src/screens/Asset.tsx: serif name, owner, "in Blender now" when live.
- desktop/src/ui/asset/AssetStage.tsx: 16:10 lit stage, NkViewer with pins. Environment assets load their GLB in the same viewer, camera at eye height inside the space, orbit and pan enabled, pins on the geometry. The render shows as the poster until the model loads.
- desktop/src/ui/asset/ActionBar.tsx: directly under the stage, labeled with the picked Version ("v3 by Ada, 2 min ago", or "Live, Ada is saving"). Leads: Approve (amber) and Request changes, only when canReview. Artists: Publish. Download and Open in Blender as icon buttons with tooltips, for roles that can use them. The bar follows the selected Version.
- desktop/src/ui/asset/VersionsRow.tsx: newest first, Live first when present, the selected card ringed, the others at 55%.
- desktop/src/ui/asset/NoteBlock.tsx: the note in serif 24, or the Live line.
- desktop/src/ui/asset/Facts.tsx: "What you are getting" (artists on Live: "Before you publish"). Four rows: label, mono value, delta or "same", pass or fail dot, and the fix under a failed row. Every fact appears once on the page.
- desktop/src/ui/comments/CommentList.tsx and Composer.tsx. Pinned comments carry the commenter's dot.
- desktop/src/ui/asset/Compare.tsx: keep Compare from the current app (spec in handoff/v8/_stale/CHANGES.md, "Asset and Part": wipe between two Versions, F flips, What changed rows). A toggle at the right end of the VersionsRow header, restyled to v8. Walk stays parked: levels are out of v1.

HARD PART: PINS
- The prototype does not listen to nk-pin, so click-to-comment is not wired there. Wire it here. A click without drag (moved under 4 px) emits nk-pin with the hit point. Open the Composer anchored at the pin's screen position, with a pending pin in my color. Enter posts. Esc cancels.
- Pins project to screen from world positions every frame (already in _tick). Occluded pins fade to 25% using the raycast already there. Keep it cheap: skip the raycast for a pin whose screen position did not change since the last frame, and test at most 30 pins per frame.
- Clicking a pin selects its comment (nk-pin-select). Clicking a comment highlights its pin. The camera does not move. Log this.
- New pins drop with nk-drop.
- First-time note on the first pin: one dark callout with a pointer, dismissed once per person (the component is built in step 7; stub it now).

DONE MEANS
- The Radio asset matches the prototype for each role at 1280 and 1440, light and dark.
- A click on the model drops a pin and posts a comment. The pin stays on the mesh while orbiting and fades when the mesh hides it.
- Picking v1 moves the action bar label, the note and the facts to v1.
- Viewer: no Approve, no Publish, nothing disabled. Commenting works.
- Console clean. make test green.
```

---

## Step 6: Publish, Approve, Request changes

```
STEP 6 OF 13: PUBLISH, APPROVE, REQUEST CHANGES

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The PUBLISH markup block. In renderVals: publish, approve, requestChanges, canPublish, publishLabel, stampOn. CLAUDE_CODE_PROMPT_v8.md, "How it works" items 3 to 6.

PROTOTYPE TARGET
stage=studio, startScreen=asset, as artist on the asset that fails the triangle check (mock index 12), then as lead on a published Version.

BUILD
- desktop/src/ui/publish/PublishDialog.tsx (Radix Dialog): the four checks as sentences, a failed one with its fix and the prototype's fix action; the note (required, one line, the prototype placeholder); "Details for engineers" collapsed and optional; the card preview with deltas; the Publish button with the prototype labels ("Publish, after the red one", "Publish, after the note", "Publish v4"). Only artists see this dialog.
- desktop/src/ui/asset/ApprovedSeal.tsx: amber seal with a check at -6 degrees, nk-stamp once when it appears.
- Request changes needs a pin or a written line from me on this Version, per the spec. The prototype accepts only a pin. Follow the spec and log it. Without either, a toast says what to do.
- Events published, approved and changesRequested go through DataSource. Toast copy from the prototype: "Published v4. Emeka can see it now.", "Approved v3. Ada knows.", "Sent to Ada. The pin is in Blender now."
- Wall reacts: a published asset shows "Needs your eyes" for leads and joins their Needs my eyes count. An approved one gets the seal. Both move to the top.

DONE MEANS
- Artist: fix the red check, write a note, publish. The asset and the wall update. The lead's Needs my eyes count goes up by one.
- Lead: Approve stamps the seal once. Request changes with no pin or line explains itself in a toast; with one, it sends.
- The mock keeps these results for the session.
- The dialog matches the prototype at 1280 and 1440, light and dark. Console clean. make test green.
```

---

## Step 7: First run

```
STEP 7 OF 13: FIRST RUN

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The ARRIVAL, ZERO STATE, "Lead, empty", "Artist or viewer, empty: the Stage" and "Slim bar" markup blocks. sync(), zeroNext(), simulateSave(). CLAUDE_CODE_PROMPT_v8.md: Zero state, Arrival, Wall.

PROTOTYPE TARGET
stage nostudio and noproject. stage=arrival as artist and viewer. stage=empty as lead, artist and viewer. stage=joining as artist. stage=firstsave as artist. stage=firstcomment.

BUILD
- desktop/src/ui/stage/Stage.tsx: the reusable lit stage with the ghost model (amber wireframe at about 35%, turning slowly).
- desktop/src/screens/ZeroStudio.tsx and ZeroProject.tsx: no sidebar, the Stage behind one field. On ZeroProject the typed name appears chalked into the backdrop, and the eight swatches tint it. Create lands on the lead empty wall and the sidebar slides in over 300 ms.
- desktop/src/screens/Arrival.tsx: who invited you, the project, the faces, one button. Artists get the self-ticking setup list (Blender found with its version, Nkata add-on installed, project ready on this computer with Show in Finder). Each row ticks on a DataSource event, not a timer. The mock emits them 700 ms apart. Viewers from a link land straight on the asset with "Click anywhere on the model to comment."
- desktop/src/ui/wall/LeadEmpty.tsx: "Bring your artists.", inline email, role select, Invite, the one role line, the Stage with "Your team's first save lands here.", and the quiet link to the sample.
- desktop/src/ui/wall/ArtistEmpty.tsx and ViewerEmpty.tsx with the prototype copy.
- desktop/src/ui/wall/YourTurnBar.tsx: the slim bar for an artist joining a project that has work.
- desktop/src/ui/notes/FirstTimeNote.tsx: one dark callout with a pointer, anchored to its target, shown once per person per idea (live, pin), stored per user. Wire it on the first Live pill and the first pin.
- JourneyRow from step 3 now reads real journey steps and nextAction.

HARD PART: THE FIRST-SAVE FILL
- On the first saved event for me while the Stage shows the ghost: set ghost=false on the same viewer instance (no remount, no new context), run nk-fill over 800 ms, and change the line to "Your team sees this now." with the Publish hint under it.
- The Stage stays full size for the rest of that visit. On the next visit it is a normal card on the wall.
- With reduced motion: no fill, a 150 ms crossfade.

DONE MEANS
- Every stage and role listed above matches the prototype at 1280 and 1440, light and dark.
- From stage=noproject: type a name, see it on the backdrop, pick a color, create, land on the lead empty wall. Under 30 seconds, two fields total.
- stage=empty as artist, then simulateSave: the ghost fills to the shaded model with no flash and no remount.
- No gray anywhere in the empty states. Console clean. make test green.
```

---

## Step 8: Account, studio, mentions, new project, invite

```
STEP 8 OF 13: ACCOUNT, STUDIO, MENTIONS, NEW PROJECT, INVITE

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The MENTIONS, NEW PROJECT and INVITE markup blocks. invite() and the mentions value in renderVals. The current sign in, studio and members code in desktop/src/parked/. handoff/v8/_stale/CHANGES.md sections "Sign in and code", "Studios", "Members", "Project" (behavior to keep).

PROTOTYPE TARGET
startScreen=mentions for each role at stage=studio. New project from the sidebar. Invite from the Team strip + as producer. Screens the prototype does not have (sign in, settings, members) take the v8 visual system: light, lit stage where there is room, serif titles, one primary action.

KEEP AND RESTYLE (these exist today; their behavior stays)
- Sign in: email, then the six-box code, wrong code, used up code, "Not {email}? Use another email". The lit stage with the ghost model sits behind the form, like the zero state. Name and Create studio open only when needed, as today.
- Studio menu: Settings, Switch studio (rows with mark, name, role and project count), New studio, Invite people, Training (producer), Log out.
- Settings, one screen with sections: You (name, theme: Light, Dark, Match system), Members (producer: role select with Artist, Art director, Producer, Viewer, Remove; last producer cannot leave; others see roles as text), Project (rename, delete, deleted projects with Restore), Billing (producer; "Nothing to pay" with Training on, seats and price with it off).
- Roles are the four the app has: producer, art director, artist, viewer. The role line in Invite and Members says what each can do in one sentence.

BUILD
- desktop/src/screens/SignIn.tsx, Code.tsx, ZeroStudio.tsx reuse (step 7), desktop/src/screens/Settings.tsx with section components in desktop/src/ui/settings/.
- desktop/src/ui/shell/SwitchStudioDialog.tsx.
- desktop/src/screens/ProjectSettings.tsx: opened from the project title menu on the wall. Sections: General (name, color), Budgets (a row per kind: Props, Vehicles, Characters, Environments, each a triangle number in mono with a stepper, plus an optional max texture size), Members of this project. Only can('setBudget') sees Budgets as editable; others do not see the section. Saving a budget re-runs checks on every asset in the project and shows a toast: "Budgets saved. 2 assets are over now." when that is true.
- On the asset page, leads get "Set a budget for this asset" in the facts block menu. An override shows as a small mono line under Triangles: "Budget 45,000 for this asset."
- DataSource: getBudgets(projectId), setBudgets(projectId, budgets), setAssetBudget(assetId, n). The mock seeds the defaults.
- desktop/src/screens/Mentions.tsx: rows with the model still or render, the pin spot, who, the verb, the text, when. Click opens the asset at that pin.
- desktop/src/screens/NewProject.tsx: name, the eight swatches, the backdrop preview. Reuse the ZeroProject pieces.
- desktop/src/ui/invite/InviteDialog.tsx: email, role select, the one line for the picked role, Enter sends. The invited person appears in the Team strip at once as Invited. Art directors can invite artists and viewers only.

DONE MEANS
- Sign in, code, settings and switch studio work end to end on the mock, light first, and look like the same app as the wall.
- Mentions, New project and Invite match the prototype for each role at 1280 and 1440, light and dark.
- Invite three emails in under a minute. Three avatars appear as Invited.
- Every role sees only what can() allows. Nothing disabled for a viewer.
- Console clean. make test green.
```

---

## Step 9: Connections: Blender in, Blender out

```
STEP 9 OF 13: CONNECTIONS: BLENDER IN, BLENDER OUT

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
The CONNECTIONS markup block. desktop/src-tauri tool detection and add-on install (tools.rs and the decisions about `blender --command extension install-file`). The Decisions section in docs/tasks/v8-prompts.md, "Connections".

PROTOTYPE TARGET
startScreen=connections, artist and producer. Every other state below is not in the prototype; build it in the same visual system and log each screen.

THE IDEA
Connecting Blender is the first thing an artist does and the thing that breaks most. Every state says what is true, in one line, and offers the one action that fixes it. Nobody ever reads a log or a path to fix Nkata.

STATES FOR BLENDER (one card on Connections, same card in Arrival setup)
1. Not found. "Blender is not on this computer." Primary: Find Blender (file picker for the app). Secondary link: Get Blender (opens blender.org). 
2. Several found. "Nkata found 2 Blenders." A row each with version; the person picks one. Remember it.
3. Version not supported. "Blender 3.6 is too old. Nkata works with 4.2 and newer." Secondary: Find another Blender.
4. Found, add-on not installed. "Blender 4.2.3 found." Primary: Connect Blender. It installs and enables the add-on, then ticks.
5. Add-on out of date. "The Nkata add-on needs an update." Primary: Update. Blender may be open: if so, "Restart Blender to finish." after the update.
6. Connected, Blender closed. Green dot. "Blender 4.2.3. Add-on 1.4.0." Actions: Open Blender. A ··· menu with Pause, Disconnect.
7. Connected, Blender open. Breathing dot in my color. "In Blender now: market_stall.blend" (file name in mono, it is a detail line, not a headline).
8. Connection lost. Blender is open but no heartbeat for 60 s. "Blender stopped talking to Nkata." Primary: Reconnect (reloads the add-on). Secondary line: "Your work is safe in the file."
9. Paused. Neutral hollow dot. "Paused. Saves stay on this computer until you resume." Primary: Resume. While paused, a slim line at the top of the wall says the same, with Resume.
10. Disconnected. "Blender is not connected." Primary: Connect Blender.

DISCONNECT
- From the ··· menu. A small dialog: "Disconnect Blender? The add-on is removed. Your files stay where they are. Your team keeps everything you published." Buttons: Cancel, Disconnect (not amber; this is not the primary action of the screen).
- After: toast "Blender disconnected. Your files stay where they are." The Team strip shows me as Joined, not Blender.

PROJECT ON THIS COMPUTER (artists, same screen, under Blender)
- One row per project: name, size on disk in mono, Show in Finder, ··· with Move and Stop syncing here.
- Move: pick a new location, Nkata moves the files and keeps watching. Toast when done.
- Stop syncing here: "Stop syncing Rising Sun on this computer? The files stay. New saves from your team will not arrive here." The project stays in the sidebar with a hollow dot and a Sync again action.

NKATA ITSELF
- Agent not running: a full-width slim line, top of every screen: "Nkata is not running in the background. Restart it." with a Restart button.
- Offline: "Offline. Changes go out when you are back." No button. It clears by itself.

UNREAL
- One card: "Unreal Engine. Coming soon." Nothing else. The code stays behind UNREAL_ENABLED=false.

SIDEBAR
- The Connections dot: green when everything works, hollow neutral when paused, red when an action is needed. Hover tells why in one line.

VIEWERS
- Viewers never see Connections, Blender status, paths or disk rows. can('seeConnections') is false for them; the row is not rendered.

BUILD
- desktop/src/screens/Connections.tsx, desktop/src/ui/connections/BlenderCard.tsx, ProjectDiskRow.tsx, UnrealCard.tsx, DisconnectDialog.tsx, StatusLine.tsx (agent and offline lines).
- desktop/src/app/connection.ts: a state machine with the ten Blender states above, driven only by DataSource events (toolDetected, addonInstalled, addonOutdated, heartbeat, heartbeatLost, paused, resumed, disconnected). Unit test every transition.
- Add those events and the actions connectBlender, updateAddon, pickBlender, pause, resume, disconnect, moveProject, stopSyncing, restartAgent to DataSource and the mock. Add a DevTweaks control "blender" that jumps to any of the ten states.
- Arrival (step 7) uses BlenderCard for its setup list, so first run and Connections never disagree.

DONE MEANS
- Every one of the ten Blender states renders from DevTweaks, light and dark, at 1280 and 1440, each with one line and at most one primary action.
- Connect, pause, resume, disconnect and reconnect work end to end on the mock, and the Team strip follows.
- A viewer sees no Connections row anywhere.
- No path appears in a headline. Console clean. make test green.
```

---

## Step 10: Roles, the viewer path, motion, the full walk

```
STEP 10 OF 13: ROLES, THE VIEWER PATH, MOTION, THE FULL WALK

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
CLAUDE_CODE_PROMPT_v8.md: Roles, Motion, Copy, Done means.

PROTOTYPE TARGET
Every role, stage and startScreen combination.

BUILD
1. Viewer audit. Render each screen as a viewer and list every control. Each one must be usable. No Blender status, Connections, folders, paths, setup or journey row. Add desktop/src/auth/viewer.test.tsx: it renders every screen as a viewer and fails on any disabled attribute or aria-disabled.
2. can() audit. grep for role checks outside desktop/src/auth/. Replace each with can(action). There is one gate.
3. Motion pass. 150 ms state changes, 300 ms panels, --ease. Cards lift 2 px on hover. Pins drop, the seal stamps once, presence breathes. Nothing else moves. With prefers-reduced-motion: no pulse, no drift, no autorotate, fills become 150 ms crossfades.
4. Copy pass. Run lint-copy. Read every string against the Copy rules. Names before files. No paths in headlines.
5. Accessibility. A visible focus ring on every control (2 px amber, offset by the canvas). All readable text passes WCAG AA. Hit targets at least 32 px.
6. Full walk. Extend pnpm shots to every combo: 3 roles, 8 stages, each startScreen that applies, 2 themes, 2 widths. Write docs/v8-shots/REPORT.md: one line per combo, "match" or "diff" with what differs. Fix diffs until every line is a match or points to a logged decision.

DONE MEANS
- viewer.test.tsx green. grep -rn "disabled" desktop/src finds nothing on a viewer path.
- No role checks outside can().
- REPORT.md is all match, or each diff points to a decision.
- pnpm tauri dev with the 30-asset wall, 10 minutes of normal use: console clean, no WebGL context loss.
- Every screen matches the prototype at 1280 and 1440, light and dark. make test green.
```

---

## Step 11: Live data from the agent and server

```
STEP 11 OF 13: LIVE DATA FROM THE AGENT AND SERVER

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
docs/engineering.md (agent local API, server REST, events), server/src/db/schema.ts, the agent routes in desktop/src-tauri, desktop/src/data/DataSource.ts.

PROTOTYPE TARGET
The same screens as before, now with real data on two machines.

BUILD
1. desktop/src/data/live/LiveDataSource.ts implements DataSource over the agent local API (localhost:7420) and the server events (/events?since=). desktop/src/data/index.ts picks the source: the mock in tests and with ?mock=1 in dev, live otherwise.
2. Map the v8 nouns onto the existing schema and write the migration:
   - One asset is one .blend with one part. The UI never says part.
   - version gets note (required) and note_engineering (optional).
   - asset gets kind (object, environment) and group (the first subfolder under the project folder, or null).
   - Member journey comes from invite, sign in, agent tool detection and presence.
   Do not drop old columns. Log which are unused now.
3. Presence: the add-on sends a heartbeat with the open .blend every 20 s (step 12). inBlender times out after 60 s.
4. Facts and checks come from the manifest the add-on writes (step 13). Until it exists, compute triangles from the GLB and show the other three checks as a neutral "Not checked yet" line, never as a pass.
5. Error states, in the voice:
   - Agent not running: "Nkata is not running on this computer. Open it from Applications."
   - Server unreachable: the wall stays, with one slim line: "Offline. Changes go out when you are back."
   - Model failed to load: the last still with "Model did not load. Showing the last render."

DONE MEANS
- Two machines, one project: a save on machine A shows on machine B's wall within the mirror target in docs/decisions.md, with the toast.
- Invite from A, sign in on B: A's Team strip walks Invited, Joined, Blender.
- Stop the server: the offline line shows, nothing crashes. Start it: the app catches up from /events?since=.
- Tests for the mapping and the migration green. Console clean.
- Every screen still matches the prototype at 1280 and 1440, light and dark (pnpm shots with ?mock=1).
```

---

## Step 12: Blender add-on, the panel

```
STEP 12 OF 13: BLENDER ADD-ON, THE PANEL

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
blender-addon/nkata/panel.py and its operators. The "Blender add-on" section of CLAUDE_CODE_PROMPT_v8.md. The PUBLISH markup block (same content as the panel's publish area).

TARGET
The panel uses Blender's own grays, sizes and spacing. Nkata shows only through the Publish button in amber, people colors on avatars and pins, and the small Nkata mark. It must not look like a web page inside Blender.

BUILD
1. Rewrite blender-addon/nkata/panel.py for v8. Top to bottom:
   - "Connected to {project}", or one button "Add to {project}" when the file is outside the project.
   - Team avatars in person colors, and who is in this file now.
   - The four checks, live as the artist works: re-run on depsgraph update, at most once every 2 s. A failed check says its fix in one line.
   - New comments, each with "Jump to pin".
   - The note (required), "Details for engineers" (collapsed), Publish. Publish uses the app's labels ("Publish, after the red one", "Publish, after the note").
2. "Add to {project}": move the .blend into the project folder, keep texture paths working (relink or pack; log which and why), reopen the file from its new path, confirm in one line.
3. Heartbeat to the agent every 20 s with the open file path. It drives presence in the Team strip.
4. Remove every old element from the panel: state, gate, mark ready, mirror status, and every banned word.

DONE MEANS
- In Blender 4.2 and 5.x, the panel loads with no errors in the system console and reads as part of Blender.
- "Add to Rising Sun" moves a file and its textures still resolve.
- A red check turns green within 2 s of the fix.
- Publish from Blender creates a Version that shows in the app with its note and the toast.
- pytest for the operators green (Blender in background mode).
- The app is unchanged: console clean, screens match the prototype at 1280 and 1440, light and dark.
```

---

## Step 13: Blender add-on, export, stills and pins

```
STEP 13 OF 13: BLENDER ADD-ON, EXPORT, STILLS AND PINS

RULES (same in every step)
1. The prototype handoff/v8/Nkata App v8.dc.html wins over any written description, this prompt included.
2. Tokens only. No hex, rgb or named colors in components. Amber is #E9A23B (dark #F2B04A) with ink on it, used only for the one primary action on a screen, the Approved seal and the ghost wireframe.
3. Never mask, vignette, feather or oval-crop an image. No gray skeletons. Empty states show the ghost model on the lit stage.
4. Never render a disabled control for a viewer. Check can(action) and leave the control out.
5. Banned in UI text: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
6. Short copy. No exclamation marks, no em dashes, no paths in headlines.
7. Where the prototype is silent, decide, then log it in docs/decisions.md with the date.
8. Follow CLAUDE.md for commits. Push to main after each green step.
9. Light mode first. The app opens in light. Dark is a choice the person makes.
10. Decisions in docs/tasks/v8-prompts.md (section "Decisions") are binding.

READ FIRST
blender-addon/nkata: the save_post hook, the exporters, the gpu pin overlay. The manifest section of docs/engineering.md.

TARGET
Everything the app needs from each save: a model, the facts, the kind, a still for environments, and pins back in the viewport.

BUILD
1. On every save (save_post), export a GLB next to the .blend: textures embedded, Y up, modifiers and scale applied, no Draco. Write a manifest JSON next to it: kind, triangles, texture names, scale, UV sets per mesh, and the four check results with sentence and fix.
2. Kind, in this order: the first subfolder name (Characters, Props, Vehicles, Environments and close variants); an armature with skinned meshes means a character, which is an object; a bounding box over 10 m, or many separate objects spread on a floor, means an environment; else an object. The artist can change it once in the panel. It is remembered per asset.
3. Environments: export the GLB like objects (meshopt compression on, so large spaces stay small; the app's viewer gets the meshopt decoder) and also render a 1600x1000 still from the scene camera, or a default eye-height camera, with Eevee at low samples, in under 3 s. The still is the wall card and the poster. Objects need no render; the app captures its own still.
3b. Budgets: read the asset's project budgets from the agent before running the checks. Never hardcode a number.
4. Pins in the viewport: the gpu overlay draws each comment pin in the commenter's color at its world position, hidden by geometry using the depth buffer. "Jump to pin" frames the view on it. Comments made in the app arrive within 5 s.
5. A save must not feel slower. Do the export off the main thread where Blender allows. Measure save time with and without Nkata on a 50k-triangle prop and a 2M-triangle environment. Log the numbers in docs/decisions.md.

DONE MEANS
- Save a prop: the GLB and manifest appear, and the app wall shows the model with the right facts.
- Save an environment: the still appears as an environment card.
- A pin made in the app shows in the Blender viewport at the right spot and hides behind geometry.
- Save overhead is logged, and under 1 s on the 50k prop.
- The app is unchanged: console clean, screens match the prototype at 1280 and 1440, light and dark.
```

---

## Decisions

These answer what the prototype leaves open. They are binding. Claude Code logs each one in docs/decisions.md in step 0.

1. **Light first.** The app opens in light on first launch, whatever the OS says. Dark and Match system are choices in Settings.
2. **Sign in stays.** The email code flow the app has today stays, restyled to v8 (step 8).
3. **Roles stay.** Producer, art director, artist, viewer. The prototype's lead is a producer or an art director. Producer owns members, billing, training and project deletion. Matrix in step 2.
4. **Studio features stay.** Switch studio, new studio, members, rename, delete and restore project, settings, billing. Restyled to v8 (step 8).
5. **Compare stays, Walk is parked.** Compare is how a lead sees what changed between Versions. Walk is for levels, and levels are out of v1.
6. **Connections are a first-class screen.** Ten Blender states, pause, disconnect, move project, stop syncing, agent and offline lines (step 9).
7. **Click to comment.** The composer opens at the pin on the model, not in the side column.
8. **Pins on environments are 3D.** The asset page loads the environment GLB in the viewer, at eye height, and pins stick to the geometry like on objects. The wall card still uses the render.
9. **Deltas.** More triangles shows neutral. Fewer shows green. Amber stays for its three uses only.
10. **System text.** Lines like "Saved, not published yet." are sans, ink at 40%, not italic. Serif and italics are only for words a person wrote.
11. **"Triangles", not "Polycount",** in the app and the add-on.
12. **Budgets are per project.** Each project has its own budgets, set by its lead (producer or art director) in that project's settings: a triangle budget per kind and, optionally, a texture size limit. New projects start from defaults: prop 30,000, vehicle 60,000, character 80,000, environment 2,000,000. A lead can override one asset from the asset page. Checks and the Blender panel always use the budget of the asset's project.
13. **Request changes** needs a pin or a written line on that Version.
14. **Viewer downloads.** Viewers get Download image (a PNG of the current view). No GLB or FBX.
15. **FBX on demand.** GLB on every save. FBX is exported only when someone downloads it.
16. **Training.** The switch stays for producers. On: "Nothing to pay." Off: billed per seat, shown in Billing.
17. **Fixture models** are fetched at dev time and git-ignored.
18. **Journey row copy.** One pending person: "Waiting for Ada to join." More: "Waiting for 3 people to join."
19. **Unreal.** Behind UNREAL_ENABLED=false. "Open in Unreal" and the old mirror status appear nowhere. Connections shows Coming soon.
20. **Pause** stops sending saves from this computer only. Live and presence stop for the team; nothing is lost.
