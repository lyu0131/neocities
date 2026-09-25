# site4 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut site4's code without changing what anyone sees or can do, and lock in the layout guarantees the owner asked for by name, so later edits can't quietly break them.

**Architecture:** Five behaviour-preserving passes, safety net first. Task 1 turns the alignment and overlap checks run by hand on 2026-09-25 into a permanent test. Tasks 2–4 remove dead files, duplicate construction code and duplicate CSS. Task 5 trims comments that narrate past bugs, and a mechanical diff proves no code moved. The biggest single cut (the unused SL-01 art files and their generator) is gated on the Woundwort hangar redraw and sits in its own section at the end.

**Tech Stack:** Plain HTML, CSS and ES5-style vanilla JS; no build step, no dependencies. Tests are Node 22 scripts that drive headless Chrome over CDP (`site4/tests/cdp.js`), run with `node tests/run.js` from `site4/`.

**Spec:** `site4/DESIGN.md` (the site's contract), plus the ponytail audit below.

## Context: the audit this plan executes

Ranked biggest cut first (net about −800 lines possible, −70KB shipped, 0 dependencies):

1. `img/ms/sl01-*.svg` + `decals.svg` (70KB) and `tools/ms-gen.js` (420 lines): no page loads them, and `hangar.html` inlines its own copy of the same art. **Gated**, see the last section.
2. History-narrating comments: 255 of `hud.js`'s 1541 lines are whole-line comments. → Task 5
3. `tests/a11y-audit.js` (224 lines): not in `run.js`, and it crashes at line 207. Six of its ten checks are already covered elsewhere. → Task 2
4. Six hand-built housings (backing plate + brackets, three of them with a hand-built header) in `hud.js`. → Task 3
5. The 8-layer bracket gradient written twice in CSS; the backing colour written nine times. → Tasks 3 and 4
6. Three single-use formatters and a dangling section header. → Task 3
7. A `.pyc` tracked despite `.gitignore`. → Task 2

Considered and rejected: splitting `hud.js` into modules. With no build step, that means more `<script>` tags and load-order coupling, for no reduction in code.

## Global Constraints

- Plain static site: HTML, CSS and vanilla ES5-style JS, no build step, relative paths only, no dependencies.
- **No orange-and-black hazard stripes** anywhere.
- The hostile unit's real name and specs stay confined to `HX_DATA` in `site4/js/hud.js`.
- Respect `prefers-reduced-motion`. Check at 375px (no horizontal scroll) and at desktop sizes with headless-Chrome screenshots before calling work done.
- **Behaviour-preserving:** every task ends with `node tests/run.js` at 0 FAIL. The only intended visual change in this plan is that the four hostile boxes gain the 3px corner radius every other housing already has (Task 3).
- `site4/img/ref/` and `site4/tests/out/` stay git-ignored, and exported transcripts stay local.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Layout invariants test

The owner's standing layout requirements: each column's instruments share one left and one right edge, every column header starts at the same inset, and no two HUD boxes overlap, whether idle or with the hostile set up. Until now these were checked by hand. This task makes them a test, and it is the safety net for every later task.

**Files:**
- Create: `site4/tests/layout.test.js`
- Modify: `site4/tests/run.js`

**Interfaces:**
- Produces: `tests/layout.test.js`, run by `run.js`. Later tasks add checks to it.

- [ ] **Step 1: Write the test**

Create `site4/tests/layout.test.js`:

```js
// Hub layout invariants the owner asked for by name: each column's instruments share one
// left and one right edge, every column header sits at the same inset, and no two HUD
// boxes overlap -- idle, and with the hostile set up. Screenshots go to tests/out/.
const path = require('path');
const { launch, check } = require('./cdp');
const SIZES = [[1920, 1080], [1440, 900], [1366, 768]];
const LEFT = ['REACTOR STATUS', 'THRUSTER VECTOR', 'SENSOR ARRAY'];
const RIGHT = ['DIAGNOSTIC MODE', 'COMBAT SYSTEM', 'HUD MODE', 'SLEW TO'];
const PROBE = `(() => {
  const vis = e => { for (let n = e; n && n !== document; n = n.parentNode) {
    if (n.hidden) return false; const cs = getComputedStyle(n);
    if (cs.display === 'none' || +cs.opacity === 0) return false; } return true; };
  const box = (name, e) => { if (!e || !vis(e)) return null; const b = e.getBoundingClientRect();
    return b.width ? { name, l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } : null; };
  const hud = document.getElementById('hud'), rectOf = g => g && g.querySelector(':scope > rect');
  const titled = g => [...g.querySelectorAll(':scope > text')].find(t => /^[A-Z][A-Z ]+$/.test(t.textContent));
  const radar = [...hud.querySelectorAll(':scope > g')].find(g => [...g.querySelectorAll('text')].some(t => t.textContent === 'SENSOR ARRAY'));
  const cols = [...hud.querySelectorAll(':scope > g.panel'), document.querySelector('.dmgmap'), radar].filter(Boolean);
  const all = [
    ...cols.map(g => box(g === radar ? 'SENSOR ARRAY' : titled(g).textContent, rectOf(g))),
    box('SLEW TO', document.getElementById('slew')), box('HUD MODE', document.getElementById('hudmode')),
    box('COMMS', document.getElementById('comms')), box('TOAST', document.getElementById('toast')),
    ...[...hud.querySelectorAll(':scope > g.hostile')].map((g, i) =>
      rectOf(g) ? box('hx:' + g.querySelector('text').textContent, rectOf(g)) : box('readouts' + i, g))
  ].filter(Boolean);
  const hits = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) hits.push(a.name + ' x ' + b.name);
  }
  const insets = cols.filter(vis).map(g => {
    const t = g === radar ? [...g.querySelectorAll('text')].find(t => t.textContent === 'SENSOR ARRAY') : titled(g);
    return Math.round(t.getBoundingClientRect().left - rectOf(g).getBoundingClientRect().left);
  });
  return JSON.stringify({ all, hits, insets });
})()`;
const edges = (all, names) => [...new Set(all.filter(b => names.includes(b.name)).map(b => b.l + '..' + b.r))];

(async () => {
  for (const [w, h] of SIZES) {
    const p = await launch({ width: w, height: h });
    await p.goto('index.html', 800);
    for (let i = 0; i < 40 && !(await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) {
      await p.key(' ', 'Space', 32); await p.sleep(150);
    }
    await p.eval("document.querySelector('[data-mode=comms]').click()");  // popups count too
    await p.sleep(1200);
    for (const state of ['idle', 'locked']) {
      if (state === 'locked') { await p.eval("BUNNYS.emit('face', {yaw:180})"); await p.sleep(2500); }
      const r = JSON.parse(await p.eval(PROBE));
      const tag = `layout ${w}x${h} ${state}:`;
      check(`${tag} no two boxes overlap`, r.hits.length === 0, r.hits.join(', '));
      check(`${tag} left column shares one edge`, edges(r.all, LEFT).length === 1, edges(r.all, LEFT).join(' | '));
      check(`${tag} right column shares one edge`, edges(r.all, RIGHT).length === 1, edges(r.all, RIGHT).join(' | '));
      check(`${tag} every column header at one inset`, new Set(r.insets).size === 1, r.insets.join(','));
      const pair = r.all.filter(b => b.name === 'hx:UNIT DATA' || b.name === 'hx:ARMAMENT DETECTED');
      if (pair.length === 2) check(`${tag} UNIT DATA and ARMAMENT share one edge`, pair[0].l === pair[1].l && pair[0].r === pair[1].r);
      await p.shot(path.join(__dirname, `out/layout-${w}-${state}.png`), false);
    }
    check(`layout ${w}x${h}: no JS errors`, p.errors.length === 0, p.errors.join(' | '));
    p.close();
  }
})();
```

- [ ] **Step 2: Add it to the runner**

In `site4/tests/run.js`, change:

```js
for (const f of ['svg.test.js', 'hub.test.js', 'pages.test.js']) {
```

to:

```js
for (const f of ['svg.test.js', 'hub.test.js', 'layout.test.js', 'pages.test.js']) {
```

- [ ] **Step 3: Run it on the current code**

Run from `site4/`: `node tests/layout.test.js`
Expected: every line reads `PASS`. The current layout meets these invariants (verified by hand on 2026-09-25), so this is a characterization test.

- [ ] **Step 4: Prove it can fail**

Temporarily add this line at the very end of `place()` in `js/hud.js`, just before its closing `}`:

```js
    if (!isPage) document.getElementById('slew').style.width = (colW - 6) + 'px';
```

Run: `node tests/layout.test.js`
Expected: `FAIL layout 1920x1080 idle: right column shares one edge` (and the same at the other sizes). Then **remove the line** and re-run to confirm all checks PASS again.

- [ ] **Step 5: Full suite and commit**

Run: `node tests/run.js` — expected: 0 FAIL.

```bash
git add site4/tests/layout.test.js site4/tests/run.js
git commit -m "site4 tests: make the column alignment and no-overlap rules a test"
```

---

### Task 2: Retire a11y-audit.js, keep its four uncovered checks

`tests/a11y-audit.js` is not in `run.js` and crashes at line 207. Six of its ten checks already live in `hub.test.js` / `pages.test.js` (readable heading, keyboard focus, arrow keys, instant boot under reduced motion, no horizontal scroll at 375px, one h1). The four that live nowhere else move into `pages.test.js`: `lang="en"`, no duplicate IDs, `#lock-status` being `aria-live="polite"`, and `svg#hud` being `aria-hidden`.

**Files:**
- Delete: `site4/tests/a11y-audit.js`
- Delete from the index: `site4/tools/__pycache__/suit_trace.cpython-311.pyc` (already git-ignored, but still tracked)
- Modify: `site4/tests/pages.test.js`

- [ ] **Step 1: Add the four checks**

In `site4/tests/pages.test.js`, insert this block immediately before the line `check('no JS errors on sub-pages', ...`:

```js
  // Folded in from the retired a11y-audit.js: the four of its checks no other test covered.
  for (const pg of ['index.html', ...PAGES]) {
    await p.goto(pg, 900);
    check(`${pg} lang="en"`, await p.eval("document.documentElement.lang === 'en'"));
    const dups = await p.eval("(()=>{const s=new Set(),d=new Set();document.querySelectorAll('[id]').forEach(e=>s.has(e.id)?d.add(e.id):s.add(e.id));return [...d].join(',')})()");
    // hangar's three inline views share part ids ON PURPOSE today: its callouts light the
    // part in every view with [id=...]. That goes with the Woundwort redraw (see the
    // cleanup plan's gated section); until then hangar is the one exception.
    check(`${pg} no duplicate ids`, pg === 'hangar.html' || dups === '', dups);
  }
  await p.goto('index.html', 900);
  check('hub #lock-status is aria-live polite', await p.eval("document.getElementById('lock-status').getAttribute('aria-live') === 'polite'"));
  check('hub svg#hud is aria-hidden', await p.eval("document.getElementById('hud').getAttribute('aria-hidden') === 'true'"));
```

- [ ] **Step 2: Run them**

Run: `node tests/pages.test.js`
Expected: all PASS. The state on 2026-09-25: index, pilot and missions have `lang=en` and 0 duplicate IDs; hangar has 10 (exempted above).

- [ ] **Step 3: Prove the ID check can fail**

Temporarily change `pg === 'hangar.html' || dups === ''` to `dups === ''`.
Run: `node tests/pages.test.js`
Expected: `FAIL hangar.html no duplicate ids` listing the part IDs. Revert the change.

- [ ] **Step 4: Delete the dead files**

```bash
git rm site4/tests/a11y-audit.js
git rm --cached site4/tools/__pycache__/suit_trace.cpython-311.pyc
```

Confirm nothing references the audit: `grep -rn "a11y-audit" site4 --include=*.js --include=*.md --include=*.html`. Expected: no output apart from this plan file.

- [ ] **Step 5: Full suite and commit**

Run: `node tests/run.js` — expected: 0 FAIL.

```bash
git add site4/tests/pages.test.js
git commit -m "site4 tests: fold a11y-audit's four uncovered checks into pages.test, drop it"
```

---

### Task 3: One `housing()` and one `header()` in hud.js

Six places build a backing plate and corner brackets by hand, and three of them also build the same header (title, rule, 12px ticks). One helper each means no box can drift from the rest, which is exactly the misalignment the owner keeps flagging. The hostile boxes are the only ones missing the 3px radius; after this task they have it too (the one intended visual change). The same task inlines three single-use formatters.

**Files:**
- Modify: `site4/js/hud.js`
- Test: `site4/tests/layout.test.js`

**Interfaces:**
- Produces, inside `hud.js`'s IIFE:
  - `housing(parent, x, y, w, h, len)` → `{ bg: SVGRectElement, size(w, h) }`. It appends a `rect.plate` (rx 3, the panel fill) plus `corners(...)` to `parent`, and `size()` re-fits both.
  - `header(parent, x0, x1, top, title)` → `ruleY` (number). It appends the title at baseline `top + G_PAD + 11`, a rule at `top + G_PAD + 20` and a 12px `tickScale`.

- [ ] **Step 1: Write the failing check**

In `site4/tests/layout.test.js`, inside the `for (const state of ...)` loop, directly after the `every column header at one inset` check, add:

```js
      const plates = JSON.parse(await p.eval("JSON.stringify([...document.querySelectorAll('#hud rect.plate')].map(r => r.getAttribute('rx') + '|' + r.getAttribute('fill')))"));
      check(`${tag} every housing is one plate style`, plates.length >= 10 && new Set(plates).size === 1, plates.length + ' plates: ' + [...new Set(plates)].join(' / '));
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/layout.test.js`
Expected: `FAIL ... every housing is one plate style  0 plates` (nothing carries the `plate` class yet).

- [ ] **Step 3: Add the helpers**

In `site4/js/hud.js`, directly after the closing `}` of `function updateCorners(g, x0, y0, w, h, len) { ... }` (around line 44), insert:

```js
  // Every HUD box stands on this: a backing plate plus corner brackets, so no box can drift
  // from the others. size() re-fits both once a box knows its real height.
  function housing(parent, x, y, w, h, len) {
    var bg = el('rect', { class: 'plate', x: x, y: y, width: w, height: h, rx: 3, fill: 'rgba(6,10,18,.97)' });
    var cn = corners(x, y, w, h, len);
    parent.appendChild(bg);
    parent.appendChild(cn);
    return { bg: bg, size: function (w2, h2) {
      bg.setAttribute('width', w2);
      bg.setAttribute('height', h2);
      updateCorners(cn, x, y, w2, h2, len);
    } };
  }
  // A column instrument's header -- title, rule, 12px ticks -- on the rhythm they all share:
  // baseline G_PAD+11 below the housing top, rule 9px under it. Returns the rule's y.
  function header(parent, x0, x1, top, title) {
    var t = el('text', { x: x0, y: top + G_PAD + 11 });
    t.textContent = title;
    parent.appendChild(t);
    var ruleY = top + G_PAD + 20;
    parent.appendChild(el('line', { x1: x0, y1: ruleY, x2: x1, y2: ruleY, opacity: .55 }));
    tickScale(parent, x0, x1, ruleY, 12);
    return ruleY;
  }
```

(`G_PAD` is declared further down, but these run only at build time, after every `var` is assigned.)

- [ ] **Step 4: Use them in buildRadar**

Replace:

```js
    var bx = -w / 2, by = -RAD - R_HEAD, headRuleY = by + G_PAD + 20;
    radar.appendChild(el('rect', { x: bx, y: by, width: w, height: h, rx: 3, fill: 'rgba(6,10,18,.97)' }));
    radar.appendChild(corners(bx, by, w, h));
    radar.appendChild(el('line', { x1: bx + G_PAD, y1: headRuleY, x2: bx + w - G_PAD, y2: headRuleY, opacity: .55 }));
    tickScale(radar, bx + G_PAD, bx + w - G_PAD, headRuleY, 12);
```

with:

```js
    var bx = -w / 2, by = -RAD - R_HEAD;
    housing(radar, bx, by, w, h);
    header(radar, bx + G_PAD, bx + w - G_PAD, by, 'SENSOR ARRAY');
```

and delete these three lines further down the same function:

```js
    var cap = el('text', { x: bx + G_PAD, y: by + G_PAD + 11 });
    cap.textContent = 'SENSOR ARRAY';
    radar.appendChild(cap);
```

- [ ] **Step 5: Use them in buildPanel**

Replace:

```js
    // header a full line below the housing edge: at the old 9px baseline the caps touched
    // the top of the box, which is what read as the text being against the edge
    var headerY = G_PAD + 11, ruleY = headerY + 9, rowsY = ruleY + 17;

    spec.bg = el('rect', { x: 0, y: 0, width: PANEL_W, height: 10, rx: 3, fill: 'rgba(6,10,18,.97)' });
    g.appendChild(spec.bg);
    spec.cn = corners(0, 0, PANEL_W, 10);
    g.appendChild(spec.cn);
    var hdr = el('text', { x: x0, y: headerY });
    hdr.textContent = spec.title;
    g.appendChild(hdr);
    g.appendChild(el('line', { x1: x0, y1: ruleY, x2: x1, y2: ruleY, opacity: .55 }));
    tickScale(g, x0, x1, ruleY, 12);
```

with:

```js
    spec.box = housing(g, 0, 0, PANEL_W, 10);
    var rowsY = header(g, x0, x1, 0, spec.title) + 17;
```

and further down, replace:

```js
    spec.bg.setAttribute('height', h);
    updateCorners(spec.cn, 0, 0, PANEL_W, h);
```

with:

```js
    spec.box.size(PANEL_W, h);
```

- [ ] **Step 6: Use them in the damage map**

In the declaration `var dmgBox, dmgBg, dmgCorners, dmgStencil, dmgArt, dmgArtTop = 0, dmgOn = false;`, replace `dmgBg, dmgCorners` with `dmgHousing`.

In `buildDamage`, replace everything from the comment `// same vertical rhythm as buildPanel:` down to and including `tickScale(dmgBox, DMG_TEXT_PAD, DMG_W - DMG_TEXT_PAD, ruleY, 12);` with:

```js
    dmgBox = el('g', { class: 'dmgmap', opacity: 0 });
    dmgHousing = housing(dmgBox, 0, 0, DMG_W, 10);
    dmgArtTop = header(dmgBox, DMG_TEXT_PAD, DMG_W - DMG_TEXT_PAD, 0, 'DIAGNOSTIC MODE') + 12;
```

In `layoutDamage`, delete `dmgBg.setAttribute('height', h);`, and replace `updateCorners(dmgCorners, 0, 0, DMG_W, h);` with `dmgHousing.size(DMG_W, h);`.

- [ ] **Step 7: Use housing in the dossier and hxBox**

Dossier: replace

```js
    dosBox = el('rect', { x: -padX, y: boxTop, width: padX * 2, height: boxBottom - boxTop, rx: 3, fill: 'rgba(6,10,18,.97)' });
    dossier.appendChild(dosBox);
    dossier.appendChild(corners(-padX, boxTop, padX * 2, boxBottom - boxTop));
```

with

```js
    dosBox = housing(dossier, -padX, boxTop, padX * 2, boxBottom - boxTop).bg;
```

hxBox: replace

```js
    g.body = el('rect', { x: -HX_PAD, y: -HX_PAD, width: w + HX_PAD * 2, height: 10,
                          fill: 'rgba(6,10,18,.97)' });
    g.appendChild(g.body);
    g.frame = corners(-HX_PAD, -HX_PAD, w + HX_PAD * 2, 10, 9);
    g.appendChild(g.frame);
```

with

```js
    g.box = housing(g, -HX_PAD, -HX_PAD, w + HX_PAD * 2, 10, 9);
```

In `hxSeal`, replace

```js
    g.body.setAttribute('height', h);
    updateCorners(g.frame, -HX_PAD, -HX_PAD, g.w + HX_PAD * 2, h, 9);
```

with `g.box.size(g.w + HX_PAD * 2, h);`. In `hxFit`, replace

```js
    g.body.setAttribute('width', need + HX_PAD * 2);
    updateCorners(g.frame, -HX_PAD, -HX_PAD, need + HX_PAD * 2, g.h, 9);
```

with `g.box.size(need + HX_PAD * 2, g.h);`.

The caution banner (`buildWarn`) is deliberately left alone: its plate is translucent (`.86`), square-cornered and resized from a centre, so it is a different object, not a housing.

- [ ] **Step 8: Inline the formatters**

Delete these four lines:

```js
  // ---------------------------------------------------------------- system gauges
  // Fictional readouts. They drift rather than sit still, so the panel reads as live.
  function fmtVector(v) { var d = (v - 0.5) * 24; return (d >= 0 ? '+' : '') + d.toFixed(0) + '°'; }
  function fmtLink(v) { return v > 0.5 ? 'LINKED' : 'STANDBY'; }
  function fmtHardpoint(v) { return Math.max(1, Math.round(v * 6)) + '/6'; }
```

and in `PANELS`, replace the three `fmt:` references:

```js
             { key: 'THR-V', base: 0.50, drift: 0.30, fmt: function (v) { var d = (v - 0.5) * 24; return (d >= 0 ? '+' : '') + d.toFixed(0) + '°'; } },
             { key: 'WPN-L', base: 0.85, drift: 0.10, fmt: function (v) { return v > 0.5 ? 'LINKED' : 'STANDBY'; } },
             { key: 'HDPT', base: 0.83, drift: 0.15, fmt: function (v) { return Math.max(1, Math.round(v * 6)) + '/6'; } }] }
```

- [ ] **Step 9: Confirm nothing still reads the old names**

Run: `grep -nE "spec\.bg|spec\.cn|dmgBg|dmgCorners|g\.body|g\.frame|headRuleY|fmtVector|fmtLink|fmtHardpoint" site4/js/hud.js`
Expected: no output. Then: `node -e "new (require('vm').Script)(require('fs').readFileSync('site4/js/hud.js','utf8'))"`. Expected: no output (the file parses).

- [ ] **Step 10: Run the tests and look at it**

Run: `node tests/layout.test.js` — expected: all PASS, including `every housing is one plate style  10 plates`.
Run: `node tests/run.js` — expected: 0 FAIL.
Open `tests/out/layout-1920-locked.png` and compare it with the same file from before this task. The only difference should be the hostile boxes' slightly rounded corners.

- [ ] **Step 11: Commit**

```bash
git add site4/js/hud.js site4/tests/layout.test.js
git commit -m "site4: build every HUD box from one housing() and one header()"
```

---

### Task 4: One bracket rule and one backing token in the CSS

**Files:**
- Modify: `site4/css/cockpit.css`
- Test: `site4/tests/layout.test.js`

- [ ] **Step 1: Write the failing check**

In `site4/tests/layout.test.js`, directly after the `every housing is one plate style` check, add:

```js
      const css = JSON.parse(await p.eval(`JSON.stringify((() => {
        const tok = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
        const bg = id => getComputedStyle(document.getElementById(id)).backgroundColor;
        const br = id => getComputedStyle(document.getElementById(id), '::before').backgroundImage;
        return { tok, same: bg('slew') === bg('hudmode') && bg('slew') === bg('comms'), brackets: br('slew') === br('comms') && br('slew') !== 'none' };
      })())`));
      check(`${tag} one --panel token and one bracket rule`, css.tok !== '' && css.same && css.brackets, JSON.stringify(css));
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tests/layout.test.js`
Expected: `FAIL ... one --panel token and one bracket rule` with `"tok":""` (the token doesn't exist yet).

- [ ] **Step 3: Add the token**

In `site4/css/cockpit.css`, inside `:root`, directly after the `--stencil: ...` line, add:

```css
  --panel: rgba(6, 10, 18, .97);       /* every housing's backing plate; hud.js housing() matches it */
```

Then replace each of the three `background: rgba(6, 10, 18, .97);` lines (in `.screen .panel:hover, .screen .panel:focus-within`, `.slew` and `.pop`) with `background: var(--panel);`.

- [ ] **Step 4: Share the bracket rule**

Change the selector line `.slew::before {` to `.slew::before, .pop::before {`, then delete the whole standalone `.pop::before { ... }` block (the one containing `--b: linear-gradient(var(--hud), var(--hud));` that comes after `.pop {`).

- [ ] **Step 5: Run the tests**

Run: `node tests/layout.test.js` — expected: all PASS. Run `node tests/run.js` — expected: 0 FAIL.
Confirm: `grep -c "rgba(6, 10, 18, .97)" site4/css/cockpit.css` prints `1` (the token itself) and `grep -c "top left / 10px 1px" site4/css/cockpit.css` prints `1`.

- [ ] **Step 6: Commit**

```bash
git add site4/css/cockpit.css site4/tests/layout.test.js
git commit -m "site4 css: one --panel token and one corner-bracket rule"
```

---

### Task 5: Comment diet: invariants stay, war stories go

`hud.js` has 255 whole-line comments, `cockpit.js` 126 and `boot.js` 26. Many narrate how a bug was found ("used to be…", "was 194…", "Task 3 left…", "the owner asked…"). That history belongs in `git log` and `DESIGN.md`, which already hold it. Comments that state an invariant, or the non-obvious reason behind a line, stay. This task touches **only whole-line comments**, so a mechanical diff can prove no code moved.

**Files:**
- Modify: `site4/js/hud.js`, `site4/js/cockpit.js`, `site4/js/boot.js`

- [ ] **Step 1: Snapshot the code with comments removed**

From the repo root:

```bash
for f in hud cockpit boot; do grep -vE '^\s*(//.*)?$' site4/js/$f.js > site4/tests/out/$f.code-before; done
grep -c '^\s*//' site4/js/hud.js site4/js/cockpit.js site4/js/boot.js
```

Write the three counts down; they are the baseline.

- [ ] **Step 2: Rewrite the whole-line comments**

Rules. Apply them to whole-line `//` comments only; leave trailing comments and code untouched:

- **Keep** anything that states an invariant or a gotcha that would bite if the code changed. Examples: *"A filter on the sphere flattens preserve-3d"*, *"hud.js writes fill into inline style, so these rules need !important"*, *"the camera must sit at the sphere's centre"*.
- **Cut** narration of the past: *used to*, *was N*, *earlier*, *old*, *before this*, *Task N*, *Part B*, *the owner asked/wants*, *first attempt*, and any comment that restates what the next line plainly does.
- **Rewrite** a war story whose lesson is an invariant as that invariant, in one line. For example:

  Before:
  ```js
  // Three panels, one builder, ONE width. This used to be a single hardcoded COMBAT
  // SYSTEM whose width fell out of its own content (204) while the damage map was 194 and
  // the slew panel 194 -- three widths across two columns, which is what made the columns
  // read as misaligned however carefully each box was positioned. PANEL_W is now the width
  // every column instrument is drawn at, and place() scales a whole column down together
  // when the gutter is too narrow for it, so the edges stay flush at every size.
  ```
  After:
  ```js
  // Every column instrument is PANEL_W wide, and place() scales a whole column together,
  // so each column keeps one edge at every size (tests/layout.test.js holds it to that).
  ```

Targets: each file's whole-line comment count at or below **60%** of its Step 1 baseline.

- [ ] **Step 3: Prove no code moved**

```bash
for f in hud cockpit boot; do grep -vE '^\s*(//.*)?$' site4/js/$f.js | diff site4/tests/out/$f.code-before - && echo "$f: code identical"; done
grep -c '^\s*//' site4/js/hud.js site4/js/cockpit.js site4/js/boot.js
```

Expected: `hud: code identical`, `cockpit: code identical` and `boot: code identical`, with no diff output, and each count at or below 60% of its baseline. If a diff appears, a code line was edited: restore it.

- [ ] **Step 4: Full suite and commit**

Run: `node tests/run.js` — expected: 0 FAIL.

```bash
git add site4/js/hud.js site4/js/cockpit.js site4/js/boot.js
git commit -m "site4: comments state invariants; the history lives in git log"
```

---

## Gated follow-up: the hangar redraw (not part of this plan's execution)

The largest cut (−420 lines of `tools/ms-gen.js`, −70KB of `img/ms/*.svg`) waits on a decision that belongs to the owner. `CLAUDE.md` records that the hangar's SL-01 three-view no longer matches the RX-124 Woundwort, and that this is *"a known follow-up, not something to silently redraw."* When the owner approves the redraw, that work should also:

1. Build the hangar views from the Woundwort mesh (`tools/gen_dmgmap.py` already projects it), not from `ms-gen.js`.
2. Mark parts with `data-part="…"` instead of repeated `id`s, and have the callouts select `[data-part="…"]`. This removes hangar's 10 duplicate IDs and lets Task 2's check drop its hangar exemption.
3. Delete `img/ms/sl01-{front,side,back}.svg`, `img/ms/decals.svg`, `tools/ms-gen.js` and the `img/ms` specs in `tests/svg.test.js`.

## Expected result

| | before | after this plan | after the gated redraw |
|---|---|---|---|
| `tests/a11y-audit.js` | 224 lines, broken, unrun | gone (4 checks kept) | gone |
| housing and header construction in `hud.js` | 6 + 3 hand-built | 1 `housing()`, 1 `header()` | same |
| whole-line comments in `hud.js` / `cockpit.js` / `boot.js` | 255 / 126 / 26 | ≤ 60% of each | same |
| backing colour in CSS / brackets rule | 3 copies / 2 copies | 1 token / 1 rule | same |
| layout rules the owner named | checked by hand | `tests/layout.test.js` | same |
| `img/ms` + `ms-gen.js` | 70KB + 420 lines | unchanged | gone |

Net: about −330 lines now, a new permanent layout test, and a further −420 lines and −70KB once the hangar is redrawn.
