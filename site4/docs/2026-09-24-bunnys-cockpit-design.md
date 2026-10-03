# Site4 "BUNNyS": design spec

> **Hub rebuild, 2026-10-03 (owner):** the hub is now a hairline HUD after the owner's reference clip and still (triangle reticle, rim arc, rulers, rail, lock readout; contacts as arrowheads in the panorama), with no boot, instrument panels, frame, canopy screens or fx on it. Sections below that describe those are history until the boot returns; `DESIGN.md` "Hub HUD" is current.

Status: approved in brainstorming on 2026-09-24. The implementation plan is `docs/plan.md`.

## 1. Goal
A new Neocities site for **Sylas Lyu**, built on a completely new design logic from sites 2 and 3: a sleek, stylish mobile-suit **cockpit HUD**.
- **Inspiration:** fighter-jet head-up displays and the panoramic all-around cockpit in *Hathaway*.
- **Must have:** it's highly interactive and opens with a spectacular boot sequence.
- **Plain static site:** HTML, CSS and vanilla JS, no build step, no frameworks, relative paths, deployable to Neocities by upload.

## 2. Hard constraints
- **Original IP in the artwork:**
  - no "Gundam" wordmark, logos, official mobile-suit designs or names in any SVG (`tests/svg.test.js` enforces it);
  - avoid franchise lore terms like "Minovsky" and "Newtype" in the artwork; use invented terms such as "particle interference".
  - **The owner's chosen exceptions** (decided by them, 2026-09-30; do not re-raise): the suit is the **RX-124 Gundam TR-6 [Woundwort]**, an official A.O.Z design credited on the hangar to its mechanical designer Kenki Fujioka; the hangar renders it in 3D from the owner's own STL and carries the unit write-up they supplied (section 9). The hostile contact's `HX_DATA` (DESIGN.md). The SL-01 three-view is retired.
- **Real content only,** from what Sylas provided (section 9). Nothing invented about them. By their choice the pilot page shows GPA, location (Providence) and email; **never a phone number**.
- **Separate pages:** a hub plus three content pages.
- **No orange-and-black hazard stripes** (the user's standing preference). Caution markings use amber text or outline chevrons, never striped tape.
- **Graphics are AI-drawn vector:** SVG authored by agents, plus optional Python-rendered textures. There's no raster image generator; Canva is disconnected.
- **Accessibility floor:**
  - text contrast of at least 4.5:1;
  - visible focus;
  - everything works by keyboard;
  - `prefers-reduced-motion` gives instant, static states;
  - decorative canvases are `aria-hidden` (the hangar's model canvas is the one exception: `role="img"` with a label);
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
| `--lock` | `#FF3347` | lock-on, warnings, the fire blink |
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
  hangar.html       the RX-124 TR-6 [WOUNDWORT] in 3D, from the owner's own mesh
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
- **Events:** each frame it dispatches `document` event `bunnys:view` with `{yaw, pitch}`, only when changed. It also sets CSS custom properties `--yaw` and `--pitch` on `:root`.
- **Idle sway:** after 4s without input, ±0.6° yaw / ±0.3° pitch, a slow sine. Off under reduced motion.
- **Visibility:** the loop pauses when the tab is hidden.

### 5.3 Targets
| id | yaw | label | links to | lock readout |
|---|---|---|---|---|
| `t-pilot` | −52° | PILOT | pilot.html | `ID SYLAS LYU / RNG 0.4 KM` |
| `t-missions` | 0° | MISSIONS | missions.html | `2 ACTIVE / RNG 1.2 KM` |
| `t-hangar` | +52° | HANGAR | hangar.html | `SL-01 BUNNyS / RNG 0.1 KM` |
| `t-unknown` | 180° | UNKNOWN | `unknown.html` (its open channel; added 2026-10-01) | `UNIDENTIFIED MS / NO IFF`, the easter egg behind you |

- **Appearance:** each target is a target-designator box (four corner brackets) around a small emblem, with its label and range under it.
- **Lock-on:** hovering or focusing starts it:
  - the brackets close in over 350ms in 3 steps;
  - the readout types out;
  - the colour goes from `--hud` to `--lock`;
  - the HUD status line reads `LOCK: <label>`.
- **Firing:** click or Enter fires. The lock blinks `--lock`/`--hud` twice (160ms), then the canopy shutters close and it navigates (see 5.6). Under reduced motion it navigates immediately.
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
- **Status line (bottom centre):** `BUNNyS SL-01 / SYS NOMINAL`, which changes to `LOCK: …` during lock-on.
- **On sub-pages,** the HUD is a reduced set (heading tape, side bars, status line), driven by scroll instead of `bunnys:view`.

### 5.6 Page handover: canopy shutters (approved 2026-09-30, option A of the transition bench)
Every move between the four pages goes through the canopy. Leaving, the five canopy screens shutter closed in their power-on order (left, centre, right, top, console; 260ms each, 55ms apart), the seams flare and `LINK ▸ <PAGE>` with `CHANNEL OPEN` types out on the centre screen. The next page starts on that same closed glass, waits for its type (at most 700ms), holds 150ms and opens the shutters in the same order. The page load happens behind closed glass, so there is no blank frame. The cockpit opens with its own screen power-on, which is the same move. ~1.1s door to door. Under reduced motion, a plain navigation.

## 6. Boot sequence (`js/boot.js`, index only)
*Revised 2026-09-30 at the owner's request: the original splash, log and 360 whip gave way to one continuous shot combining four sequences they chose (cockpit closing, blueprint to metal, IFF handshake and catapult launch). It is seen from the pilot's seat through the cockpit's five canopy screens and frame, which stay on screen the whole time, and it lands facing PILOT instead of MISSIONS.*

- **Total:** about 9.0s once the page has loaded. Once per session (`sessionStorage` key `bunnys-booted`). Any key, click or "Skip" jumps to the end state.
- **Reduced motion:** skip straight to the end state with no flashes.
- **Events:** `bunnys:screens-on` as the hatch seals (hud.js powers the five screens then), and `bunnys:boot-done` at the end. `cockpit.js` holds input until boot-done, `fx.js` starts after it, and hud.js powers the instruments on at it.
- **Layers:** the picture is `canvas#boot-scene`, which sits over the panorama and under the screens and frame, so the whole boot plays inside the real cockpit. The camera shake and the seat's pull-back move the canvas, the screens and the frame together. The instruments stay dark until the hand-over.
- **One clock:** the canvas, the captions, the log and the bar all read a single boot clock that stalls rather than skips.

| t (ms) | stage | beat |
|---|---|---|
| 0–2300 | 01 COCKPIT | The screens are still off, so they show the cockpit as it is: dark, lit only by the hangar through the chest hatch in the centre screen. The hatch is a heavy door hinged at its sill: open, it lies flat outside like a drawbridge; it swings up shut in true perspective and lands with a small rebound and a jolt. Four locking lugs slide over its edges in turn (amber lights go green), the pressure seal traces round it from the sill, the light is gone, and the linear seat slides back into the core with a clunk. |
| 2300–4950 | 02 UNIT CHECK | The five screens power up in turn (left, centre, right, top, console): the centre screen's lights come on (no static) while the other four sit in static, then slide in and slot into place one by one in a random order. Once the centre is lit (2900) the owner's emblem flickers on in HUD phosphor, turns once right round and stays up through PILOT ID, fading on the cut to the bay (6550). Captions: `RX-124 TR-6 [WOUNDWORT]`, then `UNIT VERIFIED`. (The blueprint drafting stage and its `DESIGNED BY` caption were removed at the owner's request, 2026-10-01.) |
| 5000–6450 | 03 PILOT ID | A static glitch switches the channel. Amber IFF brackets close from the centre screen's edges onto the emblem (no suit silhouette; owner, 2026-10-02), a sweep interrogates, then everything turns green: `PILOT CONNECTED`, `SYLAS LYU` decodes in, and a ring pulses. |
| 6550–9010 | 04 LAUNCH | The screens show the catapult bay, its vanishing point in the centre screen. The rail lights race out, the bay hatch opens on the city, and the launch call reads `SYLAS LYU / LAUNCHING`. The catapult fires, the camera accelerates down the bay and through the hatch with a green bloom, and the city fills the screens. |
| 9010 | hand-over | The city is the hub's own arrival view (yaw −52, PILOT), so the canvas fades straight onto the live panorama behind the same five screens while the frame seams glow and the instruments power on. |

Sound is out of scope (autoplay is blocked, and the user didn't ask for it).

## 7. Sub-pages (pilot, missions, hangar)
- **Layout:** each is a "cockpit display". A dark `--panel` screen sits in a bevelled frame with corner registration marks and a screen title bar (`// PILOT DATA`, `// MISSION LOG`, `// HANGAR: SL-01`).
- **HUD:** the reduced sub-page HUD, plus `fx.js` rain at half intensity.
- **Return:** a "◂ RETURN TO COCKPIT" control goes to `index.html`, with no boot replay because the session key is set.
- **Nav:** a compact nav strip links all four pages, with `aria-current` marking the current one.
- **Entrance:** arriving from another page of the site, the canopy shutters open (see 5.6). Landing on it directly (a bookmark, a search result), a 400ms scanline wipe down the screen. Instant under reduced motion.
- **pilot.html:** a pilot ID card: callsign `SYLAS LYU`, unit SL-01, role "Psychology and UX design, Purdue University". The intro paragraph and the LinkedIn link sit in a "COMMS" block.
- **missions.html:** a flight-record timeline, then the five missions of section 9 under Active and Archive, each with its mission ID, dates, status tag, role, and Objective / Actions / Outcome. They reveal one by one as they scroll into view. No intro line under the title on any sub-page (the owner removed them).
- **hangar.html:**
  - the owner's own mesh in 3D on a blueprint grid (`js/hangar.js`, WebGL2; data `js/suitmesh.js` from `tools/gen_dmgmap.py`): turns on its own except under reduced motion, drag or arrow keys turn it, FRONT/SIDE/REAR swing to those views (replaced the SL-01 three-view, 2026-09-30; its 8 part callouts were removed at the owner's request, 2026-10-02);
  - a status row of true facts about the model (designer, callsign, triangle count, parts). The old fictional spec table is gone.

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
- ~~**`img/hud.svg`**~~ — **removed.** It was built but nothing ever referenced it; the HUD draws its
  own glyphs in `hud.js` and the targets draw theirs in CSS. Originally specced as a `<symbol>` sprite with ids `boresight`, `fpm`, `td-corner`, `rear-chevron`, `lock-diamond`, `emblem-pilot`, `emblem-missions`, `emblem-hangar`, `emblem-unknown`. Stroke-only, using `currentColor`, square caps.
- **`img/ms/sl01-{front,side,back}.svg`:** an original mobile suit, 18m class. Heroic proportions and angular armour, but **not** a V-fin copy of the RX-78: use a split single blade crest, sensor visor plus mono-eye slit, layered shoulder binders, and a backpack with two fin thrusters.
  - Technical line art: `--ice` strokes of 1.2–2.0px, panel lines, a few `--hud` accent strokes, no fills except a faint `--indigo` wash.
  - A shared viewBox of `0 0 800 1400`, with feet on y=1340, so the three views align.
  - Parts carry ids for callouts: `head`, `chest`, `binder-l`, `binder-r`, `backpack`, `rifle` (side view), `leg-l`, `leg-r`.
- **`img/ms/decals.svg`:** symbols `unit-mark` (an original emblem), `serial` (text "SL-01"), `caution-chevron` (amber outline), `no-step`.

**How art agents verify:** render each SVG in headless Chrome, look at the screenshot, and fix any problems before reporting. For the panorama, also render the seam: a 400px crop spanning the x=9600 wrap to x=0.

## 9. Content (verbatim facts; wording can be condensed)
Sources: the owner's resume (supplied 2026-09-30) and what they wrote for site2's Work page. Nothing else.
- **Name:** Sylas Lyu. Callsign BUNNyS. LinkedIn: `https://www.linkedin.com/in/sylas-lyu-73815525/`.
- **Contact on the site:** email `yutinglyu050131@gmail.com`, location Providence, Rhode Island, LinkedIn. Links are the words themselves (a name, the unit), never a URL or an "open the ..." label. **No phone number** (the owner took it off, 2026-09-30).
- **Intro:** Psychology and UX design junior at Purdue. Researches how people's everyday data can inform mental health and healthcare decisions.
- **Education:** Purdue University, B.S. Psychology and UX Design, 2024 to present (junior), West Lafayette, Indiana. GPA 3.9; Dean's List & Semester Honors (2 years).
- **Commendations:** Google Data Analytics Certificate; AWS Certified Cloud Practitioner; USACO Platinum (Top 50 in US); ISEF Second & Third Grant (verbatim).
- **Skills:** Python, Java, JavaScript, MySQL, HTML/CSS, Git; Pandas, NumPy, Jupyter Notebook, Power BI, Tableau, Excel; Figma, Adobe XD, Axure RP; Raspberry Pi + Arduino.
- **Leadership:** Student Senate; Robotics Captain; Varsity Captain; ACG Club Treasurer. **Involvement:** Student Government; Psychology Club; ACG Club; PUCSSA.
- **Interests:** Weightlifting; Cooking; Vinyls; Frugal travel; Sailing; Ornithology.
- **The suit:** the RX-124 Gundam TR-6 [Woundwort], mechanical design by Kenki Fujioka (credited on the hangar, with its debut). Sylas Lyu is its pilot on the site; the 3D mesh is the owner's own STL.
- **Hangar unit file:** the profile, technology, armaments, equipment, history and variants text on hangar.html is the owner's own supplied write-up of the RX-124 Gundam TR-6 [Woundwort] (2026-09-30), kept as given, with its real-world credits (designer, debut). Personal project, not published.
- **Missions** (numbered in the order they began; MSN-04 and MSN-05 are active):
  - **MSN-05, UNC NIcE X Lab:** undergraduate research assistant (internship), July 2026 to now. Everyday smartphone and wearable data and student mental health, using a multi-year dataset spanning four student cohorts. Tested whether large language models can translate behavioural and self-report data into established mental health measures; co-wrote the paper through three rounds of review to publication. Built Python tools for data quality and coverage across cohorts, and visualisations comparing groups; reviewed lab manuscripts; presented at lab meetings.
  - **MSN-04, Human Betterment Analytics Research Lab (Purdue):** undergraduate research assistant, February 2026 to now (the resume's date; site2 had said December 2025), West Lafayette. Healthcare, data science and decision systems: models that inform clinical decisions, healthcare delivery and public health policy under uncertainty. Supports research on data optimization in healthcare and clinical decision making; literature review, data processing and model implementation; documentation, reproducible code and version control.
  - **MSN-03, Brown University CNTR** (Center for Technological Responsibility, Reimagination, and Redesign): Research Assistant, March 2022 to May 2023, Providence. Responsible AI and technology policy, analysing system impact; literature reviews on bias, accessibility and fairness in technology design; research findings synthesized into structured summaries.
  - **MSN-02, Antagen Biotech:** Computational Biology Research Assistant, June 2021 to June 2022, Boston. A computational biology project applying AlphaFold for protein prediction; ran models on GPU-based systems and analysed 3D structural outputs.
  - **MSN-01, BrainCo Inc.:** Technology, Media and Telecommunications Intern, May to September 2021, Somerville, Massachusetts. Investor-facing presentation materials for live Q&A sessions; competitive analysis on market positioning and product differentiation; structured and managed a client data room.

## 10. Verification (definition of done)
- **Screenshots:** headless Chrome/Edge screenshots of every page at the section 2 test widths, with no horizontal overflow and no console errors.
- **Scripted interactions** (CDP, like the scratchpad `interact.js` / `cover-test.js`):
  - boot completes and fires `bunnys:boot-done`, and skip works;
  - drag changes yaw and the heading tape follows;
  - arrow keys turn;
  - Tab focus turns to face each target, and Enter navigates;
  - hovering a target shows its lock readout;
  - the `t-unknown` lock works, and firing it opens `unknown.html`;
  - with reduced motion: no boot animation, still interactive.
- **Checks on sub-pages and budgets:**
  - the sub-page nav and return control work;
  - the hangar draws the owner's model, with no part callouts;
  - an accessibility review agent reports no critical issues;
  - the performance budgets in section 2 are met (file sizes checked with a script).
