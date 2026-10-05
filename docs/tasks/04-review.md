# Step 4: Review

Code complete Oct 5, 2026. The state and gate chain, the Discord message, and the pin round trip through the agent are green in make test. The pin drawn at the same point in both editors needs the editors.

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md (Reviewer, R7, R8), docs/engineering.md (Locks presence gates state, Comment pins, Protocols: Discord), and docs/decisions.md first. Steps 1a, 1b, 2, and 3 are in.

## Gate

Ojukwu goes from the Character template to Approved: every part through Draft, Ready, review in UE5 with at least one pinned comment, Approve or Send back, gates opening in order, one Discord message per decision. Proven by an integration test against the server for the state and gate chain, and by an `@needs_editor` e2e for the pins in UE5 and Blender.

## Build, in this order

1. Ready queue: `GET /parts?state=ready` ordered oldest first, in the app and in the UE5 panel.
2. Pins. UE5 widget: pin tool in the viewport that writes `{point, normal, body}` in part local space; list that frames the camera on click. Blender: `gpu` overlay that draws every pin on the mesh; N-panel list with inline reply. App: pins on the glTF preview.
3. Review in the UE5 panel: Score, Approve, Send back, note. Through the agent to `/reviews`. Approve locks the part read-only and releases the editor lock. Send back sets Draft.
4. Gates open on `review.decided`. The panel and the app show which parts a Locked part waits on. Remove gate from the app, art director or producer only.
5. Discord: one webhook per project, set in project settings by a producer. The server posts one message on `review.decided` and on nothing else. Test with a fake webhook endpoint.
6. Tests without editors: the state and gate chain for every Ojukwu part, the Discord post, pin round trip through the agent. `@needs_editor` e2e for the pin drawn at the same point in both editors.

## Not in this step

No C++ pin module; the widget lists pins and frames the camera. No live pins without reload. No project view or stream mode. Those are step 5 and later.

## Done means

The gate test is green in `make test`. The e2e exists and is marked `@needs_editor`. Open questions that need a real UE5 are in docs/decisions.md with the date.
