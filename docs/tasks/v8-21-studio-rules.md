# v8 step 21: the rules belong to the studio

Decided 2026-10-27 with the producer, thinking as a studio that ships big games: Nkata runs the
studio's rules, it does not impose its own. A technical artist or art director sets how strict
each check is, per kind of asset; work in progress is never blocked; rules bite at one gate,
Publish into the game; an exception is a decision someone makes once, with a reason, and the tool
remembers it. Small teams get sensible defaults and never have to open any of this.
Decisions in docs/decisions.md.

Done means each item holds with a real Blender, and `make test` is green.

- [x] 1. A check in a template has a level: block (holds Publish into the game), warn (shown, never
      holds), or note (shown quietly). A template that lists a check by id alone keeps today's
      level. The template file stays the one place the rules live.
- [x] 2. Pivot follows the kind of asset: base (a prop on the floor), grid (a modular piece snapped
      at a corner), or authored (a door on its hinge: not checked). The Object template ships with
      base, as a note.
- [x] 3. A lead accepts a failing check on one asset with one line of reason: "Hinge pivot, on
      purpose." It stays accepted for that asset until someone takes it back; the panel and the
      app show who accepted it, when, and why, and it no longer holds Publish.
- [x] 4. Publish holds only on a failing check at block level that nobody accepted. A lead can
      publish anyway with one line of reason, which the version keeps for anyone to read.
- [x] 5. Project settings show the rules per kind of asset, in plain words, for a lead to change.

Gate: a door whose pivot is on its hinge, in a project whose props want the pivot at the base at
block level, cannot reach the game until a lead accepts it with a reason; then it can, the reason
shows in the app and the panel, and every other prop is still held when its pivot is off.

Gate passed 2026-10-27 on this Mac: see docs/decisions.md.
