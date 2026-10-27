# v8 step 20: levels made in Unreal are assets in Nkata

Decided 2026-10-27 with the producer: what is made in Unreal reaches Nkata as well, starting with
levels. Level design, lighting and set dressing are half a game's work and none of it showed in
the app. A level, or an area of one, is an asset like a Blender save: a version on every save in
the editor, a still from the viewport, the note, review on the model, pins and approval.
Decisions in docs/decisions.md.

Done means each item holds with an open Unreal editor, and `make test` is green.

- [ ] 1. A level in the project's Unreal project is an asset on the wall, under a Levels group,
      without anyone creating it by hand: the plugin reports the levels the editor has, and the
      agent makes one asset per level on first sight.
- [ ] 2. Saving the level in Unreal makes a version: the .umap and its actor files sync as now,
      and the version gets a still from the editor's viewport and a GLB of the level for the app's
      stage (the area export from step 1b, the whole level when it has no areas).
- [ ] 3. The level's asset page works as any other: Versions, the note on Publish, pins on the
      model, Approve and Send back. Publish is from the app, since Unreal has no Nkata panel yet.
- [ ] 4. Presence: who has the level open in Unreal shows on the wall, as Blender presence does.

Gate: a level saved twice in an open editor shows as one asset with two versions, each with a
still and a model the app turns; a lead pins a comment on it and approves it.
