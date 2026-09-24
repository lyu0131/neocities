# Site4 "ARGUS" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. **Resuming?** Find the first unticked box, check the files on disk (an earlier session may have partly done that task), and continue. Tick boxes and commit and push after every task.

**Goal:** Build site4, an original mobile-suit cockpit HUD site for Sylas Lyu:
- a boot sequence that opens a 360° all-around cockpit hub with lock-on targets;
- three separate content pages (pilot, missions, hangar).

**Architecture:**
- **Hub layers:** a CSS-3D cylinder of 24 SVG-backed slices for the panorama, a fixed SVG cockpit frame, an SVG HUD overlay driven by a small view-state engine, and a canvas effects layer.
- **Files:** each concern lives in its own file and talks through `document` custom events (`argus:view`, `argus:boot-done`, `argus:lock`), so agents can build them in parallel against one DOM skeleton.
- **Art:** all AI-drawn SVG from agents.

**Tech stack:** static HTML, CSS and vanilla JS (no build, no dependencies), plus Google Fonts B612 and B612 Mono. Tests use Node 22 and headless Chrome via CDP, with no npm packages.

**Spec:** `site4/docs/2026-09-24-argus-cockpit-design.md`. Read it before any task; it holds every colour, timing and size.

**Repo:** `github.com/lyu0131/neocities` (private), branch `main`. Every task ends with a commit and a push, so cloud sessions stay in sync.

## Context
The user asked for a site4 with an entirely new design logic: a sleek Gundam style that became a cockpit HUD inspired by fighter jets and the panoramic cockpit in *Hathaway*. It must be interactive, with a strong boot sequence. The user asked for three things in order:
1. plan each agent and subagent with superpowers;
2. use AI to generate the graphics;
3. build the site.

The work must carry on after their credits reset, so the plan lives in the repo and cloud sessions can resume it from `CLAUDE.md`. Brainstorming locked in these decisions:
- AI-drawn vector graphics, since Canva was unavailable;
- the real portfolio content only;
- the cockpit HUD look;
- a 360° hub with separate pages;
- CSS 3D plus SVG, with no libraries.

## Global constraints (from the spec; every task includes these)
- **Original IP only:** no "Gundam" wordmark, logos, official suits or franchise terms ("Minovsky", "Newtype"). The suit is SL-01 "ARGUS".
- **No orange-and-black hazard stripes.** Cautions use amber text or outline chevrons.
- **Content:** only the facts in spec section 9. No invented facts, and no grades, location or email.
- **Tokens:**
  - colours: `--night #060A12`, `--indigo #0E1830`, `--teal #1F4E5F`, `--sodium #FF9A3D` (scene only), `--hud #8CFFC1`, `--amber #FFB02E`, `--lock #FF3347`, `--ice #DDE7EE`;
  - panel background: `--panel rgba(6,10,18,.72)`.
- **Fonts:** B612 400/700 and B612 Mono 400/700, via the one Google Fonts link in spec section 3.
- **Budgets:**
  - the hub is under 1.5MB total;
  - `pano.svg` is 350KB or less, and every other SVG is 120KB or less;
  - canvas pixel ratio is capped at 1.5;
  - loops pause when the tab is hidden.
- **Accessibility:** text contrast of at least 4.5:1, visible focus, full keyboard use, and `prefers-reduced-motion` gives instant static states. Canvases are `aria-hidden`, touch targets are at least 44px, and `lang="en"` is set.
- **Test widths:** 375, 768, 1024, 1366×600, 1440×900 and 1920×1080, with no horizontal scroll at 375px.
- **Code style:** plain `'use strict'` IIFEs with no globals except `window.ARGUS` (defined in Task 0). Short comments per feature, no commented-out code.

## File map
```
site4/
  index.html  pilot.html  missions.html  hangar.html
  DESIGN.md                      short agent contract (Task 0)
  css/cockpit.css                all styles (Task 5; pages append a section in Task 8)
  js/argus.js                    shared state + event helpers (Task 0)
  js/cockpit.js                  360 engine: view state, input, cylinder, targets, lock-on (Task 5)
  js/hud.js                      HUD tapes/ladder/FPM/side bars/status (Task 5)
  js/boot.js                     boot timeline (Task 6)
  js/fx.js                       canvas rain / beam flashes / flicker (Task 6)
  img/pano.svg                   (Task 1)
  img/frame.svg  img/hud.svg     (Task 2)
  img/ms/sl01-front.svg  sl01-side.svg  sl01-back.svg  decals.svg   (Task 3)
  tests/cdp.js                   headless-Chrome helper (Task 0)
  tests/svg.test.js              art budgets/ids/seam (Task 0; run by Tasks 1–3)
  tests/hub.test.js              hub behaviour (Task 0; run by Tasks 5–7)
  tests/pages.test.js            sub-pages + screenshots (Task 0; run by Tasks 8–9)
  tests/run.js                   runs all tests
  docs/2026-09-24-argus-cockpit-design.md   docs/plan.md (this file)
```

## Agent roster and waves
| wave | task | agent (`subagent_type`) | writes | parallel with |
|---|---|---|---|---|
| 0 | T0 scaffold, contract, tests | coordinator (main session) | DESIGN.md, index.html skeleton, js/argus.js, tests/* | nothing |
| 1 | T1 panorama art | `general-purpose` + skill `example-skills:algorithmic-art` for technique only | img/pano.svg | T2, T3 |
| 1 | T2 cockpit frame + HUD sprite | `ui-designer` | img/frame.svg, img/hud.svg | T1, T3 |
| 1 | T3 SL-01 mobile suit + decals | `general-purpose` | img/ms/* | T1, T2 |
| 1 | T4 wave-1 review | coordinator | fixes, screenshots | nothing |
| 2 | T5 engine + HUD + styles | `javascript-pro` for cockpit.js and hud.js, and `ui-designer` for cockpit.css, both run in parallel against the Task 0 skeleton | js/cockpit.js, js/hud.js, css/cockpit.css | T6 |
| 2 | T6 boot + fx | `javascript-pro` | js/boot.js, js/fx.js | T5 |
| 2 | T7 hub integration review | coordinator | fixes | nothing |
| 3 | T8 sub-pages | `frontend-developer` | pilot/missions/hangar.html + CSS section | nothing |
| 4 | T9 QA: accessibility, performance, visual | `accessibility-tester` (read-only audit) plus the coordinator for fixes | fixes | nothing |
| 4 | T10 ship | coordinator | CLAUDE.md, memory, push | nothing |

**Dispatch rules** (from superpowers:dispatching-parallel-agents and subagent-driven-development):
- Agents in the same wave run in the background and only touch the files listed for them.
- Each prompt includes: the spec path, this plan's task text, the Global constraints, the DESIGN.md path, the exact test command to run, and "don't create files outside your list".
- Between tasks, the coordinator checks each report against its task's checks: runs the tests and looks at the screenshots.
- The coordinator loads `frontend-design` and `ui-ux-pro-max` before T4, T7 and T9 (the user's preference).
- **In the cloud:** if a named agent type doesn't exist, use `general-purpose`. If Chrome isn't at the Windows path, `tests/cdp.js` finds `chromium`/`google-chrome` on PATH, or `CHROME=/path`.

---

### Task 0: Scaffold, contract and test harness (coordinator)
**Files:**
- Create: `site4/DESIGN.md`, `site4/index.html`, `site4/js/argus.js`, `site4/tests/{cdp.js,svg.test.js,hub.test.js,pages.test.js,run.js}`, `site4/docs/plan.md`.

**Produces:**
- the DOM ids and classes below;
- `window.ARGUS` = `{ state:{yaw,pitch,booted}, on(type, fn), emit(type, detail), reduce:Boolean, fine:Boolean }`;
- events:
  - `argus:view` `{yaw, pitch, vx, vy}`
  - `argus:boot-done` `{}`
  - `argus:lock` `{id|null, label, readout}`
  - `argus:fire` `{id, href}`
- the test commands.

- [x] **Step 1: Copy this plan to `site4/docs/plan.md`** and write `site4/DESIGN.md`. DESIGN.md is a one-page summary of the tokens, the class and id list below, the event list above, and the rule "read the spec first".
- [x] **Step 2: Write `js/argus.js`:**
```js
/* argus.js: shared state and a tiny event bus for the ARGUS cockpit */
(function () {
  'use strict';
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  window.ARGUS = {
    state: { yaw: 0, pitch: 0, booted: false },
    reduce: mq('(prefers-reduced-motion: reduce)'),
    fine: mq('(pointer: fine)'),
    on: function (type, fn) { document.addEventListener('argus:' + type, function (e) { fn(e.detail || {}); }); },
    emit: function (type, detail) { document.dispatchEvent(new CustomEvent('argus:' + type, { detail: detail || {} })); }
  };
})();
```
- [x] **Step 3: Write the `index.html` skeleton.** This is the integration contract for every later task:
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ARGUS, Sylas Lyu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/cockpit.css">
</head>
<body class="hub">
<main id="cockpit" aria-label="Cockpit">
  <div id="pano" aria-hidden="true">
    <div class="pano-ring">
      <!-- 24 .pano-slice elements are generated by cockpit.js -->
      <div class="target" id="t-pilot" data-yaw="-52" data-href="pilot.html" data-label="PILOT" data-readout="ID SYLAS LYU / RNG 0.4 KM"></div>
      <div class="target" id="t-missions" data-yaw="0" data-href="missions.html" data-label="MISSIONS" data-readout="2 ACTIVE / RNG 1.2 KM"></div>
      <div class="target" id="t-hangar" data-yaw="52" data-href="hangar.html" data-label="HANGAR" data-readout="SL-01 ARGUS / RNG 0.1 KM"></div>
      <div class="target" id="t-unknown" data-yaw="180" data-label="UNKNOWN" data-readout="UNIDENTIFIED MS / NO IFF"></div>
    </div>
  </div>
  <canvas id="fx" aria-hidden="true"></canvas>
  <img id="frame" src="img/frame.svg" alt="" width="1920" height="1080">
  <svg id="hud" aria-hidden="true"></svg>
  <nav id="targets-nav" aria-label="Cockpit targets">
    <ul>
      <li><a href="pilot.html" data-target="t-pilot">Pilot: Sylas Lyu</a></li>
      <li><a href="missions.html" data-target="t-missions">Missions: research</a></li>
      <li><a href="hangar.html" data-target="t-hangar">Hangar: SL-01 ARGUS</a></li>
    </ul>
  </nav>
  <p id="lock-status" class="sr-only" aria-live="polite"></p>
  <button id="tilt" class="hud-btn" type="button" hidden>Enable tilt</button>
</main>
<div id="boot" role="presentation">
  <pre id="boot-log" aria-hidden="true"></pre>
  <button id="skip" class="hud-btn" type="button">Skip boot</button>
</div>
<script src="js/argus.js" defer></script>
<script src="js/hud.js" defer></script>
<script src="js/cockpit.js" defer></script>
<script src="js/fx.js" defer></script>
<script src="js/boot.js" defer></script>
</body>
</html>
```
- [x] **Step 4: Write `tests/cdp.js`.** It's a general version of the helpers that worked in site2 (`shot.js`, `interact.js`):
```js
// Minimal headless-Chrome driver over CDP (Node 22 has fetch + WebSocket built in). No npm deps.
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const win = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  for (const p of win) if (fs.existsSync(p)) return p;
  for (const b of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'])
    try { return execSync('command -v ' + b, { shell: '/bin/sh' }).toString().trim(); } catch {}
  throw new Error('No Chrome found; set CHROME=/path/to/chrome');
}
const SITE = path.resolve(__dirname, '..');
const url = p => 'file://' + (process.platform === 'win32' ? '/' : '') + path.join(SITE, p).replace(/\\/g, '/');
async function launch({ width = 1440, height = 900, reduce = false } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-'));
  const proc = spawn(chromePath(), ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let list; for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = {}; const errors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise(r => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  const page = {
    errors, sleep, send,
    size: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }),
    goto: async (p, wait = 1500) => { await send('Page.navigate', { url: url(p) }); await sleep(wait); },
    eval: async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value,
    mouse: (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 }),
    key: async (key, code, vk) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk }); },
    shot: async (file, full = true) => { const m = JSON.parse(await page.eval('JSON.stringify([innerWidth, document.documentElement.scrollHeight])'));
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, clip: full ? { x: 0, y: 0, width: m[0], height: Math.min(m[1], 9000), scale: 1 } : undefined });
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(s.data, 'base64')); },
    close: () => { ws.close(); proc.kill(); }
  };
  await page.size(width, height);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
  return page;
}
function check(name, ok, info = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) process.exitCode = 1; }
module.exports = { launch, check, SITE, url };
```
- [x] **Step 5: Write `tests/svg.test.js`.** It checks files exist, viewBox, size budgets, required ids, and renders a panorama seam crop to `tests/out/pano-seam.png`:
```js
const fs = require('fs'), path = require('path');
const { launch, check, SITE } = require('./cdp');
const only = process.argv[2]; // optional: pano | frame | hud | ms
const specs = {
  pano:  [['img/pano.svg', '0 0 9600 2000', 350, []]],
  frame: [['img/frame.svg', '0 0 1920 1080', 120, []]],
  hud:   [['img/hud.svg', null, 120, ['boresight','fpm','td-corner','rear-chevron','lock-diamond','emblem-pilot','emblem-missions','emblem-hangar','emblem-unknown']]],
  ms:    [['img/ms/sl01-front.svg', '0 0 800 1400', 120, ['head','chest','binder-l','binder-r','leg-l','leg-r']],
          ['img/ms/sl01-side.svg', '0 0 800 1400', 120, ['head','chest','backpack','rifle']],
          ['img/ms/sl01-back.svg', '0 0 800 1400', 120, ['head','backpack','binder-l','binder-r']],
          ['img/ms/decals.svg', null, 120, ['unit-mark','serial','caution-chevron','no-step']]]
};
(async () => {
  for (const [group, files] of Object.entries(specs)) {
    if (only && only !== group) continue;
    for (const [f, vb, kb, ids] of files) {
      const p = path.join(SITE, f); const exists = fs.existsSync(p);
      check(`${f} exists`, exists); if (!exists) continue;
      const s = fs.readFileSync(p, 'utf8'); const size = fs.statSync(p).size / 1024;
      check(`${f} <= ${kb}KB`, size <= kb, size.toFixed(0) + 'KB');
      if (vb) check(`${f} viewBox`, s.includes(`viewBox="${vb}"`));
      for (const id of ids) check(`${f} has #${id}`, new RegExp(`id="${id}"`).test(s));
      check(`${f} no Gundam/Minovsky text`, !/gundam|minovsky|newtype/i.test(s));
    }
  }
  if (!only || only === 'pano') {  // seam render: the wrap from x=9200..9600 then 0..400 must look continuous
    const page = await launch({ width: 800, height: 400 });
    const html = `<body style="margin:0;display:flex;background:#000">`
      + `<div style="width:400px;height:400px;background:url(${'file:///' + path.join(SITE,'img/pano.svg').replace(/\\/g,'/')}) -9200px 0/9600px 2000px"></div>`
      + `<div style="width:400px;height:400px;background:url(${'file:///' + path.join(SITE,'img/pano.svg').replace(/\\/g,'/')}) 0 0/9600px 2000px"></div></body>`;
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out/seam.html'), html);
    await page.goto('tests/out/seam.html', 1200);
    await page.shot(path.join(__dirname, 'out/pano-seam.png'), false);
    page.close(); console.log('seam render: tests/out/pano-seam.png (look at it)');
  }
})();
```
- [x] **Step 6: Write `tests/hub.test.js`.** Each block is an acceptance check for a later task:
```js
const { launch, check } = require('./cdp');
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('index.html', 800);
  // T6: boot runs, finishes and can be skipped
  check('boot overlay present', await p.eval("!!document.getElementById('boot')"));
  await p.sleep(6800);
  check('boot done fires', await p.eval('ARGUS.state.booted === true'));
  check('boot overlay gone', await p.eval("!document.getElementById('boot') || getComputedStyle(document.getElementById('boot')).display === 'none'"));
  await p.eval("sessionStorage.clear()"); await p.goto('index.html', 600);
  await p.key(' ', 'Space', 32); await p.sleep(700);
  check('skip boot works', await p.eval('ARGUS.state.booted === true'));
  // T5: 24 slices, drag turns yaw, heading tape follows, arrows turn
  check('24 pano slices', await p.eval("document.querySelectorAll('.pano-slice').length === 24"));
  const y0 = await p.eval('ARGUS.state.yaw');
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 10; k++) await p.mouse('mouseMoved', 700 - 30 * k, 450, 1); await p.mouse('mouseReleased', 400, 450);
  await p.sleep(900);
  const y1 = await p.eval('ARGUS.state.yaw');
  check('drag changes yaw', Math.abs(((y1 - y0 + 540) % 360) - 180) > 20, `${y0} -> ${y1}`);
  check('heading readout follows yaw', await p.eval("(()=>{const t=document.querySelector('#hud .hdg-readout');return !!t && Math.abs(((+t.textContent - ((ARGUS.state.yaw%360)+360)%360)+540)%360-180) < 3})()"));
  await p.key('ArrowRight', 'ArrowRight', 39); await p.sleep(900);
  check('arrow key turns', Math.abs(await p.eval('ARGUS.state.yaw') - y1) > 5);
  // T5: focus a target link, view faces it, lock readout shows, Enter navigates
  await p.eval("document.querySelector('#targets-nav a[data-target=t-hangar]').focus()"); await p.sleep(1200);
  check('focus turns to hangar', Math.abs(((await p.eval('ARGUS.state.yaw') - 52 + 540) % 360) - 180) < 8);
  check('lock readout shown', /SL-01/.test(await p.eval("document.getElementById('lock-status').textContent")));
  await p.key('Enter', 'Enter', 13); await p.sleep(1500);
  check('Enter navigates to hangar', /hangar\.html$/.test(await p.eval('location.pathname')));
  // T5: unknown target locks but does not navigate
  await p.goto('index.html', 800);
  await p.eval("ARGUS.emit('face', {yaw:180})"); await p.sleep(1500);
  const u = await p.eval("(()=>{const r=document.getElementById('t-unknown').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await p.mouse('mouseMoved', u.x, u.y); await p.sleep(600);
  check('unknown locks', /UNIDENTIFIED/.test(await p.eval("document.getElementById('lock-status').textContent")));
  await p.mouse('mousePressed', u.x, u.y, 1); await p.mouse('mouseReleased', u.x, u.y); await p.sleep(900);
  check('unknown does not navigate', /index\.html$/.test(await p.eval('location.pathname')));
  check('no h-overflow', await p.eval('document.documentElement.scrollWidth <= innerWidth'));
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  await p.shot(require('path').join(__dirname, 'out/hub-1440.png'), false);
  p.close();
  // reduced motion: no boot animation, still interactive
  const r = await launch({ width: 1440, height: 900, reduce: true });
  await r.goto('index.html', 900);
  check('reduced motion: booted at once', await r.eval('ARGUS.state.booted === true'));
  await r.key('ArrowLeft', 'ArrowLeft', 37); await r.sleep(400);
  check('reduced motion: arrows still turn', Math.abs(await r.eval('ARGUS.state.yaw')) > 5);
  r.close();
})();
```
Note: this uses one extra event, `argus:face` `{yaw}`. cockpit.js turns the view to that yaw. Add it to DESIGN.md.
- [x] **Step 7: Write `tests/pages.test.js`.** For each of the three sub-pages it checks there's no overflow at the six test widths, one `h1`, a working return link, and `aria-current`. For hangar, focusing a callout adds `.is-hot` to its part in the SVG. It saves screenshots to `tests/out/`. Also write `tests/run.js`, which runs the three test files in sequence (`node tests/run.js`), and add `site4/tests/out/` to `.gitignore`.
- [x] **Step 8: Run `node site4/tests/run.js`.** Expected: every art, hub and page check FAILs (nothing is built yet), and the harness itself runs without crashing.
- [x] **Step 9: Commit and push:** `git add site4 .gitignore && git commit -m "site4: plan, contract, skeleton and test harness" && git push`

### Task 1: Panorama art, `img/pano.svg` (art agent A, wave 1)
**Files:** create `site4/img/pano.svg`.
**Produces:** a seamless 9600×2000 strip. `cockpit.js` uses it as the background for 24 slices of 400px each, 15° per slice. Yaw 0° (straight ahead, where MISSIONS sits) is at x = 0. Yaw 180° (the UNKNOWN target) is at x = 4800.
- [x] **Step 1: Run** `node site4/tests/svg.test.js pano`. Expected: FAIL (the file is missing).
- [x] **Step 2: Draw it** per spec section 8:
  - **City and sky:** a night coastal city in rain; the horizon at y≈1150; sodium-orange window grids using `<symbol>`/`<use>`; layered storm clouds in `--indigo`/`--teal`; 2–3 searchlight beams.
  - **Sea:** a dark sea with teal glints below the horizon.
  - **Enemy silhouette:** an original enemy mobile-suit silhouette at x≈4800 (behind the viewer), plus 2–3 aircraft blinker dots.
  - **Seam:** the region x 9200–9600 must continue into x 0–400.
  - **Rules:** no text, no strokes thinner than 2px (it gets scaled), 350KB or less.
- [x] **Step 3: Run the test again and look at `tests/out/pano-seam.png`.** The seam must be invisible. Also screenshot the whole strip scaled down and check the composition: strong silhouettes, city light density highest at yaw −60° to +60°, and a calm, dark region behind the targets so the HUD reads clearly.
- [x] **Step 4: Commit and push:** `git add site4/img/pano.svg && git commit -m "site4: panorama art" && git push`

### Task 2: Cockpit frame and HUD sprite (art agent B, wave 1)
**Files:** create `site4/img/frame.svg` and `site4/img/hud.svg`.
**Produces:** `frame.svg`, which is fixed and stays out of the view's way, and the `hud.svg` symbols (ids per the test). The symbols use `currentColor`, so CSS colours them `--hud` or `--lock`.
- [x] **Step 1: Run** `node site4/tests/svg.test.js frame` and `… hud`. Expected: FAIL.
- [x] **Step 2: Draw `frame.svg`** per spec section 8:
  - dome seam lines in 1px `--hud` at 40% opacity;
  - a bottom console silhouette with small glyph readouts;
  - left and right linear-seat arm rails and grip silhouettes at the bottom corners;
  - corner registration marks;
  - `--night` fills at 85–95% opacity. **The centre 70% width × 65% height must stay clear.**
- [x] **Step 3: Draw `hud.svg`** as a `<symbol>` sprite: the boresight, a flight-path marker (circle plus wings plus tail), a target-designator corner bracket, the rear chevron, a lock diamond, and four 64×64 emblems (pilot helmet, mission flag, hangar gantry, and "unknown" as a question mark in a diamond). Stroke-only, 1.5px, square caps.
- [x] **Step 4: Render a check page** that places `frame.svg` at 1440×900 and 375×740 over a mid-grey background, plus every sprite symbol at 4×. Look at it and confirm the centre stays clear and nothing smears at the edges. Rerun the tests: PASS.
- [x] **Step 5: Commit and push.**

### Task 3: SL-01 ARGUS three-view and decals (art agent C, wave 1)
**Files:** create `site4/img/ms/sl01-front.svg`, `sl01-side.svg`, `sl01-back.svg` and `decals.svg`.
**Produces:** part ids for the hangar callouts (see the test), and the same viewBox `0 0 800 1400` with feet on y = 1340 in all three views.
- [x] **Step 1: Run** `node site4/tests/svg.test.js ms`. Expected: FAIL.
- [x] **Step 2: Draw the three-view** per spec section 8:
  - an original suit: a split single blade crest (**no V-fin**), a sensor visor plus mono-eye slit, layered shoulder binders, and a backpack with two fin thrusters; a rifle in the side view;
  - `--ice` technical line art at 1.2–2.0px, panel lines, sparse `--hud` accents, a faint `--indigo` wash;
  - each part is a `<g id="…">`.
  - **Proportions must match across views:** shoulders, waist and knees at the same y in all three.
- [x] **Step 3: Draw `decals.svg` symbols:** `unit-mark` (an original emblem: an eye within a hexagon), `serial` ("SL-01" in stroke lettering, as paths, not a font), `caution-chevron` (amber outline, no stripes) and `no-step`.
- [x] **Step 4: Render all three views side by side** on `--night` at 1:1 plus a 2× crop of the head. Look at them: they should be clean, sharp and clearly a mobile suit, yet not a copy of the RX-78 silhouette. Tests PASS.
- [x] **Step 5: Commit and push.**

### Task 4: Wave-1 review (coordinator)
- [x] Load `frontend-design`, then look at every art screenshot together. Check they share one visual language: line weights, the palette, and how stylised they are. If needed, send fixes back to the agent that drew the piece (SendMessage to its id).
- [x] `node site4/tests/svg.test.js`: every check PASSes. Tick T1–T3, commit and push.

### Task 5: 360 engine, HUD and styles (wave 2, two agents in parallel)
**Files:**
- `javascript-pro` creates `site4/js/cockpit.js` and `site4/js/hud.js`;
- `ui-designer` creates `site4/css/cockpit.css`.

**Consumes:** `ARGUS` from argus.js, the Task 0 skeleton, the Task 1–3 art, the spec's sections 3 and 5, and `argus:boot-done` (input is held until it fires).
**Produces:**
- `ARGUS.state.yaw/pitch`;
- the events `argus:view`, `argus:lock` and `argus:fire`;
- a listener for `argus:face {yaw}`;
- `#hud .hdg-readout` (the heading tape's number, 000–359).

**The cylinder:** radius `R = sliceW / (2·tan(7.5°))`. Slice `i` gets `transform: rotateY(i·15deg) translateZ(-R)` and `background-position-x: -(i·sliceW)px`. The ring gets `transform: translateZ(R·k) rotateX(pitch) rotateY(-yaw)`. `sliceW` comes from the viewport height so the strip's 2000px maps to about 1.35× the viewport height. `perspective` is tuned to about 100° horizontal field of view on landscape screens and about 70° on portrait.

**Motion:** view easing is `yaw += (target − yaw)·(1 − 0.88^(dt·60))` (frame-rate independent). Inertia decays at 0.92 per frame. Idle sway follows spec section 5.2.

**Targets:** on hover or focus, lock (3-step bracket close-in, readout typed, colour `--lock`, and `argus:lock`, and set the text of `#lock-status`). Click or Enter emits `argus:fire`, plays the flash-and-zoom (280ms, skipped under reduced motion), then sets `location.href`. The unknown target never fires.

**HUD (hud.js):** it builds inline SVG inside `#hud`: the heading tape (5° ticks, labels every 15°, N/E/S/W), the pitch ladder (−10 to +10), the flight-path marker following the pointer, the boresight, SPD/ALT side bars, the status line, and rear chevrons for targets more than 60° off-centre. It listens to `argus:view` and `argus:lock`. With `body.page` (sub-pages) it builds the reduced HUD driven by scroll.

**CSS:** implement spec sections 3, 5 and 6 for the hub:
- the layer stack and z-index scale: pano 1, fx 2, frame 3, hud 4, nav 5, boot 10;
- the target boxes;
- `.hud-btn`, `.sr-only`, and `#targets-nav`, which is visually hidden until `:focus-within` and then shows as a HUD label list;
- the boot overlay styles (`#boot`, `#boot-log`, `.boot-flicker`, `.hud-draw`);
- reduced-motion rules;
- the phone layout at 375px, where targets are still reachable and the tilt button shows.

- [x] **Step 1:** `node site4/tests/hub.test.js`. The T5 checks FAIL.
- [x] **Step 2:** Dispatch both agents in parallel, with the class and event contract above. Each renders `tests/out/hub-*.png`, looks at it, and fixes problems before reporting.
- [x] **Step 3:** When both are back, rerun: the drag, arrow, focus, lock, unknown, overflow and error checks PASS. The boot checks can still fail until T6.
- [x] **Step 4: Commit and push.**

### Task 6: Boot sequence and canvas effects (wave 2, parallel with T5)
**Files:** `javascript-pro` creates `site4/js/boot.js` and `site4/js/fx.js`.
**Consumes:** `ARGUS`, `#boot`, `#boot-log`, `#skip`, `.pano-slice` (generated by cockpit.js; wait for `DOMContentLoaded` plus one frame), `#hud`, and `#frame`.

**Produces:** it sets `ARGUS.state.booted = true` and fires `argus:boot-done` at the end. It uses the `sessionStorage` key `argus-booted`, and supports skip by key, click or the button.

**boot.js:** the exact timeline in spec section 6:
- the log lines are typed out, and the reactor number counts up to 100%;
- the 24 slices flicker on in a shuffled order (add `.boot-flicker`, then remove it);
- the 360 whip is a `requestAnimationFrame` tween of `ARGUS.state.yaw` from 0 to 360 with ease-in-out, with the ring's CSS `filter: blur()` peaking mid-spin;
- the HUD draws in with `.hud-draw` (the CSS supplies the dashoffset);
- a lock ping on MISSIONS via `ARGUS.emit('face',{yaw:0})` plus the lock;
- the callsign flash;
- the overlay fades and is then removed.

With reduced motion, or the session key already set, it jumps straight to the end state.

**fx.js:**
- rain streaks and a few drops sliding on the canopy;
- a distant beam flash every 6–12s at a random yaw, visible only when that yaw is on screen;
- a faint scanline flicker;
- DPR capped at 1.5, paused when the tab is hidden, starting on `argus:boot-done`, half intensity on `body.page`, off under reduced motion (one static frame).

- [x] **Step 1:** hub.test.js: the boot checks FAIL.
- [x] **Step 2:** Dispatch. The agent records a frame sequence (screenshots at 0.3, 1.2, 2.4, 3.6, 4.8 and 6.0s) to `tests/out/boot-*.png` and reviews it.
- [x] **Step 3:** Every hub.test.js check PASSes. Commit and push.

### Task 7: Hub integration review (coordinator)
- [ ] Load `frontend-design` and `ui-ux-pro-max` (on Python 3.11 you need the patched copy of its script, see memory or CLAUDE.md). Review the boot frames and hub screenshots at every test width. Check that it's legible, that the HUD doesn't cover the targets, and that the scene reads as a night city in rain.
- [ ] **Performance:** measure frame time with the CDP `Performance` domain while turning (aim for less than 16ms per frame at 1440×900) and check the hub's total transfer size is under 1.5MB. Fix anything over. Commit and push.

### Task 8: Sub-pages (wave 3, `frontend-developer`)
**Files:** create `site4/pilot.html`, `missions.html` and `hangar.html`. Modify `site4/css/cockpit.css` by appending one `/* pages */` section.

**Consumes:** the fonts link; `argus.js`, `hud.js` and `fx.js` (with `body.page`, but not cockpit.js or boot.js); the art from Tasks 2 and 3; and the spec's sections 7 and 9 (content verbatim).

**Each page:**
- the display frame, title bar and compact nav strip (all four pages, with `aria-current`);
- "◂ RETURN TO COCKPIT" linking to `index.html`;
- one `h1`;
- the scanline-wipe entrance.

**pilot.html:** the ID card plus a COMMS block with the LinkedIn link.

**missions.html:** two mission logs that reveal one by one as they scroll into view.

**hangar.html:**
- the three-view, inlined as SVG (so the parts can be highlighted);
- callout `<button>`s that toggle `.is-hot` on the matching `#part` on hover or focus;
- the spec table, labelled "Design specs (fictional)".

- [ ] **Step 1:** `node site4/tests/pages.test.js`. Expected: FAIL.
- [ ] **Step 2:** Dispatch. The agent screenshots every page at each test width and fixes problems before reporting.
- [ ] **Step 3:** pages.test.js PASSes, and the screenshots have been reviewed by the coordinator. Commit and push.

### Task 9: QA (wave 4)
- [ ] Dispatch `accessibility-tester` (read-only) on `site4/`, covering contrast (HUD green and ice on panel), focus order, the keyboard path through the hub, `aria-live` lock status, reduced motion and touch target sizes. The coordinator fixes anything critical or major.
- [ ] Run the full `node site4/tests/run.js`: every check PASSes. Look at the final screenshot set.
- [ ] Budget script: the sizes of `site4/img/**` and the hub's total must be within the Global constraints.
- [ ] Commit and push.

### Task 10: Ship (coordinator)
- [ ] Update the repo `CLAUDE.md` (site4 is done, plus how to run the tests), `site4/DESIGN.md`, and the local memory note `site4-in-progress` (rename it to "site4 built"). Tick every box in plan.md.
- [ ] Final commit and push. Tell the user how to deploy: upload the contents of `site4/` to Neocities, except `docs/` and `tests/`.

## Verification (end to end)
- `node site4/tests/run.js` checks:
  - **art:** budgets, ids, the seam render, no franchise text;
  - **hub:** the boot finishes and can be skipped; drag, arrows and focus-to-face work; lock readouts appear; the unknown target doesn't navigate; reduced motion; no overflow; no JS errors;
  - **sub-pages:** each page at the six widths, navigation, and hangar callouts.
- The coordinator also looks at every screenshot in `site4/tests/out/`, especially the boot frame sequence and the hub at 375px and 1920px.
- The accessibility agent's report shows no critical issues left open.
