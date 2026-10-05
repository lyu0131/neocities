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
Voronoi of 64 Fibonacci points, a geodesic of hexagons and pentagons: thin light joints, as in the seat shots, with
a faint shadow beside them and a per-panel tone. Rendered at
0.7–0.75 of device resolution, stepping down by 0.1 (to 0.45) while frames average over 21ms.

## The HUD (`js/hud.js`)
A 2D canvas of vectors authored on the ball and projected through the same geometry, every line subdivided every
~1.2°. The detail follows the clips' key frames: long flat-topped hex cells in staggered pairs, dash rulers with no
spine, label plates with two lines of tiny unreadable "text", hex badges, arrow plates, dot grids.
- **Circles, not meridians.** The side ladders and tapes are arcs of circles centred on the boresight (`arcPt(sd,
  theta, phi)`: theta out from the nose, phi round it), as in the Xi's FPV frames. Seen from near the ball's centre a
  circle round the nose projects as a true circle; a line of constant azimuth is a great circle and projects straight,
  which is why the first ladders looked like two straight lines. `S.arcSample` lets the test check the roundness.
- **Ball-fixed, front**: the triangle reticle (with the AUTO/MANUAL word); a short **roll arc** over it (ticks turning with
  the bank against a fixed pink pointer); the heading tape (el +28.5°); hex-cell ladders (cells 36° out, the dash ruler
  just inside at 31°, as in the seat shots) whose ruler **streams at airspeed**, fading out round toward the top and
  bottom (40–66° round) so they read as ( ) brackets, with a plate each; the white **pitch tape** (left) and **altitude
  tape** (right) 47° out, scrolling round their arcs (1.6° of arc per degree of pitch, 1.8° per 20 m) and running on off
  the top and bottom of the screen, each with a pink read-out at eye level; the **plate cluster** under the sight
  (periwinkle/salmon chevrons, badges, arrow plates, tab plates, dot grids); the waist rail (el −15°).
- **Ball-fixed, rear** (the monitor is all the way round): the same ladder pair as circles round the tail, the reciprocal
  heading tape (salmon caret) and the AFT marker set at az 180.
- **World-fixed**: pink horizon bars on a white tick rail, either side of the heading **and its reciprocal**; the target
  marker with its closing lock ring (scaled with the triangle on narrow screens; labels always outside it) and a
  dotted lead arc when it's off the nose.
- **From the owner's screenshot set (`/ref`, git-ignored, 2026-10-05)**:
  - a **pitch ladder**, world-fixed: a rung pair every 5° (solid above the horizon, broken below, an end tick toward
    it) only near the current pitch, and long **hatch rows** at 0°; it banks and slides with the suit;
  - a **ring of loose radial dashes** 26.5° out, open at the top and bottom (not a solid line: the solid ring didn't fit);
  - **vertebra cells** in the ladders (wedges, narrower toward the sight, with an occasional wing cell pointing in);
  - the horizon bars end, toward the sight, in a **diamond plate** with a salmon chevron;
  - small **triangle rows** either side of the sight, a third salmon caret and a triangle plate in the cluster;
  - contact markers with **tabs** at their top corners; two escorts (`MS`) fly with the opponent; locking grows a
    **Y brace** of double bars out of the opponent's marker, pink once locked;
  - an **incoming threat** (16.5 s into the loop, 3.1 s): a hot point with a trail of **stacked chevrons**, and while
    it (or the opponent) is out of view a pink **feathered arrow** at the screen edge pointing toward it.
- Looks (`?look=`): `mix` (default), `xi`, `penelope` (its own **Y reticle**: three double bars round an '=' centre);
  the table at the top of hud.js says which elements each carries.
- `SITE5.parts` reports what drew (`rear`, `seat`, `rungs`, `hatch`, `ladderRoll`, `ringDashes`, `caps`, `brace`, `trail`,
  `edgeArrow`, `yReticle`), `SITE5.tapes` the live scales, and `SITE5.seek(t)` jumps the flight clock, for the tests.

## The controls (`js/seat.js`)
Two arm rails with control grips, fixed to the seat like the eye, built from chamfered prisms in the seat frame and
drawn in perspective with simple facet shading over the HUD: a rail with a tick track, a pink line and a lamp; a grip
on a stalk with a ribbed handle, a head block with three thumb buttons and a lamp, and a trigger. Only the head
turning moves them: at rest the grip heads just show in the lower corners; looking down shows the rails. On a narrow
(portrait) screen the pair is drawn closer together (`KX`), or the tight view would never take them in.

## Palette (sampled off the clips)
Lines `#AFC0EC` (mix) / `#9CB3E8` / `#BAC4F4`, white ticks `#EEF3FA`, mode word `#FFA3DC`, horizon bars `#FF4F8B` over
`#FFC6E8`, target label `#EBA89C`, hex cells `rgba(63,78,92,.2)`, waist rail `#5D7391`; sky `#05080F` to `#1B2D3A`,
clouds `#3D5266`. Type: Michroma (HUD words), B612 Mono fallback.

## Tests
`node site5/tests/cockpit.test.js` (uses `site4/tests/cdp.js`): the ball draws, the HUD draws, AUTO turns the suit and
sways the seat, keys take over and hand back, drag turns the head, the rear HUD shows, looking down shows the controls (desktop and phone), frame time, every look, reduced
motion holds still, a 375px phone fits.
