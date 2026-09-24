# site2 — design brief

Shared contract for everyone building this site. Read it fully. Do not invent class names or APIs outside it; if you need one, add it to your own file and mention it in your report.

## What it is
A static Neocities site (plain HTML/CSS/JS, no build step, no frameworks, relative paths only).
One person's everything-site: art portfolio + music releases + zine/log + a pure art piece.
All copy is **lorem ipsum filler**. Titles can be short nonsense in CAPS (e.g. `UNTITLED_04`, `LOREM TAPE VOL.2`).

## Vibe
Brutalist, raw, unpolished, anti-design, utilitarian, industrial, photocopied zine.
Think: xerox flyers, shipping labels, hazard tape, spec sheets, museum wall labels, file listings.
It should look *assembled*, not *designed*. Never soft, never rounded, never shadows, never gradients-as-decoration, never "clean SaaS". No emoji.

## Type
- Everything monospace: `"IBM Plex Mono", "Courier New", ui-monospace, monospace`
  (load IBM Plex Mono 400/700 from Google Fonts in each page `<head>`).
- One deliberate intruder: `.serif` = `"Times New Roman", Times, serif` italic, used rarely for a single clashing word.
- Sizes must **clash**. Tiny 11px labels sit right next to headings at 14–22vw. No smooth scale — jumps.
  - `.t-xs` 11px, `.t-s` 13px (body), `.t-m` 20px, `.t-l` clamp(40px, 8vw, 120px), `.t-xl` clamp(64px, 18vw, 320px)
- Uppercase for labels. Tight or negative letter-spacing on the giant sizes (`-0.06em`), wide on tiny labels (`0.1em`).
- Line-height 1 or less on giant type; let lines crash into each other.

## Colour
| token | value | use |
|---|---|---|
| `--paper` | `#efede6` | page background (off-white xerox) |
| `--ink` | `#0b0b0b` | text, borders |
| `--grey` | `#5f5f5a` | secondary text, meta (≈5:1 on paper — keep it at least this dark) |
| `--hazard` | `#ff4a00` | the one ugly accent — stamps, hover, a single block per page |

Dark mode is **not** wanted; the paper look is the point. `.inv` flips a block to ink background / paper text.

## Layout
- 12-column CSS grid, `.grid`, gap 0 by default — columns separated by 1px ink borders, like a spec sheet.
- Span helpers: `.c-2 .c-3 .c-4 .c-6 .c-8 .c-12`. Everything collapses to 1 column under 700px.
- `.box` = 1px solid ink border, 8px padding. Borders touching/doubling is fine and encouraged.
- Things may overlap and misalign on purpose: `.rot-l` (rotate -2deg), `.rot-r` (rotate 1.5deg), `.nudge` (translate a few px off-grid).
- Page padding small (8px). Content goes edge to edge.
- Must not cause horizontal page scroll at 375px, even with giant type (use `overflow-wrap:anywhere` / `overflow:hidden` on giant blocks).

## Motifs (classes style.css must provide)
- `.nav` — top bar: site name left, links as `[WORK] [SOUND] [ZINE] [VOID]` in brackets, current page marked with `aria-current="page"` styled as `.inv`.
- `.stamp` — hazard-orange rotated rubber-stamp label with border, uppercase, t-xs.
- `.tape` — a strip of black/white barrier tape (repeating diagonal ink/paper stripes), footer only, height ~14px. The user asked for no orange/black stripes anywhere.
- `.file` — exposed filename label under an image, e.g. `IMG_0412.JPG — 2.3MB — 1600×1200`, t-xs grey.
- `.meta` — grey t-xs uppercase metadata line (dates, counts, durations).
- `.ticker` — single-line horizontally scrolling text band (CSS animation, disabled under reduced motion).
- `.bg-canvas` — `position:fixed; inset:0; z-index:-1; width:100%; height:100%` canvas behind a page.
- `.full-canvas` — a canvas that fills its container block (used on VOID page).
- Links: underlined, ink; hover = hazard background.
- `img` — `display:block; width:100%; height:auto;` optional `.xerox` class: `filter: grayscale(1) contrast(1.4)`; hover removes filter.

## Generative art — `gen.js` API
Include with `<script src="gen.js" defer></script>`. On load it finds every `<canvas data-gen="...">` and runs that piece:
- `data-gen="noise"` — dithered noise field / static, slowly shifting
- `data-gen="scan"` — glitch scanlines / signal tear
- `data-gen="halftone"` — halftone dot blobs drifting
- `data-gen="wave"` — oscilloscope / tape waveform: a few jittery signal traces scrolling sideways (for SOUND)
- `data-gen="copy"` — generation loss: a shape re-drawn from its own last frame, slightly shifted/scaled/thresholded each step until it degrades, then reseeds (for VOID)
Rules: canvas is sized to its CSS box × devicePixelRatio and re-sized on window resize; new random seed on each page load (optional `data-seed` attribute to fix it); palette uses only paper/ink/grey/hazard; under `prefers-reduced-motion: reduce` draw one still frame and stop; pause animation when offscreen (IntersectionObserver) or tab hidden. No dependencies. Canvases get `aria-hidden="true"` in the HTML (decorative).

## Pages
`index.html` is DONE (one-page demo/cover with a preview of each section) — do not rewrite it; its nav links to the four pages below.
All share `style.css`, `gen.js`, the same `.nav`, and a footer with a `.meta` line + `.tape`.
1. `index.html` — zine cover. `.bg-canvas data-gen="noise"` behind. Giant `.t-xl` site name crashing across the page, a contents list of the four sections with page numbers like `P.01`, a `.ticker`, a couple of AI images collaged with `.rot-l/.rot-r`.
2. `work.html` — portfolio. Irregular grid of the AI images (mixed spans), each with `.file` label + title + `.meta` year/medium.
3. `sound.html` — music. 3 releases, each: title, `.meta` (N TRACKS · 00:00:00 · DATE), numbered tracklist in t-s, `STREAM →` links (href="#"), release number like `0003` huge in grey. One cover image each.
4. `zine.html` — log. Dated entries (`2026.09.23 — 03:13`), mixed lengths of lorem ipsum, some entries tiny, one giant quote in `.t-l .serif`. One `.stamp`.
5. `void.html` — the art piece. Minimal chrome: nav, then full-viewport `.full-canvas` pieces (`scan`, `halftone`) stacked with one or two images between them, almost no text.

## Images
AI-generated images live in `img/` (photocopied textures, industrial halftone photos, torn paper scans). List the folder to see what exists; reference them by relative path `img/<name>`. Always write meaningful `alt` text describing the image.

## Accessibility floor (non-negotiable even in anti-design)
Real text contrast ≥ 4.5:1 for all text (ink/grey on paper pass; on hazard use ink text only — grey or paper on hazard fails), visible focus outline (hazard, 2px), keyboard-reachable nav, `lang="en"`, alt text, reduced-motion respected for ticker + canvases.
