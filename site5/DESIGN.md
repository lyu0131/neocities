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
- The ball is a **display**: a point p on it shows the world in direction p from the centre. Seen from the eye, which is
  never at the centre, everything on it bends, and the bend moves as the seat sways. That is the only source of
  curvature; nothing is pre-curved.
- **AUTO**: a 32s looping dogfight. The opponent follows `KEYS` (az/el, Catmull-Rom); the suit chases it on a spring so it
  drifts inside the reticle; `EVENTS` fire shots, jinks, a dive (9.5–12.8s), a near miss and a roll.
- **MANUAL**: arrows/WASD fly it (55°/s turn, 40°/s climb); AUTO resumes 4s after the last key.
- **Head**: drag (pointer events, so mouse and finger) turns it; it drifts back 3s after letting go. On top of that it
  **leads every move** (0.3 x the turn rate, up to 24°; 0.42 x the climb rate, up to 20°) on a slightly bouncy spring,
  and the **mouse steers the gaze** (up to 9° across, 6° up and down). The HUD is painted on the ball, so this is what
  moves it on screen: climb and the whole HUD drops, as in the FPV clip when the pilot looks up. Off under reduced
  motion. `SITE5.project(ballPoint)` gives a ball point's screen position (tests use it).
- Lock: the opponent within 7° of the nose for 0.5s (released past 11°).
- `SITE5.pose` is the one per-frame snapshot both renderers read; `SITE5.renderers` are called in order.

## The picture (`js/world.js`)
One WebGL2 full-screen fragment shader: ray from the eye -> the ball -> world direction -> night sky (moon, stars, thin
high cloud), a moonlit cloud sea on a plane below that scrolls as the suit flies, the opponent's speck and thruster
glint, beams as great-circle arcs widening toward their near end. Then the ball's **panel seams**: the spherical
geodesic described below: thin light joints, as in the seat shots, with a faint shadow beside them. Rendered at
0.7–0.75 of device resolution, stepping down by 0.1 (to 0.45) while frames average over 21ms.

## The HUD (`js/hud.js`)
A 2D canvas of vectors authored on the ball and projected through the same geometry as the picture, every line
subdivided every ~1.2 deg. **The layout is measured, not composed** (owner, 2026-10-05: "you have the elements,
but you don't position them correctly"): every front position was read off the owner's front frame (ref, 1:26:32)
and turned into ball angles; the side rings come from the side frame (29:50). A test checks the anchors land
within 2.5% of where that frame has them, on a 16:9 screen in the still (reduced-motion) pose.
- **Lowered under the triangle** (owner, 2026-10-05): the rail and the cluster sit 4 deg lower than the frame has
  them, and the view rests 4 deg under the nose, so the triangle sight is in front of the eyes.
- **The pink rail**: a parallel at el -22 right round the ball (pink core over a lighter line, white tick rails),
  open in front between az +-30 where diamond caps close it, salmon chevrons at +-26 pointing in.
- **Side rings** at az +-90 and 180, centred on the rail: 34 coffin cells (radius 17) pointing in, a 3.4 deg
  crosshair circle with radial ticks, a dotted ring (26), two dot grids.
- **Element size**: everything is drawn at `SZ` = 0.75 of its measured size, in place (owner: too cluttered).
- **The tall rulers**: full circles round a point off each side (az +-90, el -10, radius 48), through the measured
  ruler path, so they bow toward the middle and curve wherever you look; their dashes slide round with the
  suit's pitch (1.6 deg of arc per degree, a long one every fifth); a coffin column round the same centre just
  outside, the whole way round, points toward the nose; a plate on each at eye level.
- **The centre**: heading ticks at el 22 that scroll with the heading (one a degree, a long one every 5) under a
  fixed caret, and the nose designator at el -10 (salmon bars, dash text, a small V). The pitch ladder, the
  centre line, the slashes, the frame dashes and the dotted lead arc were removed (owner, 2026-10-05).
- **The cluster** under the nose, scaled by `SZ` about its centre (el -30), from the frame's (el -24 .. -36): V, dash text, caret, salmon caret, a salmon triangle plate;
  badges at +-10, arrow plates at +-18 pointing out, tab plates at +-8, dot grids at +-24.
- **World-fixed**: the contacts as doubled W marks (UNKNOWN, MS; the locked one pink with LOCK).
- **The triangle sight** (or the Y, `?look=penelope`) is always up on the nose, with the AUTO/MANUAL word; it
  brightens while a lock builds. No look switcher on screen.
- **The glow**: lit runs move along the coffin cells, each cell lighting up (a brighter face, a lit edge, a soft
  halo) and fading as the run moves on -- four runs climbing each ruler column (18 cells a second), two running
  round each side ring (14). Driven by the flight clock, so it holds still under reduced motion.
- `SITE5.parts` (`rail`, `caps`, `ringCells`, `markers`, `lockSight`, `rear`, `seat`), `SITE5.tapes`
  (`stream`: the rulers' pitch phase, `heading`), `SITE5.anchors`, `SITE5.ringSample` and `SITE5.seek(t)` are there for the tests.

## The eye and the camera
The eye sits 0.4 ball radii behind the centre (`EYE0`), as the reference camera does: from the exact centre every
great circle would look straight; from behind it, everything on the ball curves the way the inside of a dome does.
The view rests 4 deg below the nose (it was 7, as the frame is shot). The eye distance, a 78-deg width and that tilt were fitted together so the
measured layout lands on the frame (rms ~1%); the owner then asked for a wider view, so it runs at 87 deg across
(64 tall on a portrait screen) and the layout test scales the frame's positions to match.

## The panels (`js/world.js`)
92 near-equal panels: the Voronoi of a 3-frequency subdivided icosahedron (12 of them pentagons, the rest
hexagons), turned so a hexagon sits square on the nose and the pattern mirrors left to right. No per-panel tone.

## The controls (`js/seat.js`)
After the ref frames (#28, #29, #31): two armrest consoles with a raised head where the grip mounts and a strut
under it with a red lamp; an upright grip on a hinge, ribbed, a head cap with three thumb buttons and a lamp, and a
hand-guard loop round its front; a tick track and pink line along each console. Chamfered prisms in the seat frame,
facet-shaded. Only the head turning moves them; they sit just under the view and come up when looking down. No
seat back (never in the pilot's view) and no tablets (no panels). Narrow screens draw the pair closer (`KX`).

## Palette (sampled off the clips)
Lines `#AFC0EC` (mix) / `#9CB3E8` / `#BAC4F4`, white ticks `#EEF3FA`, mode word `#FFA3DC`, horizon bars `#FF4F8B` over
`#FFC6E8`, target label `#EBA89C`, hex cells `rgba(63,78,92,.2)`, waist rail `#5D7391`; sky `#05080F` to `#1B2D3A`,
clouds `#3D5266`. Type: Michroma (HUD words), B612 Mono fallback.

## Tests
`node site5/tests/cockpit.test.js` (uses `site4/tests/cdp.js`): the ball draws, the HUD draws, AUTO turns the suit and
sways the seat, keys take over and hand back, drag turns the head, the rear HUD shows, looking down shows the controls (desktop and phone), frame time, every look, reduced
motion holds still, a 375px phone fits.
