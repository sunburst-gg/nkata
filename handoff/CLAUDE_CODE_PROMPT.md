# Build the Nkata desktop app

You are building the frontend of Nkata, a desktop app for game studios. Artists, engineers, writers, and producers work on one game from inside Blender and Unreal Engine 5. Every Blender save mirrors into Unreal in seconds. Nkata adds presence, locks, checks, review on the model, and a project view of the whole game. Work is organised as assets made of parts. Each part has one owner, a state (Draft, Ready, Approved), an optional lock, a gate, a version timeline, checks, and comments pinned on the mesh.

This prompt covers the desktop app only. The Blender and Unreal panels are a later task, but share the tokens and copy defined here.

## Stack
- Tauri 2, TypeScript, React 18, Vite.
- Styling: CSS variables from `tokens/` plus CSS modules, or Tailwind mapped to those variables. Do not hardcode hex values in components.
- shadcn/ui (Radix) for Dialog, DropdownMenu, Tooltip, Toast, Tabs, Avatar, Input. Restyle them to the tokens. Everything else is custom.
- Icons: `lucide-react`, 16 px, stroke 1.75.
- Fonts: Geist and Geist Mono from the `geist` npm package. Do not load Google Fonts at runtime. It is a desktop app and must work offline.
- State: Zustand. Data: one typed mock module (`src/data/mock.ts`) behind a `DataSource` interface, so the real backend can replace it later.

## Inputs in this folder
- `styles.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`: source of truth for color, type, spacing, radius, shadow, motion. Dark is the default. `[data-theme="light"]` switches. Aliases are declared on `:root,[data-theme]` so a nested theme resolves correctly. Keep that.
- `tokens/tokens.json`: the same values, machine-readable. Generate a typed `tokens.ts` from it.
- `brand/`: mark SVGs (dark, light, mono, currentColor), PNGs 16 to 1024, `app-icon-1024.png`.
- `renders/`: the five compound renders used as asset thumbnails and previews.
- `reference/`: the HTML prototypes. Open them in a browser. They show the target, not code to copy. Read the inline styles for exact values.
  - `Nkata App v2.dc.html`: the full app prototype. Every screen and interaction. Its props (`startScreen`, `role`, `theme`, `frameWidth`, `emptyPreview`) jump to any state.
  - `Nkata Components.dc.html`: every component with every state, and the shadcn mapping.
  - `Nkata Flows and Handoff.dc.html`: seven flows frame by frame, spacing and type scale, state color map, about 40 copy strings with keys, and the product decisions.
  - `Nkata Viewer Role.dc.html`: the Viewer role, artist and viewer side by side.
  - `Nkata Panels.dc.html`: editor panels, for reference only.
- `readme.md`: brand and voice rules. Read it first.

## Asset export, do this first
1. Run `pnpm tauri icon handoff/brand/app-icon-1024.png` to generate all platform icons (icns, ico, PNG sizes).
2. Copy `brand/*.svg` to `src/assets/brand/`. Build a `<Mark size tone />` component that inlines the `currentColor` SVG, with the dot colored separately (`--accent` or `currentColor`).
3. Copy `renders/*.png` to `src/assets/renders/`, then convert each to WebP at 1600 px wide and at 480 px wide for tiles. Import them through Vite so they are hashed and bundled.
4. Copy the token CSS into `src/styles/tokens/`, import `styles.css` once in `main.tsx`, and generate `src/styles/tokens.ts` from `tokens.json`.
5. Extract the copy strings from the Handoff page into `src/copy/en.ts`, keyed exactly as listed (`mirror.synced`, `lock.other`, and so on), with `{placeholders}` as typed parameters.

## Screens
No left sidebar. The navigation is a breadcrumb: `Sunburst / Rising Sun / Ojukwu / face`. The studio name opens the org menu, the project name opens People, Templates, Settings, and What changed. The avatar opens Profile and Sign out.

1. **Auth.** Sign in and sign up. Discord, email link, password. Create a studio (org) after the first sign-up.
2. **Home.** The studio's projects as large thumbnails with faces of the people in them. New project.
3. **Create project.** Three screens, one action each: name, folder, Blender and Unreal versions. Then the setup progress screen (indexing, Blender found, Unreal found, first mirror) and Invite your team with a copy link.
4. **Project.** The whole game as asset tiles, at least 280 px wide: last render, one small state badge, faces of who is in it now. Tabs: All, Characters, Levels, Props, Scripts, Sound. Sort by last changed. One status line at the top ("6 online · 14 changed today · 4 ready for review") opens a collapsible activity rail on the right. The Review button in the rail filters the grid to Ready, oldest first. No stat cards. No lists on the main surface.
5. **Asset.** Parts as a strip of thumbnails across the top, each with an owner face and a state badge. A large preview below. Comments on the right. Export, Remove gate, and Assign at the top right.
6. **Part.** A vertical strip of version thumbnails on the left, the preview in the center, checks and comments on the right. Clicking a version previews it and shows a Roll back bar. Roll back creates a new version. History is never rewritten.
7. **People, Templates, Settings.** As in the prototype. The template editor has parts in order (drag to reorder), a gate per part, checks per part, and reference slots.
8. **Profile.** Name, email, avatar, connected tools, sign out.

## Viewer role
Viewers have `role: 'viewer'`. Gate this in one place, `can(action)` in `src/auth/permissions.ts`. Do not scatter role checks across components.
- A viewer can see every asset, rotate models, read scripts, read and add comments, follow changes, and download images of an asset.
- A viewer cannot Publish, Mark Ready, Approve, Send back, Roll back, Remove gate, Assign, Export the project, Fix checks, lock anything, open the editors, create projects, or see Templates and Settings.
- **Never render a disabled control for a viewer. If they cannot do it, it is not in the DOM.**
- The status line reads "{n} changed this week". A "Viewer" label sits beside the avatar.
- The invite sheet has six roles: Artist, Art director, Engineer, Writer, Producer, Viewer. Viewer's line reads "Sees everything, comments, changes nothing."
- Viewer setup is two screens: sign in from the invite link, then pick What changed or The whole project. No folder step.
- **What changed** is a weekly digest: renders side by side with the week before, assets that moved state, and comments added. Previous week and Next week links. A switch labelled "Open Nkata on this page" sets it as the viewer's home.
- **No preview yet:** show the owner's face and name, and say when the render will appear.

## Components
Build these as named components in `src/components/`, each with a Storybook-style `*.states.tsx` file that renders every state: default, hover, active, focus, disabled (non-viewers only), locked, approved, failed.

Button (primary, secondary, ghost, danger; md 36 and sm 28), Input, AskField (slot only, no AI in v1), FilterChip, Tabs, Dialog, Toast, Tooltip, StateBadge, MirrorStatus (compact 24, large 44), PresenceAvatar and AvatarStack, LockBadge, AssetTile, PartThumb, VersionThumb, CheckRow, CommentPin, CommentThread, ActivityRail, Breadcrumb, ProjectMenu, AccountMenu, InviteSheet, RolePicker, RotatablePreview, EmptyPreview, DigestRenderPair, TemplatePartRow.

`RotatablePreview`: v1 takes a turntable image sequence (N frames) and scrubs on drag. Fall back to the single render. Leave a `ModelViewer` slot for three.js and glTF later.

## Rules that are not negotiable
- Colors only from tokens. One accent (`--accent`, amber), used for one thing per screen: the primary action, the active item, or the presence dot. It never fills a background.
- State colors: Draft `--state-draft`, Locked `--state-locked`, Ready `--state-ready`, Approved `--state-approved`, Failed check `--state-failed`, Synced `--state-synced`, Syncing `--state-syncing`, Sync failed `--state-sync-failed`. Always pair the color with a word or glyph.
- Spacing: at least 24 px between elements, page margins of 32 px or more. Body 14 px, tile titles 16 px, headers 24 to 32 px. Mono (Geist Mono 12 px) for versions, counts, IDs, times, and file names.
- Hierarchy comes from type and spacing, not boxes. Use hairlines (`--line-hairline`) before cards.
- Motion: state changes 150 ms, panels and dialogs 300 ms, `cubic-bezier(.2,0,0,1)` in and `cubic-bezier(.4,0,1,1)` out. Animate color and badge only. Nothing decorative. Respect `prefers-reduced-motion`.
- Minimum window 1280 by 800. Verify at 1280 and 1440. Dark is primary. Light must be complete on every screen.
- Copy: short declarative lines. No exclamation marks, no em dashes. Never use: commit, branch, merge, checkout, changelist, push, pull, seamless, powerful, supercharge. Use: Publish, Mark Ready, Approve, Send back, Roll back, Remove gate, Export.
- Content: Rising Sun by Sunburst. Assets: Ojukwu (face, cloth, hair, textures, rig, lookdev), Enugu Market, Compound, Act1_Scene3. People: Ada, Chidi, Ngozi, Emeka, Tobe, Ify. Viewer: Funmi Adebayo.
- Accessibility: every control is reachable by keyboard, the focus ring is `--shadow-focus`, text contrast is at least 4.5:1, and hit targets are at least 28 px in the app.

## Order of work
1. Scaffold Tauri, React, and Vite. Export the assets (above). Wire in the tokens and fonts, with a theme toggle stored in localStorage.
2. Primitives and their state files. Check them against `reference/Nkata Components.dc.html`.
3. App shell: breadcrumb, menus, routing (`/signin`, `/home`, `/new/:step`, `/p/:project`, `/p/:project/a/:asset`, `/p/:project/a/:asset/:part`, `/p/:project/changes`, `/p/:project/people`, and so on).
4. Project, Asset, and Part screens with mock data. Then auth, create, and setup. Then People, Templates, Settings, and Profile.
5. Viewer role, invite sheet, viewer setup, What changed, and the empty preview.
6. Walk every flow in `Nkata Flows and Handoff.dc.html` and match it frame by frame.

## Done means
- `pnpm tauri dev` opens at 1280 by 800 on Home with no console errors.
- Every screen matches the prototype at 1280 and 1440, in dark and light.
- Switching the mock user to viewer removes every action listed above. Run `grep -r "disabled" src/` and confirm no viewer path renders one.
- A `DECISIONS.md` lists any call you made where these documents were silent. Make one decision, note it, and move on.
