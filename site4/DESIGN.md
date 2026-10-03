# site4 BUNNYS: agent contract

**Read the full spec first:** `docs/2026-09-24-bunnys-cockpit-design.md`. This page is only the short list of names every file must agree on. The plan and progress are in `docs/plan.md`.

## Rules
- The suit is the RX-124 Gundam TR-6 [Woundwort] (mechanical design Kenki Fujioka, credited on the hangar), callsign "BUNNyS", with the owner as its pilot; the hangar's 3D mesh is the owner's own STL. No Gundam logos, names or official suits, and no franchise terms ("Minovsky", "Newtype") — **in the artwork** (every SVG; svg.test.js enforces it). The hangar's 3D render of the owner's STL and its supplied write-up are the owner's chosen exception. Every SVG stays original and `tests/svg.test.js` enforces it.
- **One deliberate exception (currently unused).** The hostile contact at bearing 180 used to be identified in the HUD by its real designation, with spec and armament text the owner supplied verbatim -- their decision, taken after the trademark position was put to them. It lived only in `HX_DATA` in the old `js/hud.js`, which the hub rebuild (2026-10-03) removed with every instrument panel. If it comes back, it stays confined to the HUD; never the artwork or the site's own unit.
- No orange-and-black hazard stripes. Cautions are amber text or outline chevrons.
- Use only the content in spec section 9. Plain static site: no build, no dependencies, relative paths.
- JS is `'use strict'` IIFEs; the only global is `window.BUNNYS`.

## Tokens
`--night #060A12`, `--indigo #0E1830`, `--teal #1F4E5F`, `--sodium #FF9A3D` (scene only), `--hud #8CFFC1`, `--amber #FFB02E`, `--lock #FF3347`, `--ice #DDE7EE`, `--panel rgba(6,10,18,.97)` (every housing's opaque backing plate).
The hub HUD's own: `--line #D3DAFB` (periwinkle hairlines), `--mode #FF7FB0` (the fire-control mode word), `--sight #FFC94A` (the designator yellow: chevrons, lock brackets), `--hostile #FF6B5A`, `--pano-dim rgba(5,10,26,.66)` (the city's dimming layer).
Fonts: B612 400/700 and B612 Mono 400/700 (one Google Fonts link, spec section 3).

## Hub DOM (index.html)
- `#cockpit` holds:
  - `#pano` > `.pano-ring` > the `.pano-slice` tiles (generated) plus the `.target` elements (`#t-pilot`, `#t-missions`, `#t-hangar`, `#t-unknown.is-hostile`), with `data-yaw`, `data-href` (unknown's is `unknown.html`, its open channel), `data-label`, `data-readout` (bearing / range) and `data-info` (for `#lock-status` only);
  - `svg#hud` (hud.js builds its contents), `nav#targets-nav` (links carry `data-target`), `#insignia` and `p#lock-status.sr-only[aria-live]`.
- No boot, no instrument panels, no frame, no canopy screens and no fx canvas on the hub since the rebuild (owner, 2026-10-03). `boot.js`, `dmgmap.js` and `img/frame.svg` stay in the repo, unloaded, for when the boot returns; it will need its screens and frame back.
- **The owner's emblem** (split helmet, V-fin, wreath), as two files generated from their image, not redrawn:
  `img/emblem-hud.webp` (brightness mapped onto `--hud` phosphor, faint scanlines, the glow **baked in**) and
  `img/emblem.webp` (full colour pulled toward the palette: whites to ice, the dark half to navy, yellow to amber,
  purples calmed). Four places:
  - the boot (`#boot > img.boot-emblem`): `.is-on` at boot clock 2900 (`T.emblem`), once the centre screen's lights
    are on; a 3.8s CSS flicker-on, one full coin turn (rotateY 360deg), a hold through PILOT ID -- the IFF brackets
    close on it, it is what the boot verifies (the suit silhouette is gone, owner 2026-10-02) -- and a fade on the cut
    to the bay. It replaced the blueprint drafting stage
    (owner, 2026-10-01). boot.js `decode()`s it before the clock starts.
  - the closed shutter glass above LINK (link.js, preloaded at DOMContentLoaded);
  - the hangar's `UNIT INSIGNIA` panel (`.insignia`, full colour);
  - the sub-pages' background (`.bg-emblem`, added by pagehud.js on pilot, missions and hangar): giant (80vh), HUD
    green at .22 opacity, fixed over the dimmed panorama and under `.screen`, turning like the cockpit's coin (3.4s a
    turn, two faces); still under reduced motion;
  - the cockpit's `#insignia`: a coin turning (3.4s a turn, the old radar's sweep rate; two faces), fixed in the top-right
    corner by CSS (81x64, 20 down, 24 in); none on screens under 700 wide, where the rim arc has the top; still under
    reduced motion.
  **No CSS `filter` on any emblem:** a `drop-shadow` there made the first visible frame a 38-100ms hitch at
  1440x900 (measured); that is why the glow lives in the image.
- Z-index scale: pano 1, hud 4, nav 5, link 9 (boot 10, when it returns).
- Sub-pages use `body.page`. They carry none of the cockpit HUD (no `#hud` or hud.js); see "Sub-page HUD" below.

## Shared JS (`js/bunnys.js`)
`window.BUNNYS = { state:{yaw,pitch,booted,dragging}, reduce, fine, on(type, fn), emit(type, detail) }`. Event names are prefixed `bunnys:`. `dragging` is cross-file: cockpit.js sets it while a drag is live, hud.js reads it to widen the pitch ladder's roll spring (see "Flight instruments" below).

| event | detail | emitted by | used by |
|---|---|---|---|
| `bunnys:view` | `{yaw, pitch, vx, vy}` | cockpit.js, when the view changes | hud.js, fx.js |
| `bunnys:screens-on` | `{}` | boot.js, as the cockpit hatch seals | hud.js powers the five canopy screens then, not at boot-done |
| `bunnys:boot-done` | `{}` | boot.js | cockpit.js (input on), fx.js (start), hud.js (instruments power on; screens too if the boot was skipped first) |
| `bunnys:lock` | `{id \| null, label, readout}` | cockpit.js | hud.js (status line) |
| `bunnys:face` | `{yaw}` | boot.js, tests | cockpit.js turns the view to that yaw |

- **During the boot** (`state.booted` is false), boot.js writes `BUNNYS.state.yaw` directly and cockpit.js renders from it without easing or input.
- **Session key:** `sessionStorage['bunnys-booted']`.

## Page handover (`js/link.js`, spec 5.6)
Loaded in every page's `<head>` **without** `defer` and **before the stylesheets** (after them it would wait on Google Fonts), so an arriving page is dark (`html.link-in`) from its first
paint. It sets `BUNNYS.link.go(href, lead)`, which cockpit.js calls on fire (lead 160 for the lock blink), and takes
every click on a link between the four pages.
- (The hub has had no `#screens` since 2026-10-03, so the saved polys, or `FALLBACK` for a new visitor, are what close.)
- Shutter outlines were read off hud.js's `#screens .shutter` polygons and mapped through `#screens`' viewBox into
  percentages of the viewport (the HUD scales down on small screens, so its units are neither px nor percent).
  Saved as 5 polys under `sessionStorage['bunnys-canopy']`; since they're already percentages, a sub-page closing on
  them needs no viewport-size check to stay correct, and the `<svg>` of seams reuses the same numbers directly as a
  `viewBox="0 0 100 100" preserveAspectRatio="none"` (`vector-effect: non-scaling-stroke` in cockpit.css keeps its
  stroke a constant px width despite that per-axis stretch). A page that has never measured the cockpit's own (a
  visitor landing straight on a sub-page) gets a rough canopy instead, as the same percentages of its own viewport.
- `sessionStorage['bunnys-link']` `{to, t}` is written just before leaving, read and cleared once by the next page
  (ignored after 6s or on the wrong page). An arrival adds `html.linked`, which drops the sub-page's scanline wipe
  and counts as "from inside" for boot.js even when no referrer is sent.
- A page restored from the back/forward cache with its shutters shut opens them on `pageshow`.
- Overlay `#link` at `--z-link` (9): `.link-shut` (clipped to one screen) > `.link-blade`, an `svg` of seams, `.link-label`.

## Sub-page HUD (`js/pagehud.js`)
Built at load from the page itself; nothing in the HTML. Instruments for reading, not flying:
- **Sector ladder** (left): one rung per `.screen .panel`, its label the panel's `data-sector` or else its h2/h3
  (give a long-titled panel a short `data-sector`). The rung whose panel crosses 40% of the viewport is lit
  (`.is-on`, `aria-current="location"`); a fill down the track shows progress; a rung scrolls to its panel.
- **Contact scope** (right): PIL/MIS/HGR (and a dim UNK) at their cockpit bearings (308/000/052/180), this page
  locked in amber, the others plain links (so link.js gives them the shutters). BRG/RNG/SECTOR/READ under it.
- **Status line and progress bar** along the foot, at every size.
- The side instruments show from 1200px wide; there `.screen` narrows to leave each gutter 180px.
- `<body>` is the page's scroller (html and body are 100% tall), not the window: listen with a capturing
  `scroll` listener on `document` and read `scrollTop` off whichever box actually scrolls.
- The background is the cockpit's own panorama at the page's bearing (`--pano-x` on `<body>`, see cockpit.css).

## Yaw to panorama mapping (pano.svg and cockpit.js must agree)
- `pano.svg` is 9600 units wide, so 1° is 26.667 units.
- Looking at yaw θ puts the view's centre at `x = θ × 26.667`, wrapping modulo 9600. Yaw 0 (MISSIONS, straight ahead) is centred on x = 0, which is the same as x = 9600. Yaw +52 (HANGAR) is at x ≈ 1387, yaw −52 (PILOT) at x ≈ 8213, and yaw 180 (UNKNOWN) at x = 4800.
- Positive yaw turns right. At pitch 0 the view is centred on y ≈ 1000 and shows roughly y 330–1670 on a 16:9 screen. The horizon is at y ≈ 1150.
- Targets sit around y 700–1050 in panorama space.

## Tests
`node tests/run.js` runs all of them, or run `tests/svg.test.js [pano|frame|hud|ms]`, `tests/hub.test.js`, `tests/pages.test.js` or `tests/layout.test.js` separately. `tests/layout.test.js` holds the hub HUD's vertical order (rim, heading, reticle, rail, readout) and on-screen rules at six sizes, 375 included. Screenshots go to `tests/out/`, which is git-ignored.

## Hub controls
Drag, wheel, arrow keys **and WASD** (A/D yaw, W/S pitch; held keys turn continuously),
`Home` faces forward, and 1-4 turn onto a contact. Drag is **pointer events**, so a mouse
drag and a finger swipe are one input (only the first finger steers); `#cockpit` sets `touch-action: none`
so the browser doesn't take a swipe as a pan or pinch. Phone tilt was removed (owner, 2026-10-01).
**Enter fires whatever is locked** (boresight, hover, a number key or a focused nav link), as the HUD's
lock readout says (ENTER TO OPEN; TAP TO OPEN on a touch screen). A focused control keeps its own Enter.

### Keyboard map (one map across the site; every key is shown as a `<kbd>` where it acts)
| key | cockpit | sub-pages |
|---|---|---|
| 1 2 3 4 | swing onto pilot / missions / hangar / unknown and **lock** it (held through the swing; any manual turn drops it) | lock that contact on the scope (red brackets; the status line says ENTER TO OPEN) |
| Enter | open the locked contact | open the scope lock (unknown: the cockpit, facing it, `index.html?face=t-unknown`) |
| Esc | | release a scope lock, else back to the cockpit |
| Arrows / WASD, Home | turn, face forward | hangar: arrows turn the model |
| Q / E | | the page left / right (pilot, missions, hangar: the cockpit's order), wrapping |
| J / K | | next / previous sector |
| F S R | | hangar: front / side / rear |
Owners: cockpit.js (hub), pagehud.js (sub-pages), hangar.js (model). (Space skipped the boot; it returns with boot.js.) Labels carry
`aria-keyshortcuts`; the `<kbd>` badges are hidden on touch screens (`hover: none`).
Aim magnetism pulls the reticle onto a contact within `SNAP_DEG` (14) degrees and closes
the last `SNAP_CLICK` (1.2) degrees outright so it clicks on rather than drifting in. It
waits out live input (`now - lastInputTime > 90`) so a wheel nudge or a held turn key is
never fought, and stays off entirely while dragging.

A drag that travels more than `DRAG_SLOP` (6px) swallows the `click` that follows it, in a
capture-phase listener. Target labels are links, so a drag starting and ending on one used
to navigate away mid-turn; a genuine click never travels that far, and `Enter` is untouched.

## Hub HUD (`js/hud.js`)
Modelled on the panoramic-monitor HUD of the owner's reference clip and still (2026-10-03): a monochrome hairline
overlay in `--line` over the city dimmed toward blue-black, no boxed panels. Drawn into `svg#hud` in viewport px
(the viewBox is the window) and rebuilt on resize; on a phone (under 700 wide) the reticle scales to `min(.66, W/560)`.
- **Rim**: a heavy dashed U-arc across the top, the monitor sphere's upper edge, with a thin one inside it.
- **Rulers**: two tick rulers bowed in toward the horizon, either side.
- **Triangle reticle** on the boresight: a translucent inverted triangle, heavy bars outside its sides (top and
  apex), nested corner brackets and a V, a broken ring of dashes and stems through the centre, double lines
  radiating out and hatched rows. Its **mode word** (`.mode`, `--mode`) reads MANUAL, or LOCKED while anything
  is locked; it holds 13px on screen at any reticle scale.
- **Heading** (`.hdg`) on a tick scale over the reticle, from `bunnys:view`.
- **Rail**: a full-width double line with risers, two hex clamps with yellow chevrons pointing in. Contacts out of
  the window (more than its half field of view, less 4, off the nose) are named at the rail's ends (`.edge`) with
  their bearing, and their own label is hidden (`.target.is-out`).
- **Lock readout** (`.cluster`) under the rail: LOCKED and the contact (red for UNKNOWN) over its bearing / range and
  ENTER TO OPEN (TAP TO OPEN on touch), or NO LOCK over DRAG OR 1-4 TO LOCK (SWIPE TO TURN on touch).
- **Floor arcs** under the readout.

The **contacts** are the `.target` elements in the panorama, so they turn with the scene: a short solid arrowhead
(`::before`, clip-path) pointing toward the nose, its label (`::after`, label over bearing / range) on the side
facing the centre (cockpit.js sets `.is-left`/`.is-right`), or under it on the nose. Locked: yellow brackets round
the arrow and the designator over it (SVG backgrounds); locked on the nose its label hides (the readout under the
rail says it). Sizes run off `--s`, 1.6 on phones, because the panorama draws a contact smaller than its px size.

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
