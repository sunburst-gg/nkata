# Nkata desktop app, v8. Implement this.

You are implementing the Nkata desktop app from `Nkata App v8.dc.html`, an interactive HTML prototype in this folder. Open it in a browser and click through every Tweaks combination before writing code. The prototype is the spec. Where this document and the prototype disagree, the prototype wins.

Nkata in one sentence: save in Blender, and your team sees it in 3D, comments on it, and uses it.

## Stack
- Tauri 2, React 18, TypeScript, Vite. Zustand for state. Data behind a `DataSource` interface, mock first.
- Styling: CSS variables (copy the two `[data-theme]` blocks from the prototype's `<style>` verbatim) plus CSS modules. No hardcoded colors in components.
- Radix primitives for Dialog, DropdownMenu, Tooltip, Select. Restyle to the tokens.
- three.js for 3D. Port `nk-viewer.js` as-is; it is a working web component with orbit, poster, ghost wireframe, autorotate, hover-rotate, comment pins with occlusion, a shared pool that caps live WebGL contexts at 8, and `nk-pin` / `nk-pin-select` events.
- Fonts bundled locally: Geist, Geist Mono, Newsreader. The app must work offline.

## Files in this folder
- `Nkata App v8.dc.html`: the prototype. Tweaks: role (lead, artist, viewer), stage (nostudio, noproject, arrival, empty, joining, firstsave, firstcomment, studio), startScreen, simulateSave, simulateJoin, theme.
- `nk-viewer.js`: the 3D viewer. Port it.
- `assets/renders/*.png`: environment renders used by the environment cards.
- `tokens/`, `styles.css`, `readme.md`: brand tokens and voice rules.

## Five nouns, one verb
Project, Asset, Version, Comment, Approved. The verb is Publish: it makes a Version with a one-line note. These words never appear in the UI: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.

## How it works
1. A project is the folder on each artist's computer. Nkata watches it. Subfolders become section headers on the wall. Nobody creates or manages folders in the app.
2. Every Blender save shows on the asset as Live: the latest save, not handed off. Anyone can look and comment.
3. Publish makes a Version. Four checks run first and are shown as plain sentences: textures named right, scale 1.00, UVs present, polycount within budget. A failed check says the fix in one line. Publish is disabled until all four pass and the note has text.
4. Every Version carries a machine-filled card: triangles, textures, scale, UV sets, each with its delta since the last Version.
5. A click on the model is a comment pin, in the commenter's color. It shows in the artist's Blender viewport.
6. A lead approves a Version or requests changes (requires a pin or a line). Approved Versions are what engineers download.
7. Open in Blender and Download (GLB, FBX) use the latest Version unless an older one is picked.
8. Unreal is Coming soon. It appears in Connections only.

## Visual system (the prototype has every value)
- Three surfaces: canvas (white in light, warm charcoal in dark), raised (white / #24211E, two-layer shadow), and the lit stage (vertical cyclorama gradient tinted by the project color via `color-mix`, a floor grid fading out radially).
- At most one border per element. Radii 6 / 12 / 16. Type scale 40 / 28 / 20 / 15 / 13 / 11. Serif (Newsreader, -0.02em) only for page titles, asset names and notes a person wrote. Geist Mono only for numbers, file names, paths, times. Tabular numbers everywhere.
- Amber is `#E9A23B` (dark `#F2B04A`), ink on it, used only for the one primary action on a screen, the Approved seal, and the ghost wireframe.
- Eight person colors: terracotta #B5553B, ochre #C28E2B, olive #6E7F3A, teal #2F7F7A, indigo #4F6D9C, plum #7A4E8C, rose #A4567A, slate #5B6775. Each person gets one; it shows on their avatar ring (2 px), presence dot (outside the edge, 2 px canvas ring, breathing), comment pins, and toasts.
- Never mask, vignette, feather or oval-crop an image. No gray skeletons anywhere. Empty states show the ghost model (amber wireframe at ~35%, turning slowly) on the lit stage.

## Screens
**Zero state** (no sidebar): Name your studio → Start your first project (name chalked into the stage backdrop as you type, eight swatches tint it) → lands on the lead empty wall with the sidebar sliding in.

**Arrival** (artist, viewer): who invited you, the project, the faces already in it, a self-ticking setup list for artists (Blender found, add-on installed, project ready, with Show in Finder), one button. Viewers land straight on the asset they were sent with one note: "Click anywhere on the model to comment."

**Wall** (project home): serif title with the Team strip beside it (avatars in person colors, state under each: Invited, Joined, Blender, In Blender; a dashed + for leads). One chip row: Everything, Mine, Needs my eyes, Approved. Sections per subfolder with "Name · count" and a hairline. Two card types:
- Object card: the lit stage edge to edge, the GLB standing on a contact shadow, hover turns it. Uses the pooled viewer; show a cached still when not live.
- Environment card: the scene render full-bleed, hard edges, "Environment" tag, slow sideways drift on hover.
Card text below, no border: name (15 medium), the note in serif 15 only if one exists, then avatar + "Ada · 2 min ago" in mono 11. Corner pill: "Live", "Needs your eyes" (amber outline), or the amber seal. On save, the card moves to the top and pulses once.
- Lead empty: "Bring your artists." inline email + role select + Invite, one role line, the Stage with the ghost and "Your team's first save lands here." A quiet link to the sample.
- Artist empty: the Stage, "Open Blender and save.", one button, one secondary line. On first save the Stage fills from wireframe to shaded over 800 ms and reads "Your team sees this now." and stays full size for that visit.
- Artist joining a project with work: the full wall plus one slim bar: "Your turn. Open Blender and save."
- First-time notes: one dark callout with a pointer, attached to the thing (first Live pill, first pin), dismissed once per person per idea.

**Asset**: serif name, owner, "in Blender now" when live. The stage at 16:10 with the model, pins, click to comment. Directly under it a slim action bar labeled with the picked Version ("v3 by Ada, 2 min ago"): Approve (amber) and Request changes for leads, Publish for artists, Download and Open in Blender as icon buttons. The bar follows the selected Version. Then the Versions row: cards newest first, Live first when present. Right column: the note in serif 24 (or the Live line in gray), one block "What you are getting" (artists on Live: "Before you publish") with four rows: label, mono value, delta or "same", pass/fail dot, the fix under a failed row. Then comments, pinned ones marked with the commenter's dot.

**Mentions**, **Connections** (Blender connected with version; Unreal Coming soon, no line, no button), **New project**, **Invite** dialog, **Publish** dialog: as in the prototype.

**Sidebar**: studio menu (Settings, Invite people, Training line + switch for leads, Log out), a progress ring row with the next action that disappears when the journey is done, Mentions with count, Projects (color square, "sample" tag on Try Nkata), New project (plus icon, leads), Connections with a green dot, the signed-in person with role.

**Toasts**: dark ink pill, bottom left above the sidebar edge, optional model thumbnail, person color dot, one line, click opens the asset, gone after 5 s.

## Blender add-on (scope it, build after the app)
N-panel: Connected to {project}, team avatars and who is in this file, the four checks live, new comments with Jump to pin, the required note, Details for engineers collapsed, Publish. File not in the project: one button, "Add to {project}", which moves the file into the project folder. Exports a GLB next to the .blend on every save for the app to show.

## Roles in one place
`can(action)` in `src/auth/permissions.ts`. Lead: everything. Artist: publish, open Blender, download, comment. Viewer: look, comment, download images; never render a disabled control for a viewer, and never show them Blender status, folders, paths or setup.

## Motion
150 ms state changes, 300 ms panels, `cubic-bezier(.2,0,0,1)`. Cards lift 2 px on hover. Pins drop with a small bounce. The Approved seal stamps in once. Presence dots breathe. Nothing else moves. Respect reduced motion.

## Copy
Name people. Say what happens next. One line per idea. No exclamation marks, no em dashes. No paths in headlines.

## Order of work
1. Scaffold, tokens, fonts, theme. Port `nk-viewer.js` and render one GLB.
2. Sidebar, header, wall with both card types and sections, Team strip.
3. Asset page with viewer, action bar, Versions row, facts block, comments and pins.
4. Zero state, arrival, lead empty, artist empty, joining bar, first-save fill, first-time notes, toasts.
5. Mentions, Connections, New project, Invite, Publish dialogs, Training in the menu.
6. Roles and the viewer path.
7. Walk every role × stage in the prototype's Tweaks and match it.

## Done means
- `pnpm tauri dev` opens with no console errors and no WebGL context loss on a 30-asset wall.
- Every role × stage matches the prototype at 1280 and 1440, light and dark.
- A GLB loads in the viewer, pins stick to the mesh, hover turns a card.
- `grep -r disabled src/` shows none on a viewer path.
- `DECISIONS.md` lists every call made where the prototype was silent.
