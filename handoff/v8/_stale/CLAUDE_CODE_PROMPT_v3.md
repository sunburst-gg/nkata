# Nkata desktop app, v3. Build this.

You are building the Nkata desktop app from `Nkata App v3.dc.html`, an interactive HTML prototype in this folder. Open it in a browser and click through it before writing code. It is the spec. Where this document and the prototype disagree, the prototype wins.

Nkata is a desktop app for game studios. Artists work in Blender and Unreal Engine 5. Every Blender save mirrors into Unreal in seconds. Producers and reviewers use the app to see every asset in 3D, leave comments pinned on the model, and track state, with no Blender or Unreal on their machine.

## Stack
- Tauri 2, React 18, TypeScript, Vite.
- Styling: CSS variables from `tokens/` plus CSS modules. No hardcoded hex in components.
- shadcn/ui (Radix) for Dialog, DropdownMenu, Tooltip, Toast, Tabs, Select, Avatar, Input. Restyle to the tokens.
- three.js for the model viewer. Port `nk-viewer.js` as-is; it is a working web component.
- Fonts: Geist, Geist Mono, Newsreader, bundled locally. The app must work offline.
- State: Zustand. Data behind a `DataSource` interface with a mock implementation first.

## Files in this folder
- `Nkata App v3.dc.html`: the prototype. Every screen, state, and interaction.
- `nk-viewer.js`: the 3D viewer web component. Orbit, zoom, pan, poster while loading, progress, comment pins with occlusion, `nk-pin` and `nk-pin-select` events.
- `styles.css`, `tokens/*.css`, `tokens/tokens.json`: color, type, spacing, radius, shadow, motion tokens. Dark and light.
- `assets/renders/*.png`: placeholder renders.
- `readme.md`: brand and voice rules.

## Hierarchy
Account → Studio → Project → Asset → Part. One account, many studios. The studio switcher menu has four items: Settings, Invite and manage members, Switch studio, Log out.

## Screens, in the order a new user meets them
1. **Sign in.** Centered. Logo, serif "Welcome to Nkata", Continue with Google, Or, Email address, Continue, one line about the magic link and terms.
2. **Name.** "What should we call you?" Avatar, name field, Continue. Top right: "Not {email}? Log out".
3. **Create your studio.** Studio name. One Training toggle, on by default. On: "Nkata is free. Your team's work in Blender and Unreal teaches Nok how experts build games." Off: "Nkata bills your studio per seat each month. Nothing your team makes is used for training." Under it: "Same features either way. Change it any time in Settings." There are no plans and no Upgrade anywhere in the app.
4. **Welcome.** Sidebar appears. Serif "Welcome, {first name}". Three cards, each a miniature of the real screen on a blurred render, with a cursor that moves to the control on hover: Create a project, Connect your editors, Invite your team.
5. **New project.** Name, folder (native picker), Blender and Unreal versions pre-filled from detection. Create project.
6. **Project, empty.** Header: icon, serif name, folder path in mono, created date, owner, Training badge. Buttons: Open folder, Members, ··· (Rename, Export, Delete project). Tabs All, Characters, Props, Levels with counts. Empty state: "No assets yet. Save a part in Blender and it appears here." and Create asset. If editors are not connected: "Connect Blender and Unreal to start" and a Connections button.
7. **Connections.** Grid of cards with real tool logos. Blender and Unreal: detected version, Connect. Discord: Connect. Linear, Substance, Maya, Houdini, Unity, Godot: Soon. Auto-detect on every launch.
8. **Members.** Modal. Search or email, role picker (Artist, Art director, Producer, Viewer), Add. List of people with role on the right. Owner is the first producer.
9. **First mirror.** First asset tile appears with the live render. Tile border pulses once in the accent. Toast: "Market stall / model synced to Unreal".
10. **Project with assets.** Tiles 280 px minimum, latest render, one state badge, faces of who is in it. Status line "3 online · 12 changed today · 2 ready for review" opens the activity rail with a Review button and count.
11. **Asset.** Parts strip across the top. 3D viewer below with Pin a comment and Full screen. Comments on the right. Buttons: Open in Blender, Open in Unreal, Export, Assign, Remove gate.
12. **Part.** Versions as a vertical strip on the left. 3D viewer center. Checks (with Fix) and comments right. Click a version to preview it; a Roll back bar appears. Roll back creates a new version.
13. **Full screen review.** Dark overlay. Model fills the window, comment rail on the right, Pin a comment in the top bar, Esc closes. Pins and comments are the same data as the asset screen.
14. **Mentions.** Comments that name you, newest first. Click opens the part.
15. **Settings.** Left nav: Personal (Account), Studio (General, Members, Billing, Training), Tools (Connections, MCP soon, Agents soon). Training: toggle, who changed it last, history. Billing: "Nothing to pay" while training is on; "Billed per seat" with seats, payment method, invoices when off. Only producers change training. Every change is logged.
16. **Ask.** Cmd K anywhere. Question in, answer with the gate, the owner, the last comment, and a link.

## The 3D viewer
- Port `nk-viewer.js`. It loads glTF/GLB. Blender exports GLB natively, so the Blender add-on exports a GLB next to the .blend on every publish. The app loads that GLB. Materials, textures and rigs come through. Blender-only features (geometry nodes, modifiers) are applied at export.
- Unreal side: on Mark Ready, the Unreal plugin captures the viewport under scene lighting. That image is the tile thumbnail and the poster behind the viewer while the GLB loads.
- Pins: a click in pinning mode raycasts the mesh and stores the 3D point. Pins project to screen each frame and fade when the mesh hides them. The same pin shows in Blender's viewport and Unreal's.
- Comments store `{id, author, text, createdAt, partId, versionId, pos?: [x,y,z]}`. A comment without `pos` is a thread reply.
- Keep a `ModelViewer` boundary so the renderer can be swapped later. Reviewers and producers never need Blender or Unreal installed.

## Roles
`can(action)` in one file. Producer: everything. Art director: review, approve, send back, gates. Artist: publish, mark Ready, open editors. Viewer: see everything, orbit, comment, download images; nothing else exists in their DOM. Never render a disabled control for a viewer.

## Rules
- Light mode is primary and the page is white. Dark mode is complete. The full screen reviewer is always dark.
- Serif (Newsreader) only for moments: welcome, screen titles, project and asset names, section titles like Comments and Checks. Sans (Geist) for everything you work with. Mono (Geist Mono) for versions, counts, paths, times.
- One accent, amber, for the primary action, the pin, and the sync pulse. Never a background.
- State colors from the tokens: Draft grey, Ready violet, Approved green, Locked slate, Failed red, Synced green dot, Syncing amber dot. Always with a word or glyph.
- Space: 32 px page margins, 24 px between cards, 16 px inside. Body 14, secondary 13, tile titles 16, titles 28 to 40. Line height 1.5.
- Motion: 150 ms state changes, 300 ms panels, `cubic-bezier(.2,0,0,1)`. Hover lifts a card 2 px. A failed check shakes 2 px once. Nothing decorative. Respect reduced motion.
- Window minimum 1280 by 800.
- Copy: short declarative lines. No exclamation marks. No em dashes. Buttons: Continue, Create studio, Create project, Connect, Add, Open in Blender, Open in Unreal, Publish, Mark Ready, Approve, Send back, Roll back, Export, Invite members. Never: commit, branch, merge, checkout, push, pull, repository, changelist, upgrade, premium.
- Content for mocks: studio Sunburst; projects NkataTest and Rising Sun; assets Market stall, Ojukwu (face, cloth, hair, textures, rig, lookdev), Enugu Market, Compound, Kettle; people Emmanuel, Ada, Chidi, Ngozi, Emeka, Tobe, Ify.

## Order of work
1. Scaffold. Tokens, fonts, theme toggle. Port `nk-viewer.js` and render the Duck sample GLB in a blank window.
2. Sign in, Name, Create studio, Welcome, Sidebar, New project, empty Project, Connections, Members modal.
3. Project with tiles, activity rail, Asset, Part, full screen review, pins and comments.
4. Mentions, Settings (all tabs), Ask, Delete project.
5. Roles and the Viewer path.
6. Walk every screen against the prototype at 1280 and 1440, light and dark.

## Done means
- `pnpm tauri dev` opens on Sign in with no console errors.
- Every screen matches the prototype. Use its Tweaks (startScreen, demoStage, role, theme) to reach each state.
- A GLB loads in the viewer with a poster, progress, and pins that stick to the mesh in both the asset screen and full screen.
- Switching the mock user to Viewer removes every write action. `grep -r disabled src/` shows none on a viewer path.
- `DECISIONS.md` lists every call you made where the prototype was silent.
