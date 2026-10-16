# For Claude: write the Claude Code prompts to build Nkata v8

You are a senior engineering lead. Attached is the handoff for Nkata, a desktop app for game studios: `Nkata App v8.dc.html` (an interactive HTML prototype that is the spec), `nk-viewer.js` (a working three.js web component), `tokens/`, `styles.css`, `readme.md` (brand and voice), and `assets/renders/`. Also attached is `CLAUDE_CODE_PROMPT_v8.md`, a full description of the product, visual system, screens, roles, motion and copy rules. Read all of it before you write anything.

Your job is not to build the app. Your job is to turn this into a sequence of Claude Code prompts that a developer can paste one at a time, each producing a working, testable increment.

## What Nkata is
Save in Blender, and your team sees it in 3D, comments on it, and uses it. Five nouns: Project, Asset, Version, Comment, Approved. One verb: Publish. Three roles: Lead, Artist, Viewer. The product details, screens, and rules are in `CLAUDE_CODE_PROMPT_v8.md`; do not restate them, reference them.

## Stack (fixed)
Tauri 2, React 18, TypeScript, Vite, Zustand, Radix primitives, CSS modules with the token variables from the prototype, three.js via the ported `nk-viewer.js`, fonts bundled locally. Mock `DataSource` first, real backend later.

## How to write the prompts
- 8 to 12 prompts, in build order. Each one is self-contained: what to build, which files in the handoff to read first, the exact prototype Tweaks (role, stage, startScreen) that show the target state, and a done check the developer can run.
- Prompt 1 is scaffold plus tokens plus one GLB rendering in the ported viewer. Nothing visual beyond that.
- Every prompt names the components it creates or touches, with file paths, so later prompts can refer to them.
- Every prompt ends with "Done means" as a short list, including the console being clean and the screen matching the prototype at 1280 and 1440 in light and dark.
- Call out the hard parts explicitly where they land: the WebGL context pool on the wall (cap at 8, cached stills for the rest), pins that project to screen each frame with occlusion, the first-save fill animation, the Team strip state machine, `can(action)` as the single permission gate with no disabled controls for viewers.
- Scope the Blender add-on as its own final prompt or two, separate from the app: the N-panel, "Add to {project}", GLB export on save, pins into the viewport.
- Include a short prompt zero the developer runs once: repository layout, `DECISIONS.md` convention, how to open the prototype and read its Tweaks.

## Rules Claude Code must follow, repeat them in every prompt header
- The prototype wins over any written description.
- No hardcoded colors; tokens only. Amber is #E9A23B, ink on it, used only for the primary action, the Approved seal and the ghost wireframe.
- Never mask or vignette an image. No gray skeletons. Empty states show the ghost model on the lit stage.
- Never render a disabled control for a viewer.
- Banned words in the UI: part, template, gate, state, lock, check run, mark ready, board, mirror, commit, branch, merge, push, pull, repository, changelist, folder (as an app object), upgrade, premium.
- Short copy. No exclamation marks, no em dashes, no paths in headlines.

## Output
A single markdown document. A one-paragraph overview, then the prompts numbered 0 to N, each inside its own fenced code block so it can be copied whole. After the prompts, a short list of open questions the prototype does not answer, so the developer can decide them before starting and log them in `DECISIONS.md`.
