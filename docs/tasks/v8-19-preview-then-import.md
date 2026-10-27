# v8 step 19: a preview on every save, the real import on Publish

Decided 2026-10-27 with the producer, after the team meeting: every Blender save updates a live
preview in Unreal by itself; Publish imports into the game's assets; an artist can pause the
preview per asset. The workflow the team uses by hand (USD preview, import when it is done) and
the product's promise (every save reaches Unreal in seconds, no button) agree on this. Step 18
already works this way for environments; objects still reimport into the game's assets on every
save, so a half finished save can break a level that places them.
Decisions in docs/decisions.md.

Done means each item holds with a real Blender and an open Unreal editor, and `make test` is green.

- [x] 1. A save of an object or a character imports into a preview folder,
      /Game/Nkata/_Preview/<asset>/<part>, never into the game's assets. The step 17 check runs
      on the preview as it does now.
- [x] 2. Publish imports the published save into the game's assets, /Game/Nkata/<asset>/<part>,
      with the same check; a reimport keeps the skeleton, the physics asset, the material slots
      and the collision, as step 17 measured.
- [x] 3. The Blender panel has one switch, "Live in Unreal", on by default, per asset. Off: saves
      still version and still reach the team; Unreal waits for the next Publish or the switch.
- [x] 4. The app says where a save is: "Preview in Unreal" after a save, "In the game" after a
      Publish, "Did not arrive" with what to do, and nothing when Unreal is off.

Gate: with an open editor, three saves of a prop reach the preview folder and change nothing in
/Game/Nkata/<asset>; Publish puts the third into /Game/Nkata/<asset>; with the switch off, a save
reaches the team and not Unreal.

Gate passed 2026-10-27 on this Mac: see docs/decisions.md.
