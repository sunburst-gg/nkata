# Nkata design system

Nkata (Igbo: a conversation) is a desktop app for game studios plus panels inside Blender and Unreal Engine 5. Assets are sets of parts; each part has an owner, a state (Locked, Draft, Ready, Approved), a gate, a timeline, checks, and comments pinned on the mesh. Four roles: Artists, Engineers, Writers, Producers.

Sources: product doc (Sept 28, 2026, Emmanuel Njoku), brand brief, and the brand guideline in this project (`Nkata Brand Guideline.dc.html`, deck in `Nkata Brand Guideline Deck.dc.html`). Renders in `assets/renders/` are from the Sunburst compound set.

## Content fundamentals
Short declarative lines, present tense. Names before files. Numbers, IDs, file names, versions, and times in mono. No exclamation marks. No em dashes. Never: commit, branch, merge, checkout, changelist, push, pull, seamless, powerful, supercharge. Say: part, publish, timeline, lock, check, review, approve, send back, roll back, in Unreal, in Blender. No emoji. Example: "Ada is in Ojukwu / face. Opened 12 minutes ago."

## Visual foundations
- Dark first. Ten-step blue-grey neutral scale, low chroma, sits beside Blender and Unreal greys. Light mode inverts the scale and warms the canvas (#F6F6F4).
- One accent, amber #E9A23B. Used for the primary action, the active part, links, and the presence dot. Never fills a background. About 3% of any screen.
- Seven state colors, each with a glyph and a word; distinct in grayscale. Draft is neutral.
- Type: Geist 400/500/600 for words, Geist Mono 400/500 for things. Scale 11 to 72. Tracking tightens with size.
- Hierarchy through type and spacing, not boxes. Hairline dividers (--line-hairline) over cards. Cards, when used: --bg-panel, 1px --line-hairline, --radius-xl (12) in app, --radius-editor (3) in panels.
- Shadows only on floating layers (dialogs, popovers). No glow, no gradients, no decorative motion.
- Motion: 150 ms state changes, 300 ms panels, cubic-bezier(.2,0,0,1). State changes animate color and badge.
- Hover: background steps up one neutral (--bg-hover). Press: --bg-active. Focus: 2px accent ring offset by canvas.
- Imagery: real product screens and real in-engine renders. No stock, no abstract gradients.

## Iconography
Stroke icons, 1.75 to 2 px at 16, round caps. Lucide (CDN) is the working set; state glyphs are fixed: lock, dot, eye, check, x, link, pulse, link-off. No emoji.

## Index
- `styles.css` → tokens/colors.css, typography.css, spacing.css
- `tokens/tokens.json` machine-readable export
- `Nkata Components.dc.html` component sheet, all states
- `assets/renders/` compound renders
