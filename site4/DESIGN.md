# site4 BUNNYS: agent contract

**Read the full spec first:** `docs/2026-09-24-bunnys-cockpit-design.md`. This page is only the short list of names every file must agree on. The plan and progress are in `docs/plan.md`.

## Rules
- The suit is the original SL-01 "BUNNyS". No Gundam logos, names or official suits, and no franchise terms ("Minovsky", "Newtype").
- No orange-and-black hazard stripes. Cautions are amber text or outline chevrons.
- Use only the content in spec section 9. Plain static site: no build, no dependencies, relative paths.
- JS is `'use strict'` IIFEs; the only global is `window.BUNNYS`.

## Tokens
`--night #060A12`, `--indigo #0E1830`, `--teal #1F4E5F`, `--sodium #FF9A3D` (scene only), `--hud #8CFFC1`, `--amber #FFB02E`, `--lock #FF3347`, `--ice #DDE7EE`, `--panel rgba(6,10,18,.72)`.
Fonts: B612 400/700 and B612 Mono 400/700 (one Google Fonts link, spec section 3).

## Hub DOM (index.html)
- `#cockpit` holds:
  - `#pano` > `.pano-ring` > the 24 `.pano-slice` elements (generated) plus the `.target` elements (`#t-pilot`, `#t-missions`, `#t-hangar`, `#t-unknown`), with `data-yaw`, `data-href` (not on unknown), `data-label` and `data-readout`;
  - `canvas#fx`, `img#frame`, `svg#hud` (hud.js builds its contents; the heading number is in `.hdg-readout`);
  - `nav#targets-nav` (links carry `data-target`), `p#lock-status.sr-only[aria-live]` and `button#tilt.hud-btn`.
- `#boot` > `.boot-splash` (`.boot-mark` wordmark, `.boot-sub`, `.boot-bar > i`, `.boot-ver`), `pre#boot-log`, `button#skip`.
- Z-index scale: pano 1, fx 2, frame 3, hud 4, nav 5, boot 10.
- Sub-pages use `body.page`.

## Shared JS (`js/bunnys.js`)
`window.BUNNYS = { state:{yaw,pitch,booted}, reduce, fine, on(type, fn), emit(type, detail) }`. Event names are prefixed `bunnys:`.

| event | detail | emitted by | used by |
|---|---|---|---|
| `bunnys:view` | `{yaw, pitch, vx, vy}` | cockpit.js, when the view changes | hud.js, fx.js |
| `bunnys:boot-done` | `{}` | boot.js | cockpit.js (input on), fx.js (start) |
| `bunnys:lock` | `{id \| null, label, readout}` | cockpit.js | hud.js (status line) |
| `bunnys:fire` | `{id, href}` | cockpit.js | fx.js (flash) |
| `bunnys:face` | `{yaw}` | boot.js, tests | cockpit.js turns the view to that yaw |

- **During the boot** (`state.booted` is false), boot.js writes `BUNNYS.state.yaw` directly and cockpit.js renders from it without easing or input.
- **Session key:** `sessionStorage['bunnys-booted']`.

## Yaw to panorama mapping (pano.svg and cockpit.js must agree)
- `pano.svg` is 9600 units wide, so 1° is 26.667 units.
- Looking at yaw θ puts the view's centre at `x = θ × 26.667`, wrapping modulo 9600. Yaw 0 (MISSIONS, straight ahead) is centred on x = 0, which is the same as x = 9600. Yaw +52 (HANGAR) is at x ≈ 1387, yaw −52 (PILOT) at x ≈ 8213, and yaw 180 (UNKNOWN) at x = 4800.
- Positive yaw turns right. At pitch 0 the view is centred on y ≈ 1000 and shows roughly y 330–1670 on a 16:9 screen. The horizon is at y ≈ 1150.
- Targets sit around y 700–1050 in panorama space.

## Tests
`node tests/run.js` runs all of them, or run `tests/svg.test.js [pano|frame|hud|ms]`, `tests/hub.test.js` or `tests/pages.test.js` separately. Screenshots go to `tests/out/`, which is git-ignored.

## Hub controls
Drag, wheel, arrow keys **and WASD** (A/D yaw, W/S pitch; held keys turn continuously),
`Home` faces forward, the slew panel turns onto a contact, and tilt on touch devices.
Aim magnetism pulls the reticle onto a contact within `SNAP_DEG` (14) degrees and closes
the last `SNAP_CLICK` (1.2) degrees outright so it clicks on rather than drifting in. It
waits out live input (`now - lastInputTime > 90`) so a wheel nudge or a held turn key is
never fought, and stays off entirely while dragging.

## Invariants
- **`.pano-ring` must be translated forward by the perspective distance.** CSS puts the
  camera at `z = +perspective` while the ring's origin — the sphere's centre — is at
  `z = 0`, so without `translateZ(PERSP)` the camera stands outside the sphere and the
  projection is wrong: a 15° slice does not subtend 15°, and the field of view comes out
  at 237° instead of 100°. `applyRing()` writes it. Winding `perspective` up to compensate
  only pushes the projection toward orthographic and the scene reads flat.
- CSS must never set `transform` or `filter` on `.pano-ring`, `.pano-slice` or `.target` — cockpit.js and boot.js write those inline every frame.
- `--slice-h` must stay `--slice-w * 5`; the strip is 400x2000 units per slice, and any other ratio distorts the whole scene. The floor and ceiling caps cover the pitch range instead.
- **Cap tiles** (`band.row < 0`) carry no image. `paintCap()` gives them a latitude ramp
  that starts on the strip's own sampled edge colour — `SKY_EDGE`/`SEA_EDGE`, measured off
  the rendered `pano.svg`'s first and last row — so the seam is continuous, plus, overhead,
  cloud masses laid out across the full 360° and sliced per tile the way the panorama is.
  If `gen_pano.py` changes the sky or sea gradient, re-sample those two constants.
- **Targets are billboards.** `placeTargets()` undoes the ring's rotation after the
  translate, so a contact is always square to the screen. That swings the wide readout
  label back toward the sphere, so they stand `STANDOFF` px forward of the surface (capped
  at `R * 0.22`) with a compensating `scale()`; drop the standoff and the panorama paints
  over the label.
