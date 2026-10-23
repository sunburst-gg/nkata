# v8 step 16: the artist's loop, end to end

An artist walked the app on live data (2026-10-23): sign in, Arrival, the wall, an asset. The
loop broke where the work should come in. This step fixes every finding of that walk and of the
code trace behind it. Decisions in docs/decisions.md.

Done means each item holds in a browser walk as a new artist against a real server, and
`make test` is green.

- [x] 1. The project has a place on the artist's computer. Arrival and Connections show where it
      will live (~/Nkata/<project> by default, or a place the artist picks) and one button; the
      background process keeps it in step there; the row ticks only then. The app starts the
      background process at launch. A lead gets the same row.
- [x] 2. No prototype fixtures on live data: no lantern for an asset without a model, no "Loading
      model" forever, no courtyard in a save toast.
- [x] 3. The add-on's exports stay out of the sync.
- [x] 4. The artist hears the lead: a toast in the app for an approval, a send back or a new
      comment on their asset, and a line in the Blender panel for the decision.
- [x] 5. The panel says who has the file and whose asset it is, in plain words, before a save.
- [x] 6. Publish only for the owner; an asset with no save reads as such; the wall says what to do
      next when the artist has nothing in the project yet.
- [x] 7. An event reloads only what it touched.
- [ ] 8. Download saves where the person chooses in the desktop app; the seed uses real names.
