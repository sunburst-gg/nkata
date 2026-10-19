# v8 step 15: the pilot

What stands between a green suite and a studio using Nkata for two weeks. The code is done;
this step is the surroundings. Decisions in docs/decisions.md.

Done means each item's gate holds and `make test` is green.

- [ ] 1. The server has a home. server/Dockerfile, fly.toml, scripts/r2-bucket.sh and
      docs/deploy.md; the first deploy answers on https://api.nkata.app/health and a sign in code
      arrives by mail from nkata.app. Gate: the live source's two machine test passes against the
      deployed server with NKATA_TEST_SERVER_URL pointed at it.
- [ ] 2. The desktop build installs. A signed and notarized Mac build and a signed Windows build
      from `pnpm tauri build`, with the add-on and the plugin inside, and an updater so fixes
      reach the studio without a new download. Gate: a fresh Mac opens the app without a warning,
      signs in, connects Blender and sees the wall.
- [ ] 3. Real editors, by us. One day on a Mac and one on Windows with real Blender and UE5:
      open, save, Publish, pin, Done, the environment still, and e2e/quality.py's save overhead on
      the 50k prop and the 2M environment. Gate: the numbers in docs/product.md, Quality bar, hold,
      and every @needs_editor test has run once on real hardware.
- [ ] 4. Logs go somewhere. The server's and the agent's JSON logs reach one place a person can
      search, and the studio has one channel to report in. Gate: a failing Publish on the pilot
      machine is findable by part_id within a minute.
- [ ] 5. The studio. One project, two artists, one lead, one viewer, two weeks, their real props.
      Seeded by us, the first hour with us, the walkthrough as their one page. Training capture
      and what happens to their files at the end are settled in writing before they sign in.

Out: new features. What comes after this step comes from what the studio says.
