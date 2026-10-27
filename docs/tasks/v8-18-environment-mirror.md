# v8 step 18: a whole environment, Blender to Unreal, on every save

Step 17 proved one asset at a time. An environment artist works on a scene: many meshes placed
in a layout, instanced copies, lights. The workflow studios use today (a Blender to Unreal video
the team shared on 2026-10-27) exports that scene as USD by hand, opens it in Unreal's USD Stage
to preview, presses Reload after every change, and imports it with actors placed once it is
ready. Its comments name the pain: the stage empties itself after Play until someone reloads,
imports have crashed projects, people keep a separate project to import into. Nkata does the
three steps the artist repeats (export, switch, reload) on every save, and the import on Publish.
Decisions in docs/decisions.md.

Done means each item holds with a real Blender and a real Unreal Engine, and `make test` is green.

## In Blender

- [x] 1. An environment asset writes USD on save, beside its GLB in .nkata-exports/: the
      collection's meshes, lights and materials, UVs and normals, instanced copies kept as
      instances, no animation. The settings are the ones that video uses.
- [x] 2. The export check reads the USD back too: every mesh, light and material of the
      collection is in it, and instanced copies stay instances. A loss holds Publish, as in step 17.

## In Unreal

- [x] 3. Live: the plugin keeps one USD Stage per environment asset, in its own level under
      /Game/Nkata, and reloads it after each save. Nothing is imported yet, as in the video.
- [x] 4. Publish imports: actors placed as in Blender, assets under /Game/Nkata/<asset>, and a
      Nanite triangle threshold from the project's settings (500,000 by default). Reimport on the
      next Publish keeps collisions and material edits made in Unreal.
- [x] 5. The import is checked like step 17's: the actors, the distinct meshes (fewer than the
      actors when there are instances), the lights, the material slots.

## In the app

- [ ] 6. A lead sets the Nanite threshold for the project, next to the budgets.

Gate: an environment of at least ten placed meshes, three of them instances of one mesh, and two
lights, saved in Blender, reaches Unreal as a stage within ten seconds of the save, and on Publish
as placed actors with one mesh asset for the three instances; a light removed in Blender is gone
from the stage after the next save.
