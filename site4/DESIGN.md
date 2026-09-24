# site4 ARGUS: agent contract

**Read the full spec first:** `docs/2026-09-24-argus-cockpit-design.md`. This page is only the short list of names every file must agree on. The plan and progress are in `docs/plan.md`.

## Rules
- The suit is the original SL-01 "ARGUS". No Gundam logos, names or official suits, and no franchise terms ("Minovsky", "Newtype").
- No orange-and-black hazard stripes. Cautions are amber text or outline chevrons.
- Use only the content in spec section 9. Plain static site: no build, no dependencies, relative paths.
- JS is `'use strict'` IIFEs; the only global is `window.ARGUS`.

## Tokens
`--night #060A12`, `--indigo #0E1830`, `--teal #1F4E5F`, `--sodium #FF9A3D` (scene only), `--hud #8CFFC1`, `--amber #FFB02E`, `--lock #FF3347`, `--ice #DDE7EE`, `--panel rgba(6,10,18,.72)`.
Fonts: B612 400/700 and B612 Mono 400/700 (one Google Fonts link, spec section 3).

## Hub DOM (index.html)
- `#cockpit` holds:
  - `#pano` > `.pano-ring` > the 24 `.pano-slice` elements (generated) plus the `.target` elements (`#t-pilot`, `#t-missions`, `#t-hangar`, `#t-unknown`), with `data-yaw`, `data-href` (not on unknown), `data-label` and `data-readout`;
  - `canvas#fx`, `img#frame`, `svg#hud` (hud.js builds its contents; the heading number is in `.hdg-readout`);
  - `nav#targets-nav` (links carry `data-target`), `p#lock-status.sr-only[aria-live]` and `button#tilt.hud-btn`.
- `#boot` > `pre#boot-log`, `button#skip`.
- Z-index scale: pano 1, fx 2, frame 3, hud 4, nav 5, boot 10.
- Sub-pages use `body.page`.

## Shared JS (`js/argus.js`)
`window.ARGUS = { state:{yaw,pitch,booted}, reduce, fine, on(type, fn), emit(type, detail) }`. Event names are prefixed `argus:`.

| event | detail | emitted by | used by |
|---|---|---|---|
| `argus:view` | `{yaw, pitch, vx, vy}` | cockpit.js, when the view changes | hud.js, fx.js |
| `argus:boot-done` | `{}` | boot.js | cockpit.js (input on), fx.js (start) |
| `argus:lock` | `{id \| null, label, readout}` | cockpit.js | hud.js (status line) |
| `argus:fire` | `{id, href}` | cockpit.js | fx.js (flash) |
| `argus:face` | `{yaw}` | boot.js, tests | cockpit.js turns the view to that yaw |

- **During the boot** (`state.booted` is false), boot.js writes `ARGUS.state.yaw` directly and cockpit.js renders from it without easing or input.
- **Session key:** `sessionStorage['argus-booted']`.

## Tests
`node tests/run.js` runs all of them, or run `tests/svg.test.js [pano|frame|hud|ms]`, `tests/hub.test.js` or `tests/pages.test.js` separately. Screenshots go to `tests/out/`, which is git-ignored.
