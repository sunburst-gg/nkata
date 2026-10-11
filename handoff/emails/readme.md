# Nkata emails, v1

Three emails. One card, one action each. Table layout, inline styles, system fonts. Georgia stands
in for the serif, Helvetica for Geist. Dark mode by media query. From the Nkata Emails design
(Oct 11, 2026), unpacked from the bundled page; the dark variants are the same files with the
media query on.

- `sign-in-code.html`: the six digit code.
- `studio-invite.html`: added to a studio, with the role.
- `project-invite.html`: a project shared, with the role and a note.

The server renders these from `server/src/domain/emails.ts` with the engine's copy: a code lives
15 minutes, the invite button lands on `/join`, which says to open Nkata and sign in.
