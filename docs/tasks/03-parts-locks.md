# Step 3: Parts and locks

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md (Roles and permissions, R3 to R6), docs/engineering.md (Locks presence gates state, Checks pins templates, Fixture corpus), and docs/decisions.md first. Steps 1a, 1b, and 2 are in.

## Gate

A second artist installs, signs in, and opens the project in under 5 minutes. Two artists work on two parts of one asset with no overwrite: the second to open a held part sees the holder and cannot write. Proven by an integration test with two agent instances against the server; the install time is measured by hand once and written to docs/decisions.md.

## Build, in this order

1. Templates with kinds. `kind` on the template schema: `character`, `prop`, `level_area`. Character template without animation and sound. Environment prop and Level area templates. Seed: Ojukwu, Kettle, Wooden stool, Market stall, Enugu Market / square.
2. Roles. Enum artist, art_director, producer, viewer. The server refuses a viewer on lock, publish, mark ready, review, rollback, gate removal, template edit, asset creation, and project export. One test per refused route. Comments 201. Single asset export 200.
3. Checks in both editors. `blender-addon/nkata/checks/` and `ue5-plugin/scripts/checks/`, one module per shipped check, `pivot_at_base` added. Publish runs them, applies `unit_scale` and `name_pattern` fixes, posts results. Blocked Publish lists the failures.
4. Blender N-panel elements 3 to 7: reference strip, checks with Fix, comments list, Publish and Mark Ready, presence. UE5 panel (Editor Utility Widget) with the same seven elements and the level areas list. Both open in under 1 s.
5. Presence heartbeat from both editors. Request unlock from the second opener; one-click release on the holder's panel.
6. Tests without editors: role refusals, check logic against `fixtures/`, panel state with `bpy` stubbed, the two-agent lock test.

## Not in this step

No pins, no review, no Discord. Those are step 4. No stream mode or app screens beyond what exists. Those are step 5.

## Done means

The gate test is green in `make test`. The install time is in docs/decisions.md with the date. Every check has a contract, an implementation, and a test.
