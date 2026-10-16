# Nkata App v4 · CHANGES

What the code decided on its own since v3, and what v4 changes. Rebuild the items marked **change**; the rest confirm what is built.

## Sign in and code
- **change** Continue with Google is removed from the Sign in screen. The line reads "We will email you a code."
- **new** Enter the code screen. Six boxes with one real input laid invisibly over them, so typing, paste and autofill (one-time-code) all work and only the boxes show. Accent border on the next empty box. Wrong code: boxes shake 2 px once, red borders, line "That code is not right, or it expired. Ask for a new one." Five wrong tries: boxes are replaced by a card "That code is finished" and one button, Send a new code. Top right: "Not {email}? Use another email".
- **new** The code email. Subject "{code} is your Nkata code". Digits at 40 px mono on a raised block. "It works for 15 minutes and once only." A link as the fallback. "If you did not ask for it, ignore this email." No logo lockup beyond the mark, no footer marketing. Send-ready HTML lives in `emails/otp.html` (update the copy there to match: 15 minutes, link fallback).
- **confirm** Name opens only when the name is empty. Create studio opens only when the account has no studio. Invited people with both skip straight to the project.

## Studios
- **new** Switch studio dialog from the studio menu. Rows: mark, studio name, "{role} · {n} projects", a check on the current one. Picking a row moves the whole app into that studio: its first project, or Welcome when it has none. Divider, then New studio.
- **new** Empty case: one row and the line "This is your only studio. Invites to other studios will show up here."
- **new** New studio inside the app reuses the Create your studio form with the sidebar present. Subline: "A second space, with its own people and projects. You stay in {studio} too." Creating it moves you into the new studio on Welcome. Training toggle here does not toast.

## Members
- **change** Role select is controlled. Options: Artist, Art director, Producer, Viewer, Remove. Remove acts at once, no confirmation; toast "{name} removed from {studio}."
- **change** Role change toasts "{first name} is now a {role}."
- **new** Invited but not signed in: name is the email, second line "Not signed in yet", a chip "Invite sent".
- **new** Refusal: demoting or removing the last producer reverts the select and shows the refused toast "A studio keeps at least one producer." with the subline "Make someone else a producer first, then change your role." Adding the same email twice toasts "already has an invite."
- **change** Artists see roles as text, not selects. Invite members in the sidebar and the Members button are producer only.

## Project
- **new** Rename dialog: one input, "The folder on disk keeps its name.", Cancel, Rename. Enter submits. Toast "Renamed to {name}."
- **change** Delete copy: "The folder on disk stays. The project leaves the sidebar but keeps every version. Restore it from Settings." Toast "{name} deleted. Restore it from Settings."
- **new** Settings, General, Deleted projects (producers only): rows with name, date in mono, Restore. Line: "Delete keeps every version. Restore brings a project back whole." Empty: "Nothing deleted."
- **change** The ··· menu and Assign and Remove gate are producer only. Artists keep Open in Blender, Open in Unreal, Export.

## Asset and Part
- **confirm** The viewer loads the version's GLB with that version's render as the poster.
- **new** No model yet: render only, dimmed, with "No model yet. Save a part in Blender and it appears here." Applies to parts without a GLB (textures, rig, lookdev in the mock).
- **new** Walk, on level areas only. A Walk button beside Pin a comment. Walking: button reads Walking with the accent border, pointer lock, a 18 px ring crosshair with an amber centre, a mono hint at the bottom "W A S D move · Shift run · Mouse look · Click pins at the crosshair · Esc stops". The bar hint reads "Walking. Esc stops." Pass `mode="walk"` to nk-viewer. Same in the full screen reviewer.
- **new** Compare, on the part screen. A toggle above the versions strip. On with nothing picked: the stage dims and says "Pick an older version on the left to set it against v{current}." On with a pick: the two renders under a wipe. Handle is a 32 px disc on a 2 px line; drag anywhere on the stage. Labels in the top corners, "v2" and "v3 · current". Bottom hint "Drag the handle · F to flip". F swaps sides. Pins are off while comparing; the bar says so. Roll back bar is hidden while comparing.
- **new** What changed section above Checks when Compare is on. Header plus mono "v2 to v3". Rows: glyph, name, mono value. Glyphs: plus green added, minus red removed, dot amber changed, check grey unchanged. Rows in order: objects added, removed, changed, unchanged count, triangles before to after with delta, materials added, bones.
- **new** Three empty cases: no pick "Pick an older version to see what changed."; no manifest "v1 was saved before Nkata kept a manifest. The renders tell the story."; same "Nothing changed between v3 and v4. The rollback made them the same."
- **change** Activity rail rows are clickable with a hover background. "Ada published Market stall / model, v3" opens the part with Compare on and v2 picked. Other rows open their part or asset.

## Toast
- **change** Toast grows: wraps at 560 px, optional second line in secondary grey, a red cross glyph for refused writes. Refused toasts stay 5.2 s instead of 3.2 s.

## Roles
- **change** `role` has three values now: producer, artist, viewer. Permission matrix in one place: producer everything; artist no Assign, Remove gate, ··· menu, member management, Deleted projects; viewer reads only, Walk and Compare included.

## Tweaks on the prototype
startScreen adds: code, codeWrong, codeDead, codeEmail, switchStudio, newStudio, rename, walk, compare, compareNoManifest, compareSame, noModel, refused, deleted.

## Files
- `Nkata App v4.dc.html`, `Nkata App v4 Screens.dc.html` (every new screen at 1280 light and 1440 dark)
- `nk-viewer.js` unchanged; the app passes `mode="walk"`.
- `tokens/` is in this handoff.
