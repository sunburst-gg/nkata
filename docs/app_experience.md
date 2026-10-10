# Nkata app experience (PRD v1)

Oct 10, 2026 · @Emmanuel Njoku

## Summary

This doc defines the Nkata desktop app from first open to daily use, screen by screen. It replaces the earlier interface notes in the product doc. The model is simple: you, then your studio, then your projects, then the assets inside a project. Light mode is the primary design. The empty state is the onboarding. Blender and Unreal connect by themselves when Nkata finds them on the machine.

Reference for structure and feel: Quality (usequality.app). Same three levels, same quiet chrome, same serif for moments and sans for work, same cards that teach by picture.

## Principles

1. One decision per screen. A name and a button. Then the next screen.
2. The empty state is the onboarding. No wizard after setup. An empty project shows the three things to do next, as pictures.
3. Light first. Warm white surfaces, one accent, soft shadows, color only where it carries meaning: state badges, presence dots, the plan badge.
4. Two typefaces with jobs. Serif for moments: welcome, project name, section titles. Sans for everything you work with.
5. Faces and names everywhere. Avatars on parts, on comments, on presence. Real names.
6. Quiet chrome. The sidebar is a list. The plan badge sits next to the studio name. Upgrade is a link at the bottom, not a banner.
7. Every action answers. A toast on delete, a check on save, a pulse on sync. Under 300 ms. Nothing decorative.
8. Tools connect themselves. Nkata detects Blender and Unreal. The person confirms, not configures.

## Hierarchy

| Level | What it is | Example |
| --- | --- | --- |
| Account | You. Email, name, avatar. One account, many studios | Emmanuel Njoku |
| Studio | The team. Members, roles, plan, training state, connections | Sunburst · Free · Training on |
| Project | One game. Folder, tool versions, templates, assets | NkataTest, Rising Sun |
| Asset | One thing in the game, made of parts | Ojukwu, Market stall, Enugu Market |

The studio switcher menu has four items: Settings, Invite and manage members, Switch studio, Log out.

## First run, screen by screen

**1. Sign in.** Logo top left. Centered: email field, one button "Continue". Magic link. One line under: "We will email you a link." After the link: name and avatar, one screen.

**2. Create studio.** Serif title "Create your studio". One line: "A shared space for your team's games." Fields: Studio name. Plan: two cards side by side, Free ("Training on. Your team's process helps train Nok.") and Premium ("Training off. Your data is never used for training."). Free is selected by default. One button: "Create studio". Top right: "Not nj@njokuscript.com? Log out".

**3. Welcome.** Avatar, then serif "Welcome, Emmanuel". Three cards with illustrated pictures of each step and two lines under each:

- Create a project. "Name it, pick a folder. Nkata sets up the rest."
- Connect your editors. "Nkata found Blender 5.1 and Unreal 5.8. Confirm and the panels appear in both."
- Invite your team. "Only people you invite can open your projects." The sidebar shows: Get started, New project, Mentions, then Projects: "No projects yet." Bottom: Invite members, Connections, Upgrade plan.

**4. New project.** Serif title "New project". Fields: Project name. Folder (a picker with the default path shown). Blender and Unreal versions, pre-filled from what Nkata detected, editable. One button "Create project". No template choice here; templates come with the project.

**5. Project, empty.** Breadcrumb: Projects / NkataTest. Project header: icon, serif name, folder path, created date, owner avatar and name. Buttons: "Open folder", "Members", "..." (Rename, Export, Delete project). Below: tabs All, Characters, Props, Levels, each with a count of 0. Empty state in the center: a small illustration, "No assets yet", one line "Save a part in Blender and it appears here", and a button "Create asset". When the editors are not connected yet, the empty state says "Connect Blender and Unreal to start" with a button to Connections.

**6. Connections.** Reached from the sidebar or the Welcome card. Serif title "Connections". One line: "Nkata connects to the tools on this computer. More tools arrive over time." Cards in a two-column grid:

- Blender. Detected: "Blender 5.1.2 found at /Applications/Blender.app". Button "Connect" installs the add-on and shows "Connected" with a green dot. Not found: "Not found. Install Blender 5.1 or choose the app."
- Unreal Engine. Same. "Unreal 5.8.1 found". Connect installs the plugin into the project.
- Discord. "Get a message when a part is sent back or approved." Connect.
- Linear. Soon.
- Substance, Maya, Houdini, Unity, Godot. Soon, grey. Auto-detect runs on every app start. A connected editor that goes missing shows an amber dot and one line.

**7. Members.** A modal from the Members button or the sidebar. Title "Members". Field "Search by name or enter an email" with Add. Role picker on add: Artist, Art director, Producer, Viewer. Section "People with access": avatar, name, (You), email, role on the right. Owner is the first producer. Remove from the role menu.

**8. First mirror.** The person saves a part in Blender. The project page gains its first asset tile with a live render. A toast: "Market stall / model synced to Unreal". This is the moment the product is real. Nothing on this screen should distract from it.

## After first run

**Project with assets.** Tiles, minimum 280 px, with the latest render, one state badge, the faces of who is in it now. Tabs by kind. Sort by last changed. One line at the top: "3 online · 12 changed today · 2 ready for review". Clicking it opens an activity rail on the right.

**Asset.** Breadcrumb: Projects / NkataTest / Market stall. Parts as a strip across the top with owner avatar and state badge. Large 3D preview below. Comments on the right. Buttons: Open in Blender, Open in Unreal, Export, Assign, Remove gate.

**Part.** Versions as a vertical thumbnail strip on the left. Preview center. Checks and comments right. Click a version to roll back; one confirmation.

**Review.** The Project screen filtered to Ready, plus a Review button in the rail with a count. The art director opens a part in Unreal from here.

**Mentions.** Every comment that names you, newest first. Click to open the part.

**Viewer.** Same screens, with no write action present. A small "Viewer" label by the avatar. The default top line reads "12 changed this week".

**Settings.** Left nav in three groups, like Quality: Personal (Account), Studio (General, Members, Billing, Training), Tools (Connections, MCP soon, Agents soon). Training shows the current state, who changed it last, and the history. Only producers can change it.

## The Blender panel, designed first

Artists live in Blender and Unreal, not in the app. The N-panel is the most used surface in the product. It is designed before the app screens, with the same tokens, in dark mode because the editor is dark.

Order in the panel, top to bottom. Nothing else.

1. **Part header.** Asset / part, owner avatar, state badge, lock. One line.
2. **Mirror.** "Synced 4s ago" with a green dot. "Syncing" amber. "Failed: \<one line>" red with Retry. A toggle: Mirror on save, default on. A Pause button for the part. Readable from across the room.
3. **Reference strip.** Thumbnails of the pinned reference. Click opens full size in a floating window.
4. **Checks.** Live list. Pass or fail per rule. Fix buttons where auto-fix exists. Blocking fails are red, warnings amber.
5. **Comments.** Pins drawn in the viewport at the exact point. The list in the panel, newest first. Reply inline. Resolve with one click.
6. **Actions.** Publish, large. Mark Ready, smaller. Take a look, text link.
7. **Presence.** Who else is in this asset, as faces.

The Unreal panel is the same seven, in the same order, in the same words, plus Review for art directors and Level parts for level assets.

## Artist rules, from the artist's chair

These override anything above that conflicts.

1. **Take a look.** A comment that pings the art director without changing state. For a rough block that needs eyes before more work. Lives next to Mark Ready in the panel. The art director sees it in the review queue under a "Take a look" section.
2. **Mirror can pause.** A big scene saved every two minutes must not stutter Unreal. Mirror on save is a per-part toggle, default on. Pause is one click. A paused part still versions every save.
3. **Props have no gates by default.** The Environment template ships gate-free. The art director adds gates if the studio wants them. Characters keep gates, and the art director can remove any.
4. **One-part assets are normal.** A kettle is one part called "kettle". Creating an asset from a template asks "All parts, or one?" with one as the default for props.
5. **The review thumbnail is the Unreal capture.** On Mark Ready, the Unreal plugin captures the viewport under real lighting. That image is the tile and the review thumbnail. The Blender render is the fallback only.
6. **Review round trip under one minute.** Open the Ready part in Unreal, look, pin, send back. If this takes more clicks than a Discord message, artists go back to Discord. Measured in the quality bar.
7. **Ready is the artist's call.** Nobody else marks a part Ready on an artist's behalf except a producer, and that is logged.

## Micro interactions

| Moment | Response |
| --- | --- |
| Blender save mirrors | The asset tile's border pulses once in the accent. Toast: "synced to Unreal" |
| Someone opens a part | Their avatar slides onto the tile, 150 ms |
| Part approved | Badge changes color with a 200 ms crossfade. Confetti is not used |
| Delete project | Confirmation with the project name typed. Then a dark toast bottom center: "Project deleted" with a check |
| Check fails | The row shakes once, 2 px, and the Fix button appears |
| Hover a tile | Lifts 2 px with a soft shadow. Shows the "Open in" buttons |
| Sync failed | Amber dot on the tile and in the header. One line on hover |
| Keyboard | Cmd K opens Ask. Esc closes anything |

## Light mode spec

- Surfaces: warm off-white page, white cards, 1 px hairline borders at 8% black, radius 12 px.
- Shadows: one soft shadow for lifted cards and modals, none at rest.
- Accent: one, from the brand guideline, used for primary buttons and the sync pulse only.
- State colors: Draft grey, Ready violet, Approved green, Locked slate, Failed red, Synced green dot, Syncing amber dot. Distinct for colorblind users.
- Type: serif at 28 to 32 px for titles, sans 14 px body, 13 px secondary, 16 px tile titles. Line height 1.5.
- Space: 32 px page margins, 24 px between cards, 16 px inside cards.
- Dark mode is complete and secondary. The editor panels use dark by default because the editors are dark.

## Copy

- Buttons: Continue, Create studio, Create project, Connect, Add, Open in Blender, Open in Unreal, Publish, Mark Ready, Approve, Send back, Roll back, Export, Invite members.
- Empty states: "No projects yet." "No assets yet. Save a part in Blender and it appears here." "No comments yet." "Nothing to review."
- Never: commit, branch, merge, checkout, push, pull, repository, changelist.
- No exclamation marks. No em dashes.

## Out of scope for v1

Billing payments, web app, agents page, MCP page beyond a Soon label, dependency map beyond "placed in", any tool beyond Blender, Unreal, and Discord.

## Open questions

- [ ] Does "Create asset" exist in the app, or do assets only appear from the editors? Proposal: both; the app creates the asset from a template, the editor fills it.
- [ ] Where does the training state show inside the project: header badge only, or also on every tile? Proposal: header only.
- [ ] Folder picker on Windows and macOS: native dialog or in-app browser? Proposal: native.
