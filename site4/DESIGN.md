# site4 BUNNYS: agent contract

**Read the full spec first:** `docs/2026-09-24-bunnys-cockpit-design.md`. This page is only the short list of names every file must agree on. The plan and progress are in `docs/plan.md`.

## Rules
- The suit is the original RX-124 TR-6 [WOUNDWORT], the owner's own design, callsign "BUNNyS". No Gundam logos, names or official suits, and no franchise terms ("Minovsky", "Newtype") — **in the artwork**. Every SVG stays original and `tests/svg.test.js` enforces it.
- **One deliberate exception.** The hostile contact at bearing 180 is identified in the HUD by its real designation, and its spec and armament text is the owner's own, supplied verbatim. That is their decision for their own site, taken after the trademark position was put to them. It lives only in `HX_DATA` in `js/hud.js`; do not let it spread into the artwork or the site's own unit.
- No orange-and-black hazard stripes. Cautions are amber text or outline chevrons.
- Use only the content in spec section 9. Plain static site: no build, no dependencies, relative paths.
- JS is `'use strict'` IIFEs; the only global is `window.BUNNYS`.

## Tokens
`--night #060A12`, `--indigo #0E1830`, `--teal #1F4E5F`, `--sodium #FF9A3D` (scene only), `--hud #8CFFC1`, `--amber #FFB02E`, `--lock #FF3347`, `--ice #DDE7EE`, `--panel rgba(6,10,18,.97)` (every housing's opaque backing plate, shared with hud.js's housing()).
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
`window.BUNNYS = { state:{yaw,pitch,booted,dragging}, reduce, fine, on(type, fn), emit(type, detail) }`. Event names are prefixed `bunnys:`. `dragging` is cross-file: cockpit.js sets it while a drag is live, hud.js reads it to widen the pitch ladder's roll spring (see "Flight instruments" below).

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
share the same plate style (rx 3) as everything else.

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
