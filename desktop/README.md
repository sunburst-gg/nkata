# Nkata desktop

Tauri 2, React 19, Vite. The screens are the v8 design: the wall of models on a lit stage, the asset page with pins and Versions, the Team strip, Mentions, Connections, Settings. The agent core is the Rust crate in `src-tauri/`.

```
pnpm install
pnpm dev            # the web view at http://localhost:1420 (make dev fetches the fixture models first)
pnpm tauri dev      # the desktop window, needs the Tauri toolchain (WebKit on Linux)
pnpm test           # vitest: selectors, flows, the mock, the live source, the viewer audit
pnpm test:live      # the live source against a test server (NKATA_TEST_SERVER_URL)
pnpm build          # typecheck and bundle to dist/
pnpm shots          # screenshots of every Tweak combo into docs/v8-shots/; node scripts/report.mjs writes the report
```

- `?mock=1`, or any Tweak in the URL (`?role=lead&stage=studio&startScreen=asset&theme=dark&blender=lost`), runs the mock. Without them the app runs live against the server the session names, `http://127.0.0.1:7400` by default.
- `src/data/DataSource.ts`: the one interface the screens read. `src/data/mock/` is the prototype's data and logic; `src/data/live/` is the server and the agent.
- `src/auth/permissions.ts`: `can(action, role)`, the one gate. Nothing is ever disabled for a viewer.
- `src/app/`: the store, the selectors, the journey and connection machines, the boot for the mock and for live.
- `src/ui/` and `src/screens/`: the components and the screens, styled with the tokens in `src/styles/tokens.css`. No hex in components (scripts/lint-colors.mjs), no banned words (scripts/lint-copy.mjs).
- `src/viewer/nk-viewer.js`: the three.js viewer web component, with the Nkata changes marked.
- `src/parked/`: the earlier app, kept out of the build.

Decisions made along the way are in `../docs/decisions.md` under "v8".
