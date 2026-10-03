# site5: ball cockpit test, the contract

A private testing place (never deployed: Cloudflare serves only `site4/`). One page, a cockpit seen from the pilot's
seat inside a spherical panoramic monitor, mixing the two cockpits of the owner's reference clips. What was taken from
the clips, and why, is in `docs/reference.md`.

## Rules
- Clean: no boxed panels, no console tablet. Only the ball, its HUD and the seat edge.
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
Voronoi of 64 Fibonacci points, a geodesic of hexagons and pentagons, with a lip and a per-panel tone. Rendered at
0.7–0.75 of device resolution, stepping down by 0.1 (to 0.45) while frames average over 21ms.

## The HUD (`js/hud.js`)
A 2D canvas of vectors authored on the ball and projected through the same geometry, every line subdivided every
~1.2°. **Ball-fixed**: the triangle reticle (with the AUTO/MANUAL word), the outer ring with its **roll scale** (ticks turning
with the bank against a fixed pink pointer), hex-cell ladders (±30°) with thin rulers (±36.5°) whose ticks **stream at
airspeed**, the white **pitch tape** (−47°, scrolling with the suit's pitch, labelled every 10°) and **altitude tape**
(+47°, a tick every 20 m, labelled every 100 m), each with a pink read-out at eye level; all of them run the ball's
whole height and fade out toward ±82° rather than stopping; the waist rail (el −15°), the heading tape (el +27°), the chevrons. **World-fixed**: the pink horizon
bars and the target marker (with its closing lock ring, and a dotted lead arc when it's off the nose).
Looks (`?look=`): `mix` (default), `xi`, `penelope`; the table at the top of hud.js says which elements each carries.
The seat edge (`#seat`, two grips) is fixed to the seat like the eye, so only the head turning moves it.

## Palette (sampled off the clips)
Lines `#AFC0EC` (mix) / `#9CB3E8` / `#BAC4F4`, white ticks `#EEF3FA`, mode word `#FFA3DC`, horizon bars `#FF4F8B` over
`#FFC6E8`, target label `#EBA89C`, hex cells `rgba(63,78,92,.2)`, waist rail `#5D7391`; sky `#05080F` to `#1B2D3A`,
clouds `#3D5266`. Type: Michroma (HUD words), B612 Mono fallback.

## Tests
`node site5/tests/cockpit.test.js` (uses `site4/tests/cdp.js`): the ball draws, the HUD draws, AUTO turns the suit and
sways the seat, keys take over and hand back, drag turns the head and the seat edge, frame time, every look, reduced
motion holds still, a 375px phone fits.
