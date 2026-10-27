# v8 step 17: every export arrives intact

The team saw the app on 2026-10-27. The product as it is was called useful. The one thing artists
struggle with most is keeping exports intact: textures, animations, the rig. This step makes
Nkata the place that proves an export lost nothing, first in Blender, then in Unreal.
Decisions in docs/decisions.md.

Done means each item holds with a real Blender, the Unreal items hold with a real Unreal Engine,
and `make test` is green.

## In Blender

- [x] 1. Export what the scene has. The GLB carries the animations when the file has any, and the
      rig whenever an armature is there. The FBX carries the armature whenever there is one, not
      only for the Character template, and bakes the animations when there are any.
- [x] 2. Read the export back. A plain reader of the GLB the save wrote: meshes, materials,
      images, the rig's bones, the animations and their length. No Blender needed to read it.
- [x] 3. Say what was lost. The scene and the export side by side: a texture a material uses
      that is not in the export, a material, a bone, an animation. A texture whose file is not
      on disk and not packed is lost before the export even runs: say that too, with its path.
- [x] 4. Export is a fifth line in the panel, under the four checks: "Export intact" or what was
      lost, one line each. A loss blocks Publish, like a red check.
- [x] 5. The rig keeps its shape. Bones removed or renamed since the last save say so, by name,
      because the skeleton in the engine is built from them.

## In the app

- [x] 6. The manifest carries the export's facts and losses (shared schema). The asset page shows
      an Export row with the Facts: intact, or what was lost; and the rig and the animations when
      the asset has them.

## In Unreal

- [ ] 7. The mirror proves the import. After each import the plugin reads the asset back in the
      engine: material slots, the skeleton's bones, the animation sequences, and compares them
      with the manifest. A difference is a mirror result with the same plain words.
- [ ] 8. The open questions from step 1 and step 3 (docs/decisions.md, 2026-10-01 and
      2026-10-03) answered on UE 5.8 on this Mac: reimport keeps material slots, the skeleton and
      the physics asset; the mirror p95 time.

Gate: a rigged, animated, textured character saved in Blender reaches Unreal with every texture,
material slot, bone and animation, measured by items 3 and 7; a broken texture path and a deleted
bone each show by name in the panel before Publish.
