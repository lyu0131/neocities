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

## Yaw to panorama mapping (pano.svg and cockpit.js must agree)
- `pano.svg` is 9600 units wide, so 1° is 26.667 units.
- Looking at yaw θ puts the view's centre at `x = θ × 26.667`, wrapping modulo 9600. Yaw 0 (MISSIONS, straight ahead) is centred on x = 0, which is the same as x = 9600. Yaw +52 (HANGAR) is at x ≈ 1387, yaw −52 (PILOT) at x ≈ 8213, and yaw 180 (UNKNOWN) at x = 4800.
- Positive yaw turns right. At pitch 0 the view is centred on y ≈ 1000 and shows roughly y 330–1670 on a 16:9 screen. The horizon is at y ≈ 1150.
- Targets sit around y 700–1050 in panorama space.

## Tests
`node tests/run.js` runs all of them, or run `tests/svg.test.js [pano|frame|hud|ms]`, `tests/hub.test.js` or `tests/pages.test.js` separately. Screenshots go to `tests/out/`, which is git-ignored.

## File ownership (wave 2 — who sets what)
Three agents build in parallel. Each writes only its own files and only touches the properties below, so nothing collides.

| file | owns |
|---|---|
| `js/cockpit.js` | generating the 24 `.pano-slice` elements; the inline `transform` and `background-position-x` on each slice; the inline `transform` on `.pano-ring`; the inline `transform` on each `.target`; `ARGUS.state.yaw/pitch`; emitting `argus:view`, `argus:lock`, `argus:fire`; listening for `argus:face` |
| `js/hud.js` | everything inside `svg#hud` (it builds the children, including `.hdg-readout`) |
| `js/boot.js` | the `#boot` overlay's contents and removal; adding/removing `.boot-flicker` on slices and `.hud-draw` on `#hud`; writing `ARGUS.state.yaw` during the boot; `ARGUS.state.booted`; `argus:boot-done` |
| `js/fx.js` | the `canvas#fx` bitmap only |
| `css/cockpit.css` | all layout, size, colour, z-index, `perspective`, and the look of the boot overlay; the `.boot-flicker` and `.hud-draw` animations and transitions; reduced-motion; the 375px layout |

**CSS must not set `transform` on `.pano-ring`, `.pano-slice` or `.target`** — cockpit.js writes those inline every frame and would overwrite it. Give `.pano-slice` its size, `backface-visibility` and `transform-origin` instead, and put `perspective` on `#pano` and `transform-style: preserve-3d` on `.pano-ring`.
cockpit.js reads the slice width from the CSS custom property `--slice-w` on `#pano` if it is set, and otherwise computes it from the viewport.
