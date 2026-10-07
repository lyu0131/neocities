# site5: ball cockpit test, the contract

A private testing place (never deployed: Cloudflare serves only `site4/`). One page, a cockpit seen from the pilot's
seat inside a spherical panoramic monitor, mixing the two cockpits of the owner's reference clips. What was taken from
the clips, and why, is in `docs/reference.md`.

## Rules
- Clean: no boxed panels, no console tablet. Only the ball, its HUD and the arm rails with their grips.
- Original drawing only: geometry and behaviour from the clips, never their names, logos or caption text (the look
  switcher's labels are the one place the two cockpits are named).
- Plain static: no build, no dependencies, relative paths. JS is `'use strict'` IIFEs; the only global is `SITE5`.
- Respect `prefers-reduced-motion`: no scripted flight, no sway, no shake; the head and the keys still work.

## The model (`js/ball.js`)
world -> **suit** (attitude quaternion) -> **ball** (unit sphere, rigid with the suit) -> **seat** (spring-hung in the
ball: thrown outward in a turn, pressed down in a pull, lagging the roll; shaken by a near miss) -> **eye** (seat + head
look; it sits at `EYE0`, a little above and behind the centre). Frames: x right, y up, z forward; degrees.
  `FLOAT` (0.75, owner 2026-10-05) scales how much the camera floats: the seat's sway and jolts, its roll and
  pitch, and the head leading the move.
- The ball is a **display**: a point p on it shows the world in direction p from the centre. Seen from the eye, which is
  never at the centre, everything on it bends, and the bend moves as the seat sways. That is the only source of
  curvature; nothing is pre-curved.
- **AUTO**: a 32s looping dogfight. The opponent follows `KEYS` (az/el, Catmull-Rom); the suit chases it on a spring so it
  drifts inside the reticle; `EVENTS` fire jinks, a dive (9.5–12.8s), a near miss and a roll (no beams: removed, owner 2026-10-06).
- **MANUAL**: arrows/WASD fly it (55°/s turn, 40°/s climb); AUTO resumes 4s after the last key.
  Fire control helps aim, as AUTO's chase does: once every key is let go with a contact within 12 deg, the nose
  eases onto it and tracks it (the one being locked, if in reach, so it won't hop round a bunched group). Held keys
  always fly at full rate; a key ramps the turn up smoothly and letting go brakes hard, so a tap stops about where
  it's let go. (Owner, 2026-10-05: no lock after WASD; then, slowing the keys near contacts made turning
  a crawl when they were bunched.)
- **Head**: drag (pointer events, so mouse and finger) turns it; it drifts back 3s after letting go. On top of that it
  **leads every move** (0.3 x the turn rate, up to 24°; 0.42 x the climb rate, up to 20°) on a slightly bouncy spring,
  and the **mouse steers the gaze** (up to 9° across, 6° up and down). The HUD is painted on the ball, so this is what
  moves it on screen: climb and the whole HUD drops, as in the FPV clip when the pilot looks up. Off under reduced
  motion. `SITE5.project(ballPoint)` gives a ball point's screen position (tests use it).
- **Targeting**: the contact (opponent or either escort) nearest the boresight, once within 4.5 deg (inside the
  sight), is held 0.5s to lock; the target is kept until it passes 7 deg or another sits 2.5 deg nearer, so the
  lock doesn't flicker. `pose.lockId` names it.
- `SITE5.pose` is the one per-frame snapshot both renderers read; `SITE5.renderers` are called in order.

## The picture (`js/world.js`)
One WebGL2 full-screen fragment shader: ray from the eye -> the ball -> world direction -> night sky (moon, stars, thin
high cloud), a moonlit cloud sea on a plane below that scrolls as the suit flies, the opponent's speck and thruster
glint and the escorts' specks. Then the ball's **panel seams**: the spherical
geodesic described below: thin light joints, as in the seat shots, with a faint shadow beside them. Rendered at
0.7–0.75 of device resolution, stepping down by 0.1 (to 0.45) while frames average over 21ms.

## The HUD (`js/hud.js`)
A 2D canvas of vectors authored on the ball and projected through the same geometry as the picture, every line
subdivided every ~1.2 deg. **The layout is measured, not composed** (owner, 2026-10-05: "you have the elements,
but you don't position them correctly"): every front position was read off the owner's front frame (ref, 1:26:32)
and turned into ball angles; the side rings come from the side frame (29:50). A test checks the anchors land
within 2.5% of where that frame has them, on a 16:9 screen in the still (reduced-motion) pose.
- **Lowered under the triangle** (owner, 2026-10-05): the rail and the cluster sit 4 deg lower than the frame has
  them, and the view rests on the nose itself, so the triangle sight is right in front of the eyes (the cluster
  at the bottom of the screen; look down a touch for all of it).
- **The pink rail**: a parallel at el -22 right round the ball (pink core over a lighter line, white tick rails),
  open in front between az +-30 where diamond caps close it, salmon chevrons at +-26 pointing in.
- **Side rings** at az +-90 and 180, centred on the rail: 34 coffin cells (radius 17) pointing in, a 3.4 deg
  crosshair circle with radial ticks, a dotted ring (26), two dot grids.
- **Element size**: everything is drawn at `SZ` = 0.75 of its measured size, in place (owner: too cluttered).
- **The tall rulers**: full circles round a point off each side (az +-90, el -10, radius 48), through the measured
  ruler path, so they bow toward the middle and curve wherever you look; their dashes slide round with the
  suit's pitch (1.6 deg of arc per degree, a long one every fifth); a coffin column round the same centre just
  outside, the whole way round, points toward the nose; a plate on each at eye level.
- **The centre**: heading ticks at el 22 across +-12 deg that scroll with the heading (one a degree, taller every 5,
  tallest every 10, fading at the ends) under a
  fixed caret, and the nose designator at el -10 (salmon bars, dash text, a small V). The pitch ladder, the
  centre line, the slashes, the frame dashes and the dotted lead arc were removed (owner, 2026-10-05).
- **The cluster** under the nose, scaled by `SZ` about its centre (el -27), from the frame's (el -24 .. -36): V, dash text, caret, salmon caret, a salmon triangle plate;
  sized up by what each holds (owner, 2026-10-05): the badges (radar, thrust vector) 3.5 at +-11.8, the bar plates 4
  at +-20.5, the turn tabs 1.9 above and below each badge, the cell grids at +-28, the centre stack about 25% up.
  Every shape reads the flight (the owner's picks of the cluster demos): the upper dash row scrolls with the turn
  and the lower is a scrolling trace that spikes with each manoeuvre; the left badge is the radar (heading-up, a
  sweep arm at site4's 3.4s with a fading trail, the view wedge, a blip per contact lit as the arm passes, the
  target's pink) and the right one the thrust vector; the turn tabs light on the turn's side, chevrons running
  out; the plates hold bars (thrust left, its verniers firing for the turns; reactor right, a row going pink in a
  dive); the cell grids blink on their own. The pitch arrows are the cluster's blue: the up arrow on top pointing
  up, the down arrow under the trace pointing down; climbing pushes the up arrow up (on a spring) with echoes peeling
  off upward and fading, diving the same downward. Only the triangle and its caret carry a state colour, always
  together: salmon, pink once locked. The triangle pulses while a lock builds; on lock a pulse runs in along the rail to the caps,
  which flash, a flash runs up the chevron stack, and the triangle stays pink while locked. Lit pieces draw at tier 1
  for that moment. Reduced motion: the radar arm parks at the top and nothing scrolls, ripples, flashes or blinks.
- **World-fixed**: the contacts as doubled W marks (UNKNOWN, MS), small (about 2 deg across for the opponent); the
  current target reads first (tier 1) and turns pink with LOCK once locked, whichever contact it is.
- **The triangle sight** (or the Y, `?look=penelope`), at about half its earlier size (`TRI` 0.55), with the
  AUTO/MANUAL word; the owner's pick "E" of the lock demos, all on springs. The big triangle rides the nose but
  sways: it lags the suit's turns and drifts a little at rest. Idle it all sits faint (15%, no halo). While a lock
  builds, the brackets and V flare open, close in (jittering, settling) and slew onto the target, brightening; on
  lock they clunk past full size, blink twice (60ms beats), then breathe and follow the target tightly, the V pink,
  and a faint outline pings out each second. When the lock breaks a copy of the brackets flies apart. Reduced
  motion: no springs, sway, jitter or pings. No look switcher on screen.
- **Cells**: flat translucent slate with a very faint gradient (lighter at the wide end, darker toward the point) and
  a soft luminous border (a faint wide halo under a fine edge). The ruler columns are spaced evenly the whole way
  round (an even count, so the stagger meets itself where the circle closes).
- **The glow**: lit runs move along the coffin cells, each cell lighting up (a brighter face, a lit edge, a soft
  halo) and fading as the run moves on -- four runs climbing each ruler column (18 cells a second), two running
  round each side ring (14). Driven by the flight clock, so it holds still under reduced motion.
- `SITE5.parts` (`rail`, `caps`, `ringCells`, `markers`, `lockSight`, `rear`, `seat`), `SITE5.tapes`
  (`stream`: the rulers' pitch phase, `heading`), `SITE5.anchors`, `SITE5.ringSample` are there for the tests.

## The eye and the camera
The eye sits 0.4 ball radii behind the centre (`EYE0`), as the reference camera does: from the exact centre every
great circle would look straight; from behind it, everything on the ball curves the way the inside of a dome does.
The view rests on the nose (it was 7 deg below, as the frame is shot). The eye distance, a 78-deg width and that tilt were fitted together so the
measured layout lands on the frame (rms ~1%); the owner then asked for a wider view, twice, so it runs at 95 deg across
(70 tall on a portrait screen) and the layout test scales the frame's positions to match.

**Hierarchy** (brightness, opacity and weight only; the colours stay): `tier(n)` before each group.
1 the triangle sight and the active target: full, the reticle bars and brackets a touch heavier, a sharp core over a
restrained halo; 2 the pink rail's core: a fainter, tighter halo; 3 rulers, rings, coffin cells, heading ticks,
escorts: crisp, no halo, 0.82 opacity; 4 plates, badges, tabs, dash text, dot grids: the finest, 0.7 (the cluster's pieces step up to tier 1 while lit). A halo is a
second wider faint stroke under the core (never a blur), capped at 4px (tier 1) / 3px (tier 2) past the core's edge,
so it never runs neighbouring shapes together. The coffin glow keeps a quieter halo than before.

Line weight follows depth: with the eye behind the centre, nearer parts of the monitor draw a little heavier
(`depthScale`: the square root of the distance ratio, held to 0.85..1.35). Long lines (the rail, rings, ruler
circles) are stroked a few segments at a time with round joins, so the weight changes smoothly with no seam.

## The panels (`js/world.js`)
92 near-equal panels: the Voronoi of a 3-frequency subdivided icosahedron (12 of them pentagons, the rest
hexagons), turned so a hexagon sits square on the nose and the pattern mirrors left to right. No per-panel tone. The seams ease off to 45% within ~20 deg of the nose,
so the aiming area reads clean.

## The seat (`js/seat.js`)
A real 3D model after the ref frames (#14, #28, #29, #31-33), WebGL2 on its own canvas (`#seat`) over the HUD: the
bucket seat (pan, quilted cushion, thigh bolsters, lumbar back and pads, wrap-round shoulder bolsters, headrest
wings), the armrest consoles (arm pad, inlaid panels, pink trim, vented head with bolts, support leg with a red lamp
strip), the hand rings (the owner's design, from their sketch: no joystick) -- modelled in Blender, in the live session
over the MCP, after the owner's references (pistons, mechanics, a HOTAS's switches). The source is
`tools/hand_ring.blend`; `tools/export_ring.py` bakes its contact shading and writes `js/ring-data.js` (the pages
open from file://). One floats, standless, over the front of each console: the forearm goes through a slim inner ring
(a soft liner inside) and the hand closes on an L handbar -- a rail from the ring's outer side through a clamp collar
and an armoured sleeve (a lit channel, cap screws), a knuckle housing at the L's corner (vents, an amber status light,
a stencilled R), then 90 deg inward into a rubber grip under three armour plates, with four flat glossy keys, one per
finger, in a recessed channel, and a domed thumb control in a ring of light on the knurled end cap. Two cables run
from the knuckle to the collar in clips. The outer track (a pink trim line round it) yaws and pitches; the inner ring
rolls inside it; the upper halves of both open together as a clamshell about one hinge on the outer side: on load
they start open and swing shut as the pilot straps in (closed at once under reduced motion). Two pistons (a red
band, a chrome rod) work between the frames: one from the track to the handbar, stroking as the ring rolls, one
across the hinge, driving the clamshell. They move with `pose.stick` (from the turn and climb rates, so AUTO moves
them too): turning rolls the ring up to 35 deg with 10 of yaw, climbing tilts it back up to 18.
The right hand's controls (targeting) are worked by the flight: the thumb holds the dome in while a lock builds, the
trigger blade under the index finger snaps in on the lock, the red pinky paddle squeezes when a lock breaks; on the
knuckle, the SEL dial clicks round a position for each new target and the toggle flicks to MANUAL when the pilot
takes over; once strapped in, the guarded ARM button's flip cover goes up, the button goes in, and the four keys
ripple through a check (under reduced motion, the cover is simply up). The left hand is the right mirrored, with its own
controls for thrust (parts tagged `side` L or R in the .blend; the left's lettering is authored mirrored so it reads
right): the whole grip is a twist throttle that winds up with how hard the suit manoeuvres (further on boost), an
amber boost lever under the index finger snaps in on a jink, a hard pull or a near miss, a ribbed thumb wheel in the
end cap runs with the turn, and on the knuckle a CRUISE / COMBAT rocker tips to COMBAT while a target is held beside
a five-segment throttle gauge (lit a segment per fifth; it sweeps up once as a check on strap-in). Re-export after editing the .blend: `blender -b site5/tools/hand_ring.blend -P site5/tools/export_ring.py`. Last, what the seat hangs on (pedestal, cross
members, hoses, the boom arm). Rounded boxes and tubes in the seat frame. Lit by the panoramic monitor itself (sky
above, moonlit cloud sea below, in world directions through the suit's attitude, so the light moves as it banks),
plus the near-miss flash. Physically based materials (roughness, metalness, roughness-aware Fresnel; a rough
surface blurs what it reflects), each with its own fine relief: stippled rubber on the grip and its boot, bead-blasted
cap, glossy buttons, brushed machined metal, woven pads, painted metal with orange peel and wear on its sharpest
corners; relief finer than a pixel fades out instead of sparkling. Contact shading (ambient occlusion, the unseen pilot's helmet and torso included) is
worked out after load in idle slices. Only the head turning moves it. The back behind the head is left open (the
pilot's body would hide it) and there are no tablets (no panels). Narrow screens draw the consoles closer (`KX`).

## Palette (sampled off the clips)
Lines `#AFC0EC` (mix) / `#9CB3E8` / `#BAC4F4`, white ticks `#EEF3FA`, mode word `#FFA3DC`, horizon bars `#FF4F8B` over
`#FFC6E8`, target label `#EBA89C`, hex cells `rgba(63,78,92,.2)`, waist rail `#5D7391`; sky `#05080F` to `#1B2D3A`,
clouds `#3D5266`. Type: Michroma (HUD words), B612 Mono fallback.

## Tests
`node site5/tests/cockpit.test.js` (uses `site4/tests/cdp.js`): the ball draws, the HUD draws, AUTO turns the suit and
sways the seat, keys take over and hand back, drag turns the head, the rear HUD shows, looking down shows the controls (desktop and phone), frame time, every look, reduced
motion holds still, a 375px phone fits.
