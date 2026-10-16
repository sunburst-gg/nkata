# How to read the v8 handoff

The prototype is the spec. `Nkata App v8.dc.html` wins over any written description, `PROMPTS.md` included. Where it is silent, the Decisions section of `PROMPTS.md` answers.

## Open it

```
make proto
```

Then open http://localhost:4600/Nkata%20App%20v8.dc.html. The prototype needs http, not `file://`: `nk-viewer.js` is an ES module loaded through an import map.

## Tweaks

The Tweaks panel drives every screen. Each value is a state the app has to reach.

| Tweak | Values |
| --- | --- |
| role | lead, artist, viewer |
| stage | nostudio, noproject, arrival, empty, joining, firstsave, firstcomment, studio |
| startScreen | project, asset, mentions, connections, sample |
| simulateSave | on, off |
| simulateJoin | on, off |
| theme | light, dark |

If the Tweaks panel does not show, the props live in the `data-props` attribute of the `<script type="text/x-dc">` tag near the end of the file. Change a `default` there and reload.

## Read the behavior

The behavior spec is the `Component` class at the end of the file. Read `sync()` and `renderVals()` before you build a screen: `sync()` seeds the data for a stage, `renderVals()` computes everything a screen shows.

The markup blocks are labeled with HTML comments: ARRIVAL, ZERO STATE, SHELL, WALL, TEAM STRIP, Cards, ASSET, MENTIONS, CONNECTIONS, NEW PROJECT, INVITE, PUBLISH, TOAST. Search for the comment to find a block.

## Three 404s you can ignore

`styles.css` is three `@import` lines for the v3 tokens, which sit in `_stale/tokens/`. The prototype does not use them: its tokens are the two `[data-theme]` blocks in its own `<style>`. The console shows three 404s for `tokens/*.css` on every load. Nothing is missing on the screen.

## What the prototype loads from the network

The prototype loads three.js, the fonts (Geist, Geist Mono, Newsreader) and the sample GLBs from CDNs. The app bundles all of them and works offline (step 1 of `PROMPTS.md`).

## What else is here

- `support.js`, `styles.css`, `nk-viewer.js`: the prototype's runtime. `nk-viewer.js` is ported into the app in step 1.
- `assets/renders/`: the environment renders the prototype shows.
- `brand/`: the Nkata mark and the app icon.
- `CLAUDE_CODE_PROMPT_v8.md`: the written description. The prototype wins where they differ.
- `PROMPTS.md`: the build plan, one step per message. Its Decisions section is binding.
- `_stale/`: earlier versions, kept for reference. See `_stale/README.md`.
