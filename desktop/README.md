# Nkata desktop

Tauri 2, React 19, Vite, Tailwind mapped to the brand tokens. The agent core is the Rust crate in `src-tauri/`.

```
pnpm install
pnpm dev            # the web view at http://localhost:1420
pnpm tauri dev      # the desktop window, needs the Tauri toolchain (WebKit on Linux)
pnpm test           # vitest: permissions, copy, tokens, mock data, viewer DOM, no hex
pnpm build          # typecheck and bundle to dist/
pnpm shots          # screenshots of every screen into shots/ (after pnpm build)
pnpm tokens         # regenerate src/styles/tokens.ts from tokens.json
pnpm renders        # regenerate the WebP renders from handoff/renders
```

- `src/components/`: every named component with a `*.states.tsx` file. `/#/states` renders them all.
- `src/screens/`: one file per screen. `ProjectLayout` holds the breadcrumb, status line, rail, and invite sheet.
- `src/data/`: the `DataSource` interface and the in memory mock. The server client replaces `mock.ts`.
- `src/auth/permissions.ts`: `can(action, role)`. The one place roles are checked.
- `src/copy/en.ts`: the copy strings, keyed as in the handoff.
- `DECISIONS.md`: calls made where the handoff was silent.

The theme toggle is in the account menu under Appearance and is kept in `localStorage`.
