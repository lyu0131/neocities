# site2 v2 — design brief ("the light table")

Shared contract for every agent. Read it fully. Don't invent class names, data-attributes or APIs outside it; if you truly need one, add it to your own file and report it.
The previous version is backed up in `../site2-old/` (for reference only — don't edit it).

## What changes
v1 was tidy: a 12-column bordered spec-sheet grid. v2 throws the grid away. The site becomes **a light table / studio floor**: xeroxes, prints, tape labels and cut-out scraps thrown down loosely, overlapping, tilted, at clashing sizes — **different on every visit**, and the visitor can **move things, photocopy things, and scan over things**.
Keep: all copy lorem ipsum, site name `LOREM/IPSUM`, the same 5 pages (index/work/sound/zine/void), the AI images in `img/`, and `gen.js` generative art.
Plain static HTML/CSS/JS, no build step, no frameworks, relative paths only (Neocities).

## Hard rules
- **No grid layouts.** No 12-column `.grid`, no bordered cell tables. Composition comes from scatter, overlap, rotation, scale contrast, and flow text that breaks shape.
- **No orange/black hazard stripes anywhere** (the user removed them deliberately). Barrier tape, if used at all, is black/paper only.
- Progressive enhancement: with JS off, every page is a readable, stacked, slightly jittered page. JS adds the scatter/drag/copy/scanner.
- `prefers-reduced-motion: reduce` → no drift, no scanner, no scroll animations, no auto-motion; drag and click-copy still work (user-initiated).
- Real text stays readable (contrast ≥ 4.5:1) and real links stay reachable by keyboard and never end up under other items (nav is always on top).
- No horizontal page scroll at 375px.

## Design plan (frontend-design pass — this section overrides anything older below)
Concept: **a paste-up board on a light table** — the real workbench zines were made on: backlit table, non-repro-blue guide pencil, crop & registration marks, typewritten captions, cut-out letters, masking tape.
Audience: people who browse Neocities / zines / small-press art. Job: let them explore the work by handling it.
The ONE bold thing: headings are ransom notes built from real cut-out letter images, and everything on the table can be picked up. Everything else stays quiet.

| token | value | use |
|---|---|---|
| `--table` | `#E9EEEC` | page background: cool, fluorescent-lit light table (NOT cream) |
| `--print` | `#FFFFFF` | photo prints, sheets |
| `--toner` | `#000000` | text, true black (no tinted near-black) |
| `--graphite` | `#4F524F` | captions / secondary text (~7:1 on --table) |
| `--nonrepro` | `#6FB7DD` | paste-up guide blue: crop marks, registration marks, misregistration ghosts, scanner bar tint, hover guides. **Never text colour.** |
| `--cut` | `#D8552A` | cut-paper orange sampled from the letters. Appears only via the cut-letter images + at most one tiny mark per page. Never UI chrome. |

Type: **Courier Prime** 400/700 (typewriter — monospace, on-subject). Link in every page head:
`https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap`
- Body 16px (captions/meta 13px), line-height 1.5, measure ≤ 65ch. Sentence case everywhere.
- Display = ransom headings from `img/cut/letter-NN.png` (play.js), CSS `.r-1…r-6` fallback for characters with no cut letter (system fonts: "Times New Roman", Georgia, "Arial Black", Impact).
- Loose giant words (`.word`): Courier Prime Bold at clamp(64px,16vw,260px) with a `--nonrepro` misregistration ghost.
Copy rules: sentence case; no all-caps labels; no middle-dot meta strings (join with commas); no "WORD — fragment" labels; no "→" on links; no decorative numbering (release catalogue numbers are real sequence, keep them). Plain verbs for instructions: "Drag anything.", "Click a print to look closer.", "Shuffle the table".
Interaction/UX rules: grab/grabbing cursors on draggable items, pointer on clickable; touch targets ≥ 44px with ≥ 8px spacing; focus = 3px toner outline + offset; z-index scale 10 (items base) / 20 (dragging) / 30 (scanner) / 40 (lifted) / 50 (nav); `.table{isolation:isolate}` so item z-indexes never beat the nav; at most 1–2 ambient animations per view.
Structural marks carry information: `--nonrepro` crop marks appear on items you can drag; registration marks sit where the scanner is.

## Palette & type (legacy names — map to the tokens above)
`--paper`→`--table`, `--white`→`--print`, `--ink`→`--toner`, `--grey`→`--graphite`, `--hazard`→ replaced by `--nonrepro` for UI and `--cut` for the one tiny accent.
Type sizes: `.t-xs` 13px, `.t-s` 16px, `.t-m` 22px, `.t-l` clamp(40px,8vw,120px), `.t-xl` clamp(64px,16vw,260px).

## Layout primitives (style.css)
- `.table` — a scatter surface (any page region). Without JS: normal block flow of its children with small jitter. JS adds `.is-scattered` and positions children absolutely; the table's height is then set by JS.
- `.item` — anything on a table. Variants (combinable):
  - `.print` — photo print: white border, image inside, `.cap` caption strip below.
  - `.sheet` — paper sheet with a torn edge (clip-path polygon; variants `.sheet-2`, `.sheet-3`), text inside.
  - `.label` — a tape label: translucent masking-tape strip (paper-coloured, semi-opaque, ragged ends) with t-xs mono text.
  - `.scrap` — a transparent cut-out PNG (from `img/cut/`), no border, `mix-blend-mode:multiply` where helpful.
  - `.word` — a giant loose word (t-xl) as an item.
  - size hints: `.w-s` (~18vw), `.w-m` (~28vw), `.w-l` (~42vw), `.w-xl` (~60vw); on phones they become 60–100% width.
- `.misreg` — misregistered print: a grey offset ghost of the text (text-shadow offset in `--grey`).
- `.slice` — giant word cut into 3 horizontal strips offset sideways (uses `data-text` + pseudo-elements with clip-path).
- `.vert` (vertical writing-mode), `.flip` (rotated 180deg), `.side` (rotated 90deg).
- `.ransom` + letter classes `.r-1` … `.r-6` — ransom-note letters (each a different system font / weight / size-scale / inverted ink box / small rotation). JS assigns them.
- `.stamp` — small hazard rubber stamp, ink text, border, rotated.
- `.meta` grey t-xs uppercase; `.file` fake filename caption.
- `.edge-nav` — the navigation: four stamped link labels fixed at the viewport edges (site name top-left; WORK top-right; SOUND right edge vertical; ZINE bottom-left; VOID left edge vertical). Paper background, ink text, border, always on top (z-index above all items), `aria-current="page"` shown inverted (ink bg, paper text). It is a real `<nav>` with a list of links in source order.
- `.stage` + `.stage > canvas` — full-viewport sticky scroll stage for VOID: each `.stage` is 100vh tall with its canvas `position:sticky; top:0; height:100vh`; later stages scroll over earlier ones.
- `.lifted` — state for an item brought up to inspect (fixed, centred, large, top z-index, backdrop dim via ::before). Set by JS.
- `.scanner` — the scanner light bar element (created by JS).
- `.copy` — a photocopy clone created by JS.
- Grain: a subtle global grain overlay (`body::after`, SVG feTurbulence data URI, multiply, pointer-events:none, low opacity).

## play.js API (vanilla, IIFE, no deps, `<script src="play.js" defer>`)
All behaviour is opt-in via data-attributes:
- `[data-scatter]` on a `.table`: scatter its `.item` children. Optional `data-seed` (fixed layout) else random per load; `data-density` (`loose`|`tight`, default loose). Items get random position, rotation (±`data-tilt` on the item, default 7deg), and stacking. Avoid burying items completely: every item must keep ≥ ~35% visible; text sheets (`.sheet`) and links must stay fully visible. Relayout on resize (debounced). Under 700px width: "stack mode" — items stacked vertically, jittered (±14px x, ±4deg), overlapping slightly (negative margin), still readable.
- `[data-drag]` on an item: draggable with pointer events (4px threshold so inner links/clicks still work), brought to front on grab; positions saved in `localStorage` per page + item `id`; a `[data-reset]` button restores the random layout. Keyboard: focusable items can be nudged with arrow keys (Shift = bigger steps).
- `img[data-copy]`: click = photocopy it. Spawns a `.copy` item offset 14–30px + small rotation on the same table, each generation more degraded (contrast up, grain, slight blur, threshold, drift). Canvas pixel processing when allowed; if the canvas is tainted (file:// testing) fall back to a CSS-filter clone. Max 8 copies per original; a 9th click clears them.
- `[data-lift]` on an item: click toggles `.lifted` (inspect large); Esc / click backdrop closes. (Used on WORK instead of copy.)
- `[data-ransom]` on a heading: splits its text into letters with random `.r-1…r-6` classes (seeded per load); keeps the real text for assistive tech (`aria-label` on the element, letter spans `aria-hidden`).
- `body[data-scanner]`: a vertical scan-light bar follows the pointer's x (eased), brightens/reveals what's under it (mix-blend), with a thin hazard line at its edge. Off on touch devices and reduced motion.
- `[data-drift]`: element drifts slowly and bounces inside its parent (cover words). Off under reduced motion.
localStorage access must be wrapped in try/catch.

## gen.js
Existing file, unchanged API: `<canvas data-gen="noise|scan|halftone|wave|copy" aria-hidden="true">` inside a sized box. Pieces: noise, scan, halftone, wave, copy.

## Images
- `img/*.jpg` — 13 AI images (see `img/IMAGES.md` for sizes + alt text).
- `img/cut/*.png` — NEW transparent cut-out scraps (letters, tape pieces, torn paper, toner marks); see `img/cut/CUTS.md` once it exists.

## Pages
All pages: head with fonts + style.css; `.edge-nav`; one `<main>`; exactly one `<h1>` (may be a `.word`/`.slice`/`[data-ransom]`); a tiny footer (`.meta` line only); `gen.js` + `play.js` deferred; `body data-scanner` on index/work/zine.
1. **index** — cover: a full-viewport `noise` canvas; the four section words WORK / SOUND / ZINE / VOID as huge `[data-drift]` links floating over it (these are real links too), the ransom-note `h1` LOREM/IPSUM, a few scraps and one taped note. Nothing else.
2. **work** — the light table: one big `[data-scatter]` table of ~12 `.print` items (the AI images, `data-lift`, `data-drag`) at mixed sizes, tape `.label` captions, cut-out scraps, one `.stamp`, a `[data-reset]` "RE-SHUFFLE" label.
3. **sound** — releases as vertical cassette **spines** (`.vert` strips with release no., title, tracklist) standing next to their covers, a `wave` canvas band; the three releases scattered on a table with `data-drag`. Tracklists must stay readable.
4. **zine** — cut-up text: entries as `.sheet` items on a scatter table, lines broken at odd places, columns of different widths, a few sentences `.side`/`.flip`, `.misreg` headings, one giant `.slice` quote, images with `data-copy`.
5. **void** — immersive: a stack of `.stage` sections (noise, scan, copy, halftone, wave) with images flashing between them (`data-copy` on those images), almost no text. The small `h1` sits top-left.

## Accessibility floor
Contrast ≥ 4.5:1 for text; visible focus (2px hazard outline); keyboard-reachable nav; alt text on content images (decorative scraps `alt=""`); canvases `aria-hidden`; reduced motion respected; `lang="en"`.
