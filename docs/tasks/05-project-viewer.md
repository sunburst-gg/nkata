# Step 5: Project view and viewer mode

Work on main. Push after every green `make test`. Open a PR only if you are blocked or the gate fails.

Read CLAUDE.md, docs/product.md (Viewer, R9 to R11, Surfaces), docs/engineering.md (Storage and sync: Stream mode, Export), desktop/README.md, and docs/decisions.md first. Steps 1a to 4 are in. The desktop screens exist against an in-memory mock behind `DataSource`; this step wires them to the server and the agent.

## Gate

A viewer signs in on a machine with no project folder, opens the project, answers who is online, what changed this week, and what is stuck from one screen, rotates Ojukwu, and leaves a comment that shows in Blender. The cache never passes 5 GB. Proven by an integration test of the stream mode agent against the server and store, and by the viewer DOM test in `desktop/`.

## Build, in this order

1. Stream mode in the agent: `nkata-agent serve --stream`. No index, no watcher, no upload. `/files/download-urls` on demand into `~/.nkata/<project>/cache/` with a SQLite table of (file_version_id, path, size, last_used). 5 GB cap, least recently used evicted after every download. Tests: eviction order, cap held, re-download after eviction.
2. Server `DataSource` in the app: snapshot from REST, live updates from the WebSocket, every mutation through the routes. The mock stays for screenshots and tests.
3. Project view: tabs All, Characters, Props, Levels; online now, changed today, locked, Ready, failed checks, idle 14 days. Asset: parts, timeline, comments, preview, placement for a prop. Part: timeline, checks, pins. Review queue. Person. Settings with the Discord webhook. Setup with the folder step skipped for a viewer.
4. Export: one asset as images and glTF for everyone; whole project as plain folders for everyone but a viewer. Built locally from the index, with the server manifest when reachable.
5. Tests: stream mode integration, viewer DOM test extended to the server `DataSource`, export manifest round trip.

## Not in this step

No web viewer. No template editor in the app. No live cursors.

## Done means

The gate test is green in `make test`. The cache numbers (fill time, eviction) are in docs/decisions.md with the date.
