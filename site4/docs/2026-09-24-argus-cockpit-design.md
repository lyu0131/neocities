# Site4 "ARGUS": design spec

Status: approved in brainstorming on 2026-09-24. The implementation plan is `docs/plan.md`.

## 1. Goal
A new Neocities site for **Sylas Lyu**, built on a completely new design logic from sites 2 and 3: a sleek, stylish mobile-suit **cockpit HUD**.
- **Inspiration:** fighter-jet head-up displays and the panoramic all-around cockpit in *Hathaway*.
- **Must have:** it's highly interactive and opens with a spectacular boot sequence.
- **Plain static site:** HTML, CSS and vanilla JS, no build step, no frameworks, relative paths, deployable to Neocities by upload.

## 2. Hard constraints
- **Original IP only:**
  - no "Gundam" wordmark, logos, official mobile-suit designs or names;
  - the suit is the original **SL-01 "ARGUS"**;
  - avoid franchise lore terms like "Minovsky" and "Newtype"; use invented terms such as "particle interference".
- **Real content only,** from what Sylas provided (section 9). Nothing invented about them: no grades, location or email.
- **Separate pages:** a hub plus three content pages.
- **No orange-and-black hazard stripes** (the user's standing preference). Caution markings use amber text or outline chevrons, never striped tape.
- **Graphics are AI-drawn vector:** SVG authored by agents, plus optional Python-rendered textures. There's no raster image generator; Canva is disconnected.
- **Accessibility floor:**
  - text contrast of at least 4.5:1;
  - visible focus;
  - everything works by keyboard;
  - `prefers-reduced-motion` gives instant, static states;
  - canvases are `aria-hidden`;
  - `lang="en"`;
  - touch targets of at least 44px.
- **Performance:**
  - the hub's first paint is under 1.5MB total;
  - `pano.svg` is 350KB or less, and every other SVG is 120KB or less;
  - it holds 60fps on a mid laptop;
  - canvas work pauses when the tab is hidden;
  - the canvas pixel ratio is capped at 1.5.
- **No horizontal page scroll at 375px.** Test widths: 375, 768, 1024, 1366×600, 1440×900 and 1920×1080.

## 3. Visual system
| token | value | use |
|---|---|---|
| `--night` | `#060A12` | the deepest sky, and page background behind everything |
| `--indigo` | `#0E1830` | the scene's upper sky |
| `--teal` | `#1F4E5F` | clouds and sea glints in the scene |
| `--sodium` | `#FF9A3D` | city lights and warm scene highlights, in the scene only, never UI chrome |
| `--hud` | `#8CFFC1` | all HUD symbols (phosphor green) |
| `--hud-dim` | `#8CFFC1` at 45% | secondary ticks and inactive symbols |
| `--amber` | `#FFB02E` | cautions and "pending" states |
| `--lock` | `#FF3347` | lock-on, warnings, the fire cue |
| `--ice` | `#DDE7EE` | body text on panels |
| `--panel` | `rgba(6,10,18,.72)` | display panel background, with `backdrop-filter: blur(6px)` where supported |

- **Fonts:** **B612** 400/700 and **B612 Mono** 400/700. One Google Fonts link in every page head: `https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap`
- **Type scale:** readouts are 12–13px mono with 0.08em tracking. Body is 16px B612 at line-height 1.55, max 62ch. Display is B612 700 at clamp(40px, 7vw, 112px) with −0.01em tracking.
- **HUD glow:** `filter: drop-shadow(0 0 2px var(--hud)) drop-shadow(0 0 8px rgba(140,255,193,.35))`. Strokes are 1.5px, no fills on symbols, square caps.
- **Motion vocabulary:**
  - stroke draw-ins with `stroke-dashoffset`;
  - hard "snap" steps for locks, with `steps()` or a short overshoot;
  - the scan flicker is an opacity stutter;
  - ambient motion is at most rain plus sway plus an occasional beam flash.

## 4. Pages and files
```
site4/
  index.html        boot sequence + 360 cockpit hub
  pilot.html        pilot ID: intro + LinkedIn
  missions.html     mission logs: the two research roles
  hangar.html       SL-01 ARGUS three-view spec sheet (art showcase)
  css/cockpit.css   tokens, base, frame, HUD, hub, boot, sub-page display
  js/cockpit.js     360 engine: view state, input, cylinder, targets, lock-on
  js/hud.js         HUD rendering: heading tape, pitch ladder, FPM, readouts (hub + sub-pages)
  js/boot.js        boot sequence timeline (index only)
  js/fx.js          canvas: rain on canopy, beam flashes, scanline flicker
  img/pano.svg      seamless 360° scene strip
  img/frame.svg     fixed cockpit foreground (monitor seams, console, arm rails)
  img/hud.svg       <symbol> sprite of static HUD glyphs
  img/ms/sl01-front.svg, sl01-side.svg, sl01-back.svg   three-view line art
  img/ms/decals.svg <symbol> sprite: unit marks, caution stencils, serials
  docs/             this spec + plan.md (progress checklist)
  DESIGN.md         short contract summary for agents (tokens, class names, events)
```

## 5. The hub (index.html)
### 5.1 Layers, back to front (all full-viewport, `position: fixed`)
1. `#pano`: the CSS-3D cylinder. A `.pano-ring` holds **24 `.pano-slice`** elements, each 15° wide. Each slice uses `img/pano.svg` as `background-image` with `background-size: (24 × sliceWidth) auto` and an offset `background-position-x`, so the strip wraps seamlessly. The viewer sits at the cylinder's centre with `perspective` tuned for about 100° horizontal field of view on landscape screens and about 70° on portrait.
2. **Targets:** there is no separate layer. The `.target` elements are children of `.pano-ring`, placed with `rotateY(yaw) translateZ(-R + 40px)`, so they turn with the scene and sit just in front of it.
3. `canvas#fx`: rain streaks, drops on the canopy, beam flashes (`js/fx.js`).
4. `#frame`: `img/frame.svg`, fixed and not rotating, `preserveAspectRatio="xMidYMax slice"`, `pointer-events: none`.
5. `#hud`: an SVG overlay (`js/hud.js`) for the heading tape, pitch ladder, flight-path marker, boresight, side bars and the lock status line.
6. `nav#targets-nav`: the real links, visually hidden until focused (see 5.4).
7. `#boot`: the boot overlay (section 6), removed once done.

### 5.2 View state (`js/cockpit.js`)
- **State:** `yaw` in degrees (wraps 0–360) and `pitch` in degrees (clamped −12 to +12).
- **Easing:** eased toward `targetYaw`/`targetPitch` with critical damping; the ease factor is 0.12 per frame at 60fps and independent of frame rate.
- **Inputs:**
  - pointer drag: 0.25°/px horizontal, 0.12°/px vertical, with inertia on release;
  - wheel / trackpad: `deltaX` and `deltaY` both turn yaw;
  - keyboard ← → turn 15°, ↑ ↓ tilt pitch, `Home` faces forward;
  - on phones, an "Enable tilt" button asks for `DeviceOrientationEvent` permission and then maps gamma/beta.
- **Events:** each frame it dispatches `document` event `argus:view` with `{yaw, pitch}`, only when changed. It also sets CSS custom properties `--yaw` and `--pitch` on `:root`.
- **Idle sway:** after 4s without input, ±0.6° yaw / ±0.3° pitch, a slow sine. Off under reduced motion.
- **Visibility:** the loop pauses when the tab is hidden.

### 5.3 Targets
| id | yaw | label | links to | lock readout |
|---|---|---|---|---|
| `t-pilot` | −52° | PILOT | pilot.html | `ID SYLAS LYU / RNG 0.4 KM` |
| `t-missions` | 0° | MISSIONS | missions.html | `2 ACTIVE / RNG 1.2 KM` |
| `t-hangar` | +52° | HANGAR | hangar.html | `SL-01 ARGUS / RNG 0.1 KM` |
| `t-unknown` | 180° | UNKNOWN | not a link | `UNIDENTIFIED MS / NO IFF`, the easter egg behind you |

- **Appearance:** each target is a target-designator box (four corner brackets) around a small emblem, with its label and range under it.
- **Lock-on:** hovering or focusing starts it:
  - the brackets close in over 350ms in 3 steps;
  - the readout types out;
  - the colour goes from `--hud` to `--lock`;
  - the HUD status line reads `LOCK: <label>`.
- **Firing:** click or Enter fires. There's a 280ms flash-and-zoom (the ring scales toward the target with blur), then it navigates. Under reduced motion it navigates immediately.
- **Behind you:** a rear-warning chevron (amber) points toward any target that's more than 60° off-centre.

### 5.4 Accessibility of the hub
- `nav#targets-nav` holds `<ul>` links for Pilot, Missions and Hangar in that order.
- When one is focused, the view turns to face its target (the focused state shows the lock). The links themselves are visually hidden but become a visible HUD label list on focus-within.
- The visual `.target` boxes carry `aria-hidden="true"`; the nav links are the accessible path.
- Beside it: a visible "Skip boot" button during the boot, and a "Tilt" button on touch devices.

### 5.5 HUD (`js/hud.js`), used on the hub and the sub-pages
- **Heading tape (top centre):** ticks every 5°, labels every 15° (`000 015 030 …`, and N/E/S/W at the cardinals), a caret at the centre and a numeric readout box. It reflects `yaw`.
- **Pitch ladder (centre):** rungs every 5° from −10 to +10. Dashed lines below zero, with short end-ticks. It translates with `pitch` and rotates slightly with the sway roll (±1°).
- **Other symbols:**
  - the flight-path marker (a circle with wings) follows the pointer with lag, and sits centred when idle;
  - a fixed boresight cross in the centre.
- **Side bars:**
  - left is "SPD", fed by scroll velocity on sub-pages and drag velocity on the hub;
  - right is "ALT", scroll depth in metres on sub-pages and pitch on the hub.
- **Status line (bottom centre):** `ARGUS SL-01 / SYS NOMINAL`, which changes to `LOCK: …` during lock-on.
- **On sub-pages,** the HUD is a reduced set (heading tape, side bars, status line), driven by scroll instead of `argus:view`.

## 6. Boot sequence (`js/boot.js`, index only)
- **Total:** about 6.2s. Once per session (`sessionStorage` key `argus-booted`). Any key, click or "Skip" jumps to the end state.
- **Reduced motion:** skip straight to the end state with no flashes.
- **Events:** at the end it dispatches `argus:boot-done`. `cockpit.js` holds input until then, and `fx.js` starts after it.

| t (ms) | beat |
|---|---|
| 0 | Black. A 1px green cursor blinks at the lower left. |
| 300–1900 | A boot log types out in B612 Mono, one line every ~180ms: `ARGUS SL-01 // COLD START`, `LINEAR SEAT ........ LOCKED`, `REACTOR ............ 12% ▲`, `PARTICLE INTERFERENCE ... 0.2%`, `ALL-AROUND MONITOR .. INIT`, `PILOT BIOMETRIC ..... MATCH`, `CALLSIGN ............ SYLAS LYU`. The reactor percentage counts up in place to 100%. |
| 1900–3100 | The **monitor panels flicker on** one by one (24 slices light in a scattered order), each with a quick white-to-scene stutter. The frame seams glow green then settle. |
| 3100–4300 | **360 whip:** yaw spins 360° with ease-in-out and a horizontal motion-blur filter on the ring (blur peaks mid-spin), landing at yaw 0. |
| 4300–5400 | **HUD draw-in:** the tapes, ladder and boresight draw their strokes in (dashoffset), the side bars fill, and the reticle drops from 3× scale to 1× with a snap. |
| 5400–6200 | A **lock ping** on MISSIONS (the brackets close in), then the status line `ALL SYSTEMS NOMINAL`. The callsign `SYLAS LYU` flashes once in the corner. The boot overlay fades out. |

Sound is out of scope (autoplay is blocked, and the user didn't ask for it).

## 7. Sub-pages (pilot, missions, hangar)
- **Layout:** each is a "cockpit display". A dark `--panel` screen sits in a bevelled frame with corner registration marks and a screen title bar (`// PILOT DATA`, `// MISSION LOG`, `// HANGAR: SL-01`).
- **HUD:** the reduced sub-page HUD, plus `fx.js` rain at half intensity.
- **Return:** a "◂ RETURN TO COCKPIT" control goes to `index.html`, with no boot replay because the session key is set.
- **Nav:** a compact nav strip links all four pages, with `aria-current` marking the current one.
- **Entrance:** a 400ms scanline wipe down the screen with the content fading in. Instant under reduced motion.
- **pilot.html:** a pilot ID card: callsign `SYLAS LYU`, unit SL-01, role "Psychology and UX design, Purdue University". The intro paragraph and the LinkedIn link sit in a "COMMS" block.
- **missions.html:** two mission-log entries (section 9), each with a mission ID, status `ACTIVE`, dates, and short log lines. They reveal one by one as they scroll into view.
- **hangar.html:**
  - the SL-01 three-view at large size, on a blueprint-dark panel;
  - hovering or focusing a callout highlights the part it points to (callouts are real buttons, accessible);
  - a spec table beside it: height, weight and generator output. These are fictional mech specs, labelled as the design's specs, not claims about Sylas.

## 8. Graphics specs (AI-drawn SVG)
- **`img/pano.svg`:** viewBox `0 0 9600 2000`, seamless (the content at x=0 and x=9600 matches), horizon at y≈1150. Contents:
  - a night coastal city in rain, with sodium-orange window grids and streetlights;
  - a dark sea with teal glints;
  - layered storm clouds and searchlight beams;
  - a distant original enemy mobile-suit silhouette at the 180° position (x≈4800);
  - two or three far aircraft blinkers.
  - Stylised flat-vector with subtle gradients. No text. 350KB or less; use `<symbol>`/`<use>` for repeated buildings and windows.
- **`img/frame.svg`:** viewBox `0 0 1920 1080`, `preserveAspectRatio="xMidYMax slice"`. Contents:
  - curved panoramic-monitor seam lines (thin, `--hud-dim`), fitting a dome;
  - a bottom console silhouette with a few small readout glyphs;
  - left and right linear-seat arm rails and control grip silhouettes at the lower corners;
  - corner registration marks.
  - Mostly `--night` fills at 85–95% opacity, so the centre stays open.
- **`img/hud.svg`:** a `<symbol>` sprite with ids `boresight`, `fpm`, `td-corner`, `rear-chevron`, `lock-diamond`, `emblem-pilot`, `emblem-missions`, `emblem-hangar`, `emblem-unknown`. Stroke-only, using `currentColor`, square caps.
- **`img/ms/sl01-{front,side,back}.svg`:** an original mobile suit, 18m class. Heroic proportions and angular armour, but **not** a V-fin copy of the RX-78: use a split single blade crest, sensor visor plus mono-eye slit, layered shoulder binders, and a backpack with two fin thrusters.
  - Technical line art: `--ice` strokes of 1.2–2.0px, panel lines, a few `--hud` accent strokes, no fills except a faint `--indigo` wash.
  - A shared viewBox of `0 0 800 1400`, with feet on y=1340, so the three views align.
  - Parts carry ids for callouts: `head`, `chest`, `binder-l`, `binder-r`, `backpack`, `rifle` (side view), `leg-l`, `leg-r`.
- **`img/ms/decals.svg`:** symbols `unit-mark` (an original emblem), `serial` (text "SL-01"), `caution-chevron` (amber outline), `no-step`.

**How art agents verify:** render each SVG in headless Chrome, look at the screenshot, and fix any problems before reporting. For the panorama, also render the seam: a 400px crop spanning the x=9600 wrap to x=0.

## 9. Content (verbatim facts; wording can be condensed)
- **Name:** Sylas Lyu. LinkedIn: `https://www.linkedin.com/in/steven-lyu-73815525b/` (the URL legitimately says steven).
- **Intro:** Psychology and UX design at Purdue. Researches how people's everyday data can inform mental health and healthcare decisions.
- **Mission 1, UNC NIcE X Lab:** undergraduate research assistant (internship), July 2026 to now.
  - Everyday smartphone and wearable data and student mental health, using a multi-year dataset spanning four student cohorts.
  - Tested whether large language models can translate behavioural and self-report data into established mental health measures; co-wrote the paper through three rounds of review to publication.
  - Built Python tools for data quality and coverage across cohorts, and visualisations comparing groups; reviewed lab manuscripts; presented at lab meetings.
- **Mission 2, Human Betterment Analytics Research Lab (Purdue):** undergraduate research assistant, December 2025 to now. Healthcare, data science and decision systems: models that inform clinical decisions, healthcare delivery and public health policy under uncertainty.

## 10. Verification (definition of done)
- **Screenshots:** headless Chrome/Edge screenshots of every page at the section 2 test widths, with no horizontal overflow and no console errors.
- **Scripted interactions** (CDP, like the scratchpad `interact.js` / `cover-test.js`):
  - boot completes and fires `argus:boot-done`, and skip works;
  - drag changes yaw and the heading tape follows;
  - arrow keys turn;
  - Tab focus turns to face each target, and Enter navigates;
  - hovering a target shows its lock readout;
  - the `t-unknown` lock works but doesn't navigate;
  - with reduced motion: no boot animation, still interactive.
- **Checks on sub-pages and budgets:**
  - the sub-page nav and return control work;
  - the hangar callouts highlight their parts;
  - an accessibility review agent reports no critical issues;
  - the performance budgets in section 2 are met (file sizes checked with a script).
