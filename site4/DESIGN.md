# site4 BUNNYS: agent contract

**Read the full spec first:** `docs/2026-09-24-bunnys-cockpit-design.md`. This page is only the short list of names every file must agree on. The plan and progress are in `docs/plan.md`.

## Rules
- The suit is the RX-124 Gundam TR-6 [Woundwort] (mechanical design Kenki Fujioka, credited on the hangar), callsign "BUNNyS", with the owner as its pilot; the hangar's 3D mesh is the owner's own STL. No Gundam logos, names or official suits, and no franchise terms ("Minovsky", "Newtype") — **in the artwork** (every SVG; svg.test.js enforces it). The hangar's 3D render of the owner's STL and its supplied write-up are the owner's chosen exception. Every SVG stays original and `tests/svg.test.js` enforces it.
- **One deliberate exception.** The hostile contact at bearing 180 is identified in the HUD by its real designation, and its spec and armament text is the owner's own, supplied verbatim. That is their decision for their own site, taken after the trademark position was put to them. It lives only in `HX_DATA` in `js/hud.js`; do not let it spread into the artwork or the site's own unit.
- No orange-and-black hazard stripes. Cautions are amber text or outline chevrons.
- Use only the content in spec section 9. Plain static site: no build, no dependencies, relative paths.
- JS is `'use strict'` IIFEs; the only global is `window.BUNNYS`.

## Tokens
`--night #060A12`, `--indigo #0E1830`, `--teal #1F4E5F`, `--sodium #FF9A3D` (scene only), `--hud #8CFFC1`, `--amber #FFB02E`, `--lock #FF3347`, `--ice #DDE7EE`, `--panel rgba(6,10,18,.97)` (every housing's opaque backing plate, shared with hud.js's housing()).
Fonts: B612 400/700 and B612 Mono 400/700 (one Google Fonts link, spec section 3).

## Hub DOM (index.html)
- `#cockpit` holds:
  - `#pano` > `.pano-ring` > the 24 `.pano-slice` elements (generated) plus the `.target` elements (`#t-pilot`, `#t-missions`, `#t-hangar`, `#t-unknown`), with `data-yaw`, `data-href` (unknown's is `unknown.html`, its open channel), `data-label` and `data-readout`;
  - `canvas#fx`, `img#frame`, `svg#hud` (hud.js builds its contents; the heading number is in `.hdg-readout`);
  - `nav#targets-nav` (links carry `data-target`) and `p#lock-status.sr-only[aria-live]`.
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
  - the cockpit's `#insignia`: a coin turning (9s a turn, two faces) in the top band's corner over the right
    column. hud.js `place()` puts it in HUD units (`zoom: var(--ui)`, like `.slew`): right edge flush with the
    column's, centred between the screen top and the band's edge (at least 8 clear of each), and stands it down where it would crowd the heading tape or the columns are down
    (phones). Hidden during the boot; still under reduced motion; in layout.test.js's no-overlap set.
  **No CSS `filter` on any emblem:** a `drop-shadow` there made the first visible frame a 38-100ms hitch at
  1440x900 (measured); that is why the glow lives in the image.
- `canvas#boot-scene` (the boot's picture: fixed, at the panorama's z-index but after `main`, so it paints over the panorama and under `#screens`, `#frame` and `#hud` -- the boot is seen through the five canopy screens the whole time) and `#boot` > `.boot-readout` (one HUD-style housing: `.boot-stage` with `.pips > i` and `.boot-stage-txt`, then `pre#boot-log`, fixed at four rows), `.boot-cap` (`.boot-title`, `.boot-note`, tone in `data-tone`), `.boot-bar > i`, `button#skip`. While `#boot` is up (and not `.boot-out`) the instruments stay hidden; the boot lands at yaw −52 (PILOT).
- Z-index scale: pano 1, fx 2, frame 3, hud 4, nav 5, link 9, boot 10.
- Sub-pages use `body.page`. They carry none of the cockpit HUD (no `#frame`, `#fx`, `#hud`, hud.js or fx.js);
  see "Sub-page HUD" below.

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
- Shutter outlines are read off hud.js's `#screens .shutter` polygons and mapped through `#screens`' viewBox into
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
`node tests/run.js` runs all of them, or run `tests/svg.test.js [pano|frame|hud|ms]`, `tests/hub.test.js`, `tests/pages.test.js` or `tests/layout.test.js` separately. `tests/layout.test.js` holds the one-edge, one-inset, no-overlap, panel-presence, one-plate and `--panel` rules. Screenshots go to `tests/out/`, which is git-ignored.

## Hub controls
Drag, wheel, arrow keys **and WASD** (A/D yaw, W/S pitch; held keys turn continuously),
`Home` faces forward, and the slew panel turns onto a contact. Drag is **pointer events**, so a mouse
drag and a finger swipe are one input (only the first finger steers); `#cockpit` sets `touch-action: none`
so the browser doesn't take a swipe as a pan or pinch. Phone tilt was removed (owner, 2026-10-01).
On a screen too narrow for it (a phone, where the HUD isn't scaled), the lock-on card scales to fit
with a 24px margin, still 20 over the deck, and its hint says TAP THE CONTACT TO OPEN.
**Enter fires whatever is locked** (boresight, hover or a focused nav link), as the dossier's "PRESS
ENTER OR CLICK TO OPEN" says. A focused control keeps its own Enter, except a SLEW button whose
contact is already locked: Enter once turns onto it, Enter again opens it.

### Keyboard map (one map across the site; every key is shown as a `<kbd>` where it acts)
| key | cockpit | sub-pages |
|---|---|---|
| Space / Enter / Esc | skip the boot (boot.js; no other key skips, so 1-4 never do) | |
| 1 2 3 4 | swing onto pilot / missions / hangar / unknown and **lock** it (held through the swing; any manual turn drops it; a SLEW click locks the same way) | lock that contact on the scope (red brackets; the status line says ENTER TO OPEN) |
| Enter | open the locked contact | open the scope lock (unknown: the cockpit, facing it, `index.html?face=t-unknown`) |
| Esc | acknowledge comms | release a scope lock, else back to the cockpit |
| Arrows / WASD, Home | turn, face forward | hangar: arrows turn the model |
| X N R C | declutter, night vis, run diag, comms | |
| Q / E | | the page left / right (pilot, missions, hangar: the cockpit's order), wrapping |
| J / K | | next / previous sector |
| F S R | | hangar: front / side / rear |
Owners: cockpit.js (hub), pagehud.js (sub-pages), hangar.js (model), boot.js (skip). Labels carry
`aria-keyshortcuts`; the `<kbd>` badges are hidden on touch screens (`hover: none`).
Aim magnetism pulls the reticle onto a contact within `SNAP_DEG` (14) degrees and closes
the last `SNAP_CLICK` (1.2) degrees outright so it clicks on rather than drifting in. It
waits out live input (`now - lastInputTime > 90`) so a wheel nudge or a held turn key is
never fought, and stays off entirely while dragging.

A drag that travels more than `DRAG_SLOP` (6px) swallows the `click` that follows it, in a
capture-phase listener. Target labels are links, so a drag starting and ending on one used
to navigate away mid-turn; a genuine click never travels that far, and `Enter` is untouched.

## Flight instruments
SPD and the pitch ladder read off a per-frame motion sampler in the hub `tick()` --
`shortestDelta` of `BUNNYS.state.yaw`/`pitch` between frames -- not the drag-only `vx`/`vy`
the `bunnys:view` event carries, so WASD and a held turn key drive them too, not just a
drag.
- **SPD**: angular speed smoothed by an exponential average (`SPD_TAU` 0.35s) into a
  saturating curve, `frac = 1 - exp(-speed/90)`. The readout (`pad3(frac * 240)`) rewrites
  at most every 200ms, not every frame.
- **Pitch ladder**: a damped spring (`LADDER_OMEGA` 12, `LADDER_ZETA` 0.55) banks roll and
  drifts dx/dy off yaw/pitch rate, so release overshoots slightly instead of snapping to a
  value. Targets: `roll = yawRate * 0.05`, capped ±7° (±13° while `BUNNYS.state.dragging`
  -- a drag banks harder than a key); `dx = -yawRate * 0.12`, capped ±16px; `dy =
  -pitchRate * 0.35`, capped ±10px. Under `BUNNYS.reduce` the spring is skipped outright:
  the ladder only tracks pitch, roll/dx/dy pinned to 0.

## Damage map (`js/dmgmap.js`, generated by `tools/gen_dmgmap.py`)
The suit is segmented into 8 zones **once in 3D**, then a turntable is baked by projecting
that already-labelled geometry at each angle. That ordering is the point: per-frame 2D
segmentation would re-derive the split every frame and could disagree with itself, so a
zone could change identity mid-rotation.

```js
window.BUNNYS_DMG = {
  w, h,                                                 // viewBox of the artwork
  zones:  [{ id, code, label }, …],                     // exactly 8, fixed order
  frames: [{ d: [ …8 path strings… ], order: [ …8 zone indices, back-to-front… ] }, …]
}
```
- Zone ids: `head, chest, body, arm-r, arm-l, leg-r, leg-l, weapon`. **Left/right is the
  suit's own**, so in a front view `arm-l` is on the viewer's right.
- `order` is per frame and must be honoured — zones overlap in projection, and without it
  an arm behind the torso paints over it.
- `body` is the deliberate fallback and carries the waist, skirts and backpack, so it
  legitimately runs to a third of the mesh. The generator's guard exists to catch a
  *collapsed* split (an early trial gave `arm-l` 0 triangles and `arm-r` 8503), not to
  police the fallback's share.
- The source mesh lives in `img/ref/` and is git-ignored; the derived trace ships.
  `tools/tracelib.py` holds the tracing helpers, shared with `trace_suit.py`.

## Cockpit layout (hub)
Two columns, set by `place()`, each centred on a **lane**: the midline of the gutter between
the screen edge and the SPD (or ALT) bar. A faint hairline runs down each lane; the panels
paint over it, so it shows only in the gaps and ties each column into one line.
- **left**, top to bottom: `REACTOR STATUS` -> `THRUSTER VECTOR` -> `ENVIRONMENT` ->
  `SENSOR ARRAY` (radar, pinned to the foot)
- **right**, top to bottom: `DIAGNOSTIC MODE` -> `COMBAT SYSTEM` -> `HUD MODE` -> `SLEW TO`
  (the last two pinned to the foot)

**One width.** Every column instrument is `PANEL_W` (248) wide: the four meter panels, the
damage map, the radar (whose housing is `RAD*2 + PAD*2` = 248 by construction) and the two
HTML button panels, which `place()` drives onto the same lane and width. When the gutter is
narrower, the whole column scales together by `colS`, so edges stay flush at every size.
Three different widths across the columns (204/194/194) is what used to make them look
misaligned, however carefully each box was positioned. At common sizes the gutter is 324px,
so a column sits 38px from both the screen edge and its bar.

**One header rhythm.** Every panel, the radar included, puts its header baseline at
`G_PAD + 11` from the housing top, its rule 9px below that with a 12px tick scale, and its
text at a `G_PAD` (14) inset. The old 9px baseline set the caps against the top edge.
Both rhythms are enforced in code, not just by convention: every box's backing plate and
corner brackets come from one `housing()` helper and every column header from one `header()`
helper, so no box can drift from the others — including the hostile contact boxes, which
share the same plate style (rx 3) as everything else. Two deliberate exceptions don't go
through `housing()`: the caution banner (hud.js ~744) is a translucent `.86` plate resized
from its own centre, not from a fixed corner; and the alarm-log rows (hud.js ~1000) are flat
row strips, not a housing box, though they share `housing()`'s `PLATE_FILL` constant.

The four meter panels share `buildPanel(spec)` but each carries its own extra instrument,
so they do not read as one panel repeated: the reactor's P-INT trace and bus lamps, the
thrusters' attitude cross, the combat panel's hardpoint cells, and the environment clock
(below). Row keys are **at most five characters** (`OUTPT`, `VRN-A`, `SENSR`) — that is
what lets a label clear its bar.

The damage map's art region is a **square** that fits the full inner width and shrinks only
if the column is too short; it is anchored to the **top** of its range. The artwork fits to
whichever axis constrains it — do not assume portrait, the mesh gets re-scaled.

`ENVIRONMENT` has no bar rows (`rows: []`); its own instrument is three fake, drifting
weather readouts (WX/WIND/PRECIP) plus one that is not fictional at all: the viewer's own
local clock, ticking even under reduced motion since it is information, not decoration.

`ENVIRONMENT` is the panel that stands down first when the left column is too short --
it sits lowest, so it reaches the radar below it before `THRUSTER VECTOR` does. If the
column is shorter still, `THRUSTER VECTOR` stands down too.

### Hostile set
`UNIT DATA` and `ARMAMENT DETECTED` sit beside the contact, not in a column, fitted to one
shared width by `hxFit(g, minW)`. Their position is **measured** from the ALT / LOCK / IFF
readouts' own box: on wide screens the pair stands to the right of the readouts; narrower,
it straddles their band (UNIT DATA above, ARMAMENT below). Either way it never covers them.
Where neither fits (below ~1400px wide) the set stands down and the dossier card takes over.

### Popups and HUD MODE
Incoming **comms** sits beside the SPD bar: centred on it (vertical centre at `cy`, via
`top: cy; transform: translateY(-50%)`, so no height guess is needed) whenever the band to
the reticle readouts or the dossier card, whichever is tighter, is wide enough; too narrow
for that and it slides up the bar instead, bottom-anchored 12px above the readouts; the
centre slot under `TARGET ID` — shared with the **status toast**, stood down (and emptied)
while a hostile set is up — is the last resort, same as the toast's own. The **status
toast** keeps its slot in the open sky right of `TARGET ID`, top-aligned with it, bounded by
the columns when the band clears the SPD/ALT captions (`POP_H` is the tallest a popup gets)
and by the bars when it does not. `popSlot()` carries a `vmode` (`'mid'`/`'bottom'`/top-
aligned) for how the anchor point is used, and a `tryOnly` flag so a caller can attempt a
second band before falling back to the centre slot, the way comms tries beside the bar, then
sliding up it, before sharing `TARGET ID`'s row. Comms arrive every 30-50s, a hostile lock
sends its own, and the lines never name the hostile unit outside `HX_DATA`.

A band beside a bar (comms sliding up the SPD bar, the toast beside `TARGET ID`) may accept
`POP_MIN_SLIDE` (120, not `POP_MIN`'s 200) as its floor: both bands already sit clear of the
pitch ladder by construction (their bound is measured off `TARGET ID`'s or the reticle
readouts' own box, well outside the ladder's rung span), so `POP_MIN`'s extra room there is
only for legibility, not to dodge an overlap, and 120 is the measured point past which a
real word starts running outside the box. The shared centre slot gets no such discount --
it is centred on the same point the ladder is, so nothing about its width keeps it clear,
only its vertical anchor does. If that anchor (normally right under the banner's own
fallback row) would land within `LADDER_SPAN` (167, the same rest+roll+sway reach the
banner's own margin above budgets for) of the ladder's rest position, comms' last-resort
placement drops below the ladder's worst-case reach instead of sharing that row.

`HUD MODE` holds four controls, each confirmed by the toast: `DECLUTTER` strips the
secondary instruments and keeps the flight HUD; `NIGHT VIS` greens the scene through two
overlay layers at `--z-fx` (a `filter` on the sphere would flatten `preserve-3d`, so it is
never used there); `RUN DIAG` sweeps every damage-map zone amber, then reports all clear;
`COMMS` replays the next transmission.

Across the foot, between the bottom-corner instruments, sits a row of six live segmented
bars (`PROP/COOL/PWR/O2/HYD/AUX`), driven from the same `tick(now)` loop. They stand down
when the span between those instruments is under 340px. `img/frame.svg` carries no art in
the bottom corners or under the foot row: the instruments occupy that space, and painted
art there only ever showed through as stray fragments.

### Rails and power-on
Each lane is a rail: `place()` puts a small bracket (two ticks, two bolt dots) in every gap between stacked
instruments (none at the column ends: the top band's edge and the console are those joints), from the same numbers
that stack the panels, so brackets never touch a
panel (held by `tests/layout.test.js`). When the cockpit opens (`boot-done`), `powerOn()` flickers each instrument
group on in turn, 60ms apart: tape, SPD/ALT, boresight, ladder, the left column top to bottom, the right column,
the foot row, the rails. The `.pw` keyframes fill backwards only, so a stood-down panel never flashes on; the status
line reads `PANORAMIC MONITOR ONLINE` for 1.6s. None of it runs under reduced motion. `img/frame.svg` carries only
canopy-scale detail (rivets and joint hashes on the top seams; no text -- the corner stencils it had were cut in half
at any aspect but 16:9): it is a fixed 1920x1080
painting cropped with `slice`, so anything that must line up with a box belongs in the HUD instead.

### Five canopy screens
The canopy is five screens, not one pane: left and right wings, the centre, a top band and the bottom console (the
status line and foot bars). They are drawn in `svg#screens`, a viewport-true layer between the panorama and the
frame. `place()` cuts them from the same numbers that place the instruments, so no seam runs through an instrument
(`tests/layout.test.js` samples every seam against every box; the hostile UNIT DATA/ARMAMENT pair is exempt, see there):
- the top band runs 14px over the columns, then slants down to its centre edge, between the heading readout and
  TARGET ID's slot;
- each wing comes in from the top band's centre corner at the old canopy's slope, runs straight down 36px right of
  the SPD/ALT bar (COMMS opens 16px past it), then angles out onto the console's lower centre edge;
- the console rises into a pod 8px over each bottom-corner instrument (radar left, HUD MODE + SLEW TO right), then
  steps down along an angled shoulder to its lower centre edge, 16px over the status line. The dossier sits 20px
  above that edge; column panels stand down rather than come within 8px of a pod. Both pods share one top line
  unless that would cost a panel on a short screen.
- the columns line up in rows: DIAGNOSTIC MODE takes REACTOR STATUS's height (its map shrinks to fit) and COMBAT
  SYSTEM stretches to THRUSTER VECTOR's, so the gaps between them run straight across the screen. The top band's
  edge and the pod edges are the columns' end joints, so the rail carries no cap there.

Every seam is one machined line: the lit 1.5px line over a faint bevel, bolt pairs at the joints, and a tick scale
along the console's centre edge. On entering the cockpit (`bunnys:screens-on` in the boot, else `boot-done`) the screens
come online together: the centre screen's lights come on with a fluorescent flicker (never static); the other four start as
green static (one noise tile drawn once, jittered up and down by CSS steps) and, in a random order each load
(`SIDE_AT`, shuffled; `data-at` on each screen), each one's lit glass slides in from outside its edge, overshoots a
touch, slots into place and flashes as it locks -- the HUD coming online. The dark shutter clears as each locks, and
the permanent seam lines take over. Each instrument's power-on flicker lands after its own screen
is online. None of the animation runs under reduced motion.

## Cautions and alarms
One scheduler, two modes, keyed off `hxOn`:
- **general** (no hostile lock): the wide banner, 9-25s cadence. `CAUTIONS` entries are
  `[text, zoneId]`, so each flashes its damage-map zone **amber**.
- **hostile**: the banner is suppressed and the 3-slot alarm log under `TARGET ID` takes
  over. `HOSTILE_ALARMS` are `[text, zoneId]`; each flashes its zone **red**, which also
  eases the damage map to front-on and holds it.

The banner has its own slot directly below `TARGET ID` and its alarm log (box top =
`hxLogBottom + 12`) — `place()` positions it there regardless of which mode is currently
showing, so it never shares ground with the hostile set. That slot needs the box (60 tall)
to clear the pitch ladder's top rung **at rest**, `hxLogBottom + 12 + 60 <= cy - 148` — 8px
past the rung's own rest position (`cy - 140`), not a margin against its full sway: a 13°
roll alone lifts that rung's end to ~cy - 157, and dy adds up to 10px more, so a swaying
ladder can still pass under the banner. That's fine — the banner paints over the ladder,
so any contact there is cosmetic, not a fit failure. Too short a screen
for that and it falls back to `TARGET ID`'s own slot (`idY - HX_PAD`) instead, which the
hostile set never occupies while the banner can fire; in that fallback the toast, and
comms' own centre fallback if it's in use, stack below the banner's bottom rather than
sharing its row, so neither can land under it.

Every mode switch must still hide the banner **and** clear the pending timer — its 4.2s
hold means it can already be on screen when a lock lands, and a general caution has no
place showing during an active one.

The part-number stencil under the banner's caption sits at `x = halfW - G_PAD` (the same
inset every other panel's stencil uses, clearing the box's own right edge — and the
corner brackets there — by 14px) and `y = 23`. Every clearance here is checked against
the **rendered** box (`getBBox()`, plus `getComputedStyle` for a stroke width), not raw
coordinates: B612 Mono's cap-height at the shared 7px stencil size eats most of a gap
that looks generous on paper, so a coordinate-only check can pass while ink still
overlaps.

`warnInner`'s top (`-24`) and the triangle's apex (`-22`) are both **pinned** — never
moved by anything — because each already sits at the minimum clearance from its own
fixed reference (`warnInner`'s top from `warnBox`'s top; the triangle's apex from
`warnInner`'s top). Lifting either just relocates the same overlap a level up, which is
what shifting them once did: `warnInner`'s own stroke ended up outside `warnBox`. Instead:
- `WARN_CAP_LIFT` (7) raises only the caption/tick/dot cluster.
- `warnInner` opens room for the stencil by shrinking from the **bottom** (its height is
  `42 - WARN_CAP_LIFT`), not by translating — its top never moves.
- `WARN_TRI_BASE` (8) sets the triangle's base, shortening it (not shifting it) so it
  still clears `warnInner`'s (independently raised) bottom.

The tests hold four rendered clearances at once: `warnInner`, including half its own
stroke, sits inside `warnBox` with ≥4px on all four sides; the stencil clears `warnInner`'s
bottom and `warnBox`'s own bottom by ≥4px and the right edge (corner brackets) by ≥14px;
the triangle and caption stay inside `warnInner` by ≥2px; and `warnBox` itself never grows
past its fixed `y -30..30` — its `xf()` placement is untouched, so the under-TARGET-ID
margin at `cy - 148` never changes either.

Alarm and caution strings are **<=34 characters**: `hxFit` never re-runs after build.

The alarm's inverse-video flash is driven by `drawAlarmFlash()` from the hub `tick()` loop,
which toggles `.is-inv` on every `.hx-alarm` every 400ms. It must stay on one clock. It was
three separate CSS animations (`rect`/`text`/`line`), and a CSS animation starts its clock
when its element is attached, so re-appending a rect left box and ink up to ~1.9s out of
phase — the alarm then sat red-on-red or dark-on-dark, unreadable exactly when it matters.
The `.is-inv` rules need `!important`: `hud.js` writes `fill` into each element's inline
style, which the animations outranked for free and a plain rule does not. Under
`BUNNYS.reduce` the class is never set, leaving the legible base state (dark box, red ink).
The damage map's zone flash is untouched — one animated property on one element cannot
drift against anything, so it keeps its `steps(1, end)` square wave.

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
