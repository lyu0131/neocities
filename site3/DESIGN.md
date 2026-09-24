# site3 — design brief

Shared contract for every agent building this site. Read it fully. Don't invent class names or APIs outside it; if you truly need one, add it to your own file and report it.

## What it is
Static Neocities site: plain HTML/CSS/JS, no build step, no frameworks, relative paths only.
Same structure as its sibling `../site2` (cover + WORK / SOUND / ZINE / VOID), but **more abstract, more brutal, more stylish**.
Site name: `DOLOR/SIT`. All copy is **lorem ipsum filler**; titles are short caps nonsense (`EXHIBIT_07`, `NULL TAPE`). No real names, brands, places.

## Vibe
Evidence locker × fly-posted underpass × photocopier left running overnight.
Photocopy grain, halftone, xerox, scan artefacts, dithering, pixelation, glitch, crude scissor cutouts, harsh on-camera flash, CCTV stills, raw concrete, poster walls, wheatpaste, thermal receipts, barcodes.
It must look **pasted, taped, scanned, surveilled** — never designed-by-a-template. No rounded corners, no drop shadows, no soft gradients, no emoji, no "clean".
More brutal than site2 means: bigger type, harder contrast, denser overlap, less whitespace politeness, more texture on everything.

## Colour
| token | value | use |
|---|---|---|
| `--paper` | `#e6e5df` | page background (cheap grey copy paper) |
| `--white` | `#ffffff` | receipts, flash-blown areas, pasted sheets |
| `--ink` | `#000000` | text, borders |
| `--grey` | `#55544f` | meta text (≈6:1 on paper — never lighter for text) |
| `--concrete` | `#8c8b85` | blocks, rules, tape — **never as text colour** |
| `--rec` | `#ff1a1a` | the one signal colour: REC dots, stamps, laser lines. Text on it must be ink. Never red text on paper. |

## Type (Google Fonts — every page `<head>` loads exactly this one link)
`https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@400;700&family=VT323&family=Libre+Barcode+39+Text&display=swap`
- `--display` Anton — giant condensed headlines, always uppercase, line-height ~.82, tight tracking. Lines crash/overlap.
- `--mono` IBM Plex Mono — body, labels.
- `--vt` VT323 — CCTV overlays, timestamps, camera IDs, pixel UI (`.vt`).
- `--barcode` "Libre Barcode 39 Text" — `.barcode` renders `*LOREM-0001*` as a scannable-looking barcode (wrap text in asterisks).
- Sizes clash hard: `.t-xs` 11px, `.t-s` 13px (body), `.t-m` 22px, `.t-l` clamp(48px,10vw,160px) display, `.t-xl` clamp(80px,24vw,420px) display.

## Layout
- `.grid` 12 columns, gap 0, children get 1px ink borders (spec-sheet feel). Spans: `.c-2 .c-3 .c-4 .c-5 .c-6 .c-7 .c-8 .c-12`. Collapses to 1 column < 700px.
- Offsets / overlap helpers: `.rot-l` (-3deg) `.rot-r` (2deg) `.rot-x` (-7deg) `.nudge` (translate off-grid) `.over` (negative top margin so it overlaps the previous block).
- Body padding 0–8px, edge to edge. **No horizontal scroll at 375px** (clip overflow, `overflow-wrap:anywhere` on giant type).

## Texture system (style.css provides)
- **Global grain**: `body::after` fixed full-viewport SVG `feTurbulence` noise (inline data-URI), `mix-blend-mode:multiply`, low opacity, `pointer-events:none`, high z-index. Must never block clicks.
- `.paste` — a wheatpasted sheet: white paper, jagged torn edge (clip-path polygon), subtle wrinkle/glue sheen (hard-edged gradients only), slight rotation. Variants `.paste-2 .paste-3` with different tear shapes.
- `.wall` — poster-wall container: concrete-coloured background with grain, children overlap freely (CSS grid with deliberate overlaps or negative margins).
- `.cut` — crude scissor cutout on an image/figure: jagged polygon clip-path. Variants `.cut-2 .cut-3`.
- `.taped` — masking-tape pieces on corners (translucent concrete rectangles via ::before/::after, rotated).
- `.receipt` — thermal receipt: white, `.t-xs`/mono, zig-zag torn top & bottom edges (mask or clip-path), dashed `hr`s, two-column line items (`.line` with `<span>` left and right, dotted leader), bold TOTAL line, `.barcode` at the bottom.
- `.barcode` — Libre Barcode font, large, ink.
- `.cctv` — wrapper for an img or canvas: scanline overlay, dark vignette, VT323 overlay labels from attributes `data-cam` (top-left) and `data-time` (top-right) via `content:attr()`, blinking `--rec` REC dot (stops under reduced motion).
- `.flash` — harsh flash treatment on an img: `filter: contrast(1.5) brightness(1.1)` + hard black vignette overlay.
- `.glitch` — heading with `data-text` duplicate layers offset/clipped (stepped animation; static offset under reduced motion).
- `.pixel` — `image-rendering: pixelated` for the pixel fx images.
- `.stamp` — `--rec` rubber stamp, ink text, border, rotated. `.meta` — grey 11px uppercase. `.file` — fake scan filename caption. `.exhibit` — evidence tag label (black box, white VT323 text, e.g. `EXHIBIT 07`).
- `.nav` — black bar, paper VT323 links as `[WORK] [SOUND] [ZINE] [VOID]`; `aria-current="page"` shown as `--rec` block with ink text. Site name left in display font.
- `.canvas-box` — block canvas `width:100%` with a height; `.h-s` 180px, `.h-m` 360px, `.h-l` min(70vh,640px).
- Links: underlined; hover = ink background, paper text.

## Generative art — `gen.js`
`<script src="gen.js" defer></script>`; every `<canvas data-gen="…" aria-hidden="true">` runs a piece. Existing pieces (from site2): `noise`, `scan`, `halftone`, `wave`, `copy`. New for site3:
- `cctv` — a surveillance feed: dithered grey scene/figure blobs drifting, rolling interference bar, occasional frame freeze + horizontal tear, burned-in VT323 `CAM 0X` + live timestamp drawn on the canvas.
- `barcode` — a strip of barcode bars that constantly re-scans/re-encodes with glitch jumps; a `--rec` laser line sweeps across occasionally.
Rules as site2: sized to CSS box × DPR, seeded (`data-seed`), palette = paper/white/ink/grey/concrete/rec, reduced motion → one still frame, pause offscreen/hidden, no deps.

## Images — `img/` (raw AI) and `img/fx/` (processed)
Raw AI images (Canva) are `img/<name>.jpg`. Processed variants are `img/fx/<name>-<fx>.png`. Pages should mostly use the **fx** versions (that's the look); raw only for the occasional full-colour flash shot. See `img/IMAGES.md` for the file list, sizes and alt text once it exists.

| name | ratio | fx treatments |
|---|---|---|
| cctv-garage | 16:9 | pixel |
| cctv-corridor | 4:3 | dither |
| flash-face | 4:5 | xerox |
| flash-trolley | 3:2 | halftone |
| concrete-block | 3:4 | dither |
| poster-wall | 16:9 | glitch |
| wheatpaste | 2:3 | xerox |
| receipt | 1:2 | xerox |
| barcodes | 1:1 | glitch |
| cutout-face | 3:4 | halftone |
| hands | 1:1 | dither |
| scan-smear | 16:9 | pixel |

fx definitions: **dither** 1-bit ordered/Floyd–Steinberg in ink on paper, chunky (render at ½ then nearest ×2). **halftone** 45° round-dot screen, ink on paper, coarse cells. **pixel** heavy downscale + nearest upscale + posterized greys (CCTV compression). **xerox** crushed threshold + toner speckle + streaks + slight skew. **glitch** horizontal slice displacement, stretched pixel rows, one channel offset in `--rec`.

## Pages
All pages: same `<head>` font link + `style.css`, same `.nav`, one `<main>`, exactly one `<h1>`, footer (`.meta` line + a `.barcode`), `gen.js` deferred.
1. `index.html` — the cover is a **poster wall**: `.wall` filling the first screen with overlapping `.paste` sheets, fx images as cutouts, a `cctv` canvas tile, and the giant `.t-xl` `DOLOR/SIT` partly covered by pasted things. The table of contents is a `.receipt` (line items `WORK ....... P.01` linking to each page, TOTAL, barcode). Links out to the four pages — no section content on the cover.
2. `work.html` — evidence archive: fx images as `.cctv` frames, `.cut` cutouts and `.taped` prints, each with an `.exhibit` tag, title, `.meta`.
3. `sound.html` — releases as **receipts**: each release is a `.receipt` (tracklist = line items with durations, TOTAL runtime, catalogue barcode) next to a flash/halftone cover; a `barcode` canvas strip and a `wave` canvas.
4. `zine.html` — **wheatpaste wall of text**: entries as `.paste` sheets of different sizes/rotations on a `.wall`, some `.glitch` headings, one giant quote.
5. `void.html` — **CCTV monitor wall**: a grid of `.cctv` canvases (`cctv`, `noise`, `scan`, `copy`, `halftone`, `barcode`) with CAM labels, interleaved with fx images; almost no text.

## Accessibility floor
Text contrast ≥ 4.5:1 (ink/grey on paper or white; ink on concrete or rec; paper/white on ink). Visible focus (`--rec` 3px outline). Alt text on content images (decorative wall scraps may be `alt=""`). Canvases `aria-hidden`. Reduced motion stops blinking, glitch and ticker animation. `lang="en"`. Keyboard-reachable nav.
