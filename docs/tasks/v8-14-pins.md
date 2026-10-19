# v8 step 14: pins that close

Request changes on GitHub works because each comment is a small contract the author closes and
the reviewer can see what is still open. Art has the pin instead of the line. This step gives a
pin a done state on both sides, counts what is open where people look, carries open pins onto
the next Version, and makes the lead's second look explicit. Decisions in docs/decisions.md.

Done means each sub-step's gate holds and `make test` is green.

- [x] 1. Done on a pin, end to end. Shared: a comment.resolved event. Server: resolve emits it,
      reopen is its reverse; the author, the asset's owner or a lead may do either. Agent: the two
      routes for the panel. App: Comment.done, a Done action on a pin for those people, done pins
      hollow on the model and under an Addressed fold. Panel: Done beside Jump to pin, done pins
      faint in the viewport. Gate: a pin marked done in Blender turns hollow in the app within one
      poll, and the other way round, in the fake-agent and fake-server tests.
- [x] 2. The count where people look. openPins(asset) counts pins on the current Version that are
      not done. The wall card and the asset header read "2 of 3 pins" once a Version was sent
      back and pins remain. An asset sent back with open pins is in the artist's Needs my eyes.
- [x] 3. Pins carry forward on Publish. The new Version shows the pins still open on the one
      before as ghosts: same spot, dotted ring, "from v1" in the list, until someone marks them
      done. Publish is never blocked by an open pin.
- [x] 4. The lead's second look. Approve with open pins asks once, "2 pins still open. Approve
      anyway?", and yes marks them waived. A new Version after a send back returns to the lead's
      Needs my eyes.

Out: threads under a pin, required reviewers, suggested edits.
